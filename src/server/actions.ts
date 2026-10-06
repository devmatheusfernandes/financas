"use server";

import { randomBytes } from "node:crypto";
import { and, asc, eq, gte, lt, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import {
  budgetLimits,
  budgetSources,
  budgets,
  entries,
  finTables,
  householdMembers,
  households,
  lineSources,
  lines,
  series,
} from "@/db/schema";
import { addMonths, monthDiff, monthStr, parseCents, parseMonth, today } from "@/lib/format";
import { wouldCreateCycle } from "@/lib/grid";
import { getMembership, requireHousehold, requireUser } from "@/lib/session";
import { loadBudgets, loadStructure } from "./data";
import { COLORS, createDefaultTables } from "./defaults";
import { assertBudget, assertEntry, assertLine, assertRefs, assertTable, NotFound } from "./guards";
import { createSeriesWithEntries } from "./series";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof NotFound) return { ok: false, error: e.message };
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Dados inválidos" };
  console.error(e);
  return { ok: false, error: "Algo deu errado. Tente de novo." };
}

function refresh() {
  revalidatePath("/", "layout");
}

const monthSchema = z.string().regex(/^\d{4}-\d{2}-01$/, "Mês inválido");
const sourceSchema = z
  .object({
    refTableId: z.string().uuid().nullable(),
    refLineId: z.string().uuid().nullable(),
    sign: z.union([z.literal(1), z.literal(-1)]),
  })
  .refine((s) => !!s.refTableId !== !!s.refLineId, "Cada origem precisa ser uma tabela OU uma linha");

/* ================================================================== */
/* Household / convite                                                 */
/* ================================================================== */

export async function createHousehold(formData: FormData) {
  const u = await requireUser();
  if (await getMembership(u.id)) redirect("/planilha");
  const name = String(formData.get("name") || "").trim() || "Nossas finanças";
  await db.transaction(async (tx) => {
    const [h] = await tx
      .insert(households)
      .values({ name, inviteToken: randomBytes(18).toString("base64url") })
      .returning({ id: households.id });
    await tx.insert(householdMembers).values({ householdId: h.id, userId: u.id, role: "owner" });
    await createDefaultTables(tx, h.id);
  });
  redirect("/planilha");
}

export async function joinHousehold(formData: FormData) {
  const u = await requireUser();
  const token = String(formData.get("token") || "");
  if (await getMembership(u.id)) redirect("/planilha");
  const [h] = await db.select({ id: households.id }).from(households).where(eq(households.inviteToken, token));
  if (!h) redirect("/onboarding?convite=invalido");
  await db.insert(householdMembers).values({ householdId: h.id, userId: u.id, role: "member" }).onConflictDoNothing();
  redirect("/planilha");
}

export async function regenerateInvite(): Promise<Result<{ token: string }>> {
  try {
    const { householdId } = await requireHousehold();
    const token = randomBytes(18).toString("base64url");
    await db.update(households).set({ inviteToken: token }).where(eq(households.id, householdId));
    refresh();
    return { ok: true, token };
  } catch (e) {
    return fail(e);
  }
}

export async function renameHousehold(name: string): Promise<Result> {
  try {
    const { householdId } = await requireHousehold();
    await db.update(households).set({ name: z.string().trim().min(1).max(80).parse(name) }).where(eq(households.id, householdId));
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* ================================================================== */
/* Lançamentos                                                         */
/* ================================================================== */

const createEntrySchema = z.object({
  lineId: z.string().uuid(),
  amount: z.string(),
  description: z.string().trim().max(200).optional().default(""),
  month: monthSchema,
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  frequency: z.enum(["once", "monthly", "yearly", "installments"]),
  endMonth: monthSchema.nullable().optional(),
  installments: z.coerce.number().int().min(1).max(120).nullable().optional(),
  source: z.enum(["manual", "ai_text", "ai_photo", "ai_audio"]).optional().default("manual"),
});

export async function createEntry(input: z.input<typeof createEntrySchema>): Promise<Result<{ count: number }>> {
  try {
    const { householdId, userId } = await requireHousehold();
    const d = createEntrySchema.parse(input);
    const line = await assertLine(householdId, d.lineId);
    if (line.isLinked) return { ok: false, error: "Essa linha é calculada por vínculo. Lance o valor numa das origens." };
    const amountCents = parseCents(d.amount);
    if (!amountCents) return { ok: false, error: "Informe um valor" };
    if (d.endMonth && monthDiff(d.month, d.endMonth) < 0) return { ok: false, error: "O mês final é antes do inicial" };

    if (d.frequency === "once") {
      await db.insert(entries).values({
        lineId: d.lineId,
        month: d.month,
        amountCents,
        description: d.description || null,
        occurredOn: d.occurredOn ?? null,
        source: d.source,
        createdBy: userId,
      });
      refresh();
      return { ok: true, count: 1 };
    }
    const { year } = parseMonth(d.month);
    const through = monthStr(Math.max(year, today().year) + 1, 11);
    const r = await db.transaction((tx) =>
      createSeriesWithEntries(tx, {
        lineId: d.lineId,
        frequency: d.frequency,
        amountCents,
        description: d.description || null,
        startMonth: d.month,
        endMonth: d.frequency === "monthly" || d.frequency === "yearly" ? (d.endMonth ?? null) : null,
        installments: d.frequency === "installments" ? (d.installments ?? 2) : null,
        through,
        createdBy: userId,
      }),
    );
    refresh();
    return { ok: true, count: r.count };
  } catch (e) {
    return fail(e);
  }
}

const addTransactionSchema = z.object({
  tableId: z.string().uuid(),
  name: z.string().trim().min(1, "Dê um nome ao lançamento").max(80),
  amount: z.string(),
  month: monthSchema,
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  source: z.enum(["manual", "ai_text", "ai_photo", "ai_audio"]).optional().default("manual"),
  /** vem da fila offline; reenviar o mesmo id não cria um segundo lançamento */
  clientId: z.string().uuid().nullable().optional(),
  /** pontual ou repetido; igual ao painel de célula */
  frequency: z.enum(["once", "monthly", "yearly", "installments"]).optional().default("once"),
  endMonth: monthSchema.nullable().optional(),
  installments: z.coerce.number().int().min(1).max(120).nullable().optional(),
});

/**
 * Cada lançamento rápido vira uma linha nova na tabela escolhida.
 * Pontual gera um lançamento só; repetido gera a regra e as ocorrências de cada mês.
 */
export async function addTransaction(
  input: z.input<typeof addTransactionSchema>,
): Promise<Result<{ lineId: string; count: number }>> {
  try {
    const { householdId, userId } = await requireHousehold();
    const d = addTransactionSchema.parse(input);
    await assertTable(householdId, d.tableId);
    const amountCents = parseCents(d.amount);
    if (!amountCents) return { ok: false, error: "Informe um valor" };

    if (d.endMonth && monthDiff(d.month, d.endMonth) < 0) return { ok: false, error: "O mês final é antes do inicial" };

    if (d.clientId) {
      const [ja] = await db.select({ lineId: entries.lineId }).from(entries).where(eq(entries.clientId, d.clientId));
      if (ja) return { ok: true, lineId: ja.lineId, count: 0 }; // já tinha chegado antes
    }

    const { year } = parseMonth(d.month);
    const through = monthStr(Math.max(year, today().year) + 1, 11);

    const r = await db.transaction(async (tx) => {
      const [{ maxSort }] = await tx.select({ maxSort: max(lines.sort) }).from(lines).where(eq(lines.tableId, d.tableId));
      const [l] = await tx
        .insert(lines)
        .values({ tableId: d.tableId, name: d.name, sort: (maxSort ?? 0) + 1 })
        .returning({ id: lines.id });

      if (d.frequency === "once") {
        await tx.insert(entries).values({
          lineId: l.id,
          month: d.month,
          amountCents,
          description: d.name,
          occurredOn: d.occurredOn ?? null,
          source: d.source,
          clientId: d.clientId ?? null,
          createdBy: userId,
        });
        return { lineId: l.id, count: 1 };
      }

      const s = await createSeriesWithEntries(tx, {
        lineId: l.id,
        frequency: d.frequency,
        amountCents,
        description: d.name,
        startMonth: d.month,
        endMonth: d.frequency === "monthly" || d.frequency === "yearly" ? (d.endMonth ?? null) : null,
        installments: d.frequency === "installments" ? (d.installments ?? 2) : null,
        through,
        createdBy: userId,
        source: d.source,
        clientId: d.clientId ?? null,
      });
      return { lineId: l.id, count: s.count };
    });
    refresh();
    return { ok: true, ...r };
  } catch (e) {
    return fail(e);
  }
}

export type CellEntry = {
  id: string;
  amountCents: number;
  description: string | null;
  occurredOn: string | null;
  source: string;
  series: null | {
    id: string;
    frequency: "once" | "monthly" | "yearly" | "installments";
    startMonth: string;
    endMonth: string | null;
    installments: number | null;
    occurrence: number;
    total: number | null;
  };
};

/** Lançamentos de uma célula (linha × mês). */
export async function getCellEntries(lineId: string, month: string): Promise<Result<{ entries: CellEntry[] }>> {
  try {
    const { householdId } = await requireHousehold();
    await assertLine(householdId, lineId);
    monthSchema.parse(month);
    const rows = await db
      .select({
        id: entries.id,
        amountCents: entries.amountCents,
        description: entries.description,
        occurredOn: entries.occurredOn,
        source: entries.source,
        seriesId: entries.seriesId,
        frequency: series.frequency,
        startMonth: series.startMonth,
        endMonth: series.endMonth,
        installments: series.installments,
      })
      .from(entries)
      .leftJoin(series, eq(series.id, entries.seriesId))
      .where(and(eq(entries.lineId, lineId), eq(entries.month, month)))
      .orderBy(asc(entries.createdAt));

    const out: CellEntry[] = rows.map((r) => {
      if (!r.seriesId || !r.frequency || !r.startMonth) {
        return { id: r.id, amountCents: r.amountCents, description: r.description, occurredOn: r.occurredOn, source: r.source, series: null };
      }
      const step = r.frequency === "yearly" ? 12 : 1;
      const occurrence = Math.floor(monthDiff(r.startMonth, month) / step) + 1;
      let total: number | null = null;
      if (r.frequency === "installments") total = r.installments;
      else if (r.endMonth) total = Math.floor(monthDiff(r.startMonth, r.endMonth) / step) + 1;
      return {
        id: r.id,
        amountCents: r.amountCents,
        description: r.description,
        occurredOn: r.occurredOn,
        source: r.source,
        series: {
          id: r.seriesId,
          frequency: r.frequency,
          startMonth: r.startMonth,
          endMonth: r.endMonth,
          installments: r.installments,
          occurrence,
          total,
        },
      };
    });
    return { ok: true, entries: out };
  } catch (e) {
    return fail(e);
  }
}

const scopeSchema = z.enum(["one", "next", "all"]);

export async function updateEntry(input: {
  entryId: string;
  amount: string;
  description: string;
  lineId?: string;
  scope: "one" | "next" | "all";
}): Promise<Result<{ count: number }>> {
  try {
    const { householdId } = await requireHousehold();
    const scope = scopeSchema.parse(input.scope);
    const e = await assertEntry(householdId, input.entryId);
    const amountCents = parseCents(input.amount);
    if (!amountCents) return { ok: false, error: "Informe um valor" };
    const description = input.description.trim() || null;
    let newLineId = e.lineId;
    if (input.lineId && input.lineId !== e.lineId) {
      const target = await assertLine(householdId, input.lineId);
      if (target.isLinked) return { ok: false, error: "Não dá para mover para uma linha vinculada" };
      newLineId = target.id;
    }

    let count = 1;
    await db.transaction(async (tx) => {
      if (scope === "one" || !e.seriesId) {
        await tx.update(entries).set({ amountCents, description, lineId: newLineId }).where(eq(entries.id, e.id));
        return;
      }
      const [s] = await tx.select().from(series).where(eq(series.id, e.seriesId));
      if (scope === "all") {
        await tx.update(series).set({ amountCents, description, lineId: newLineId }).where(eq(series.id, s.id));
        const r = await tx
          .update(entries)
          .set({ amountCents, description, lineId: newLineId })
          .where(eq(entries.seriesId, s.id))
          .returning({ id: entries.id });
        count = r.length;
        return;
      }
      // "este e os próximos": divide a série em duas
      if (monthDiff(s.startMonth, e.month) <= 0) {
        await tx.update(series).set({ amountCents, description, lineId: newLineId }).where(eq(series.id, s.id));
        const r = await tx
          .update(entries)
          .set({ amountCents, description, lineId: newLineId })
          .where(eq(entries.seriesId, s.id))
          .returning({ id: entries.id });
        count = r.length;
        return;
      }
      const usedBefore = monthDiff(s.startMonth, e.month);
      const [ns] = await tx
        .insert(series)
        .values({
          lineId: newLineId,
          frequency: s.frequency,
          amountCents,
          description,
          startMonth: e.month,
          endMonth: s.endMonth,
          installments: s.frequency === "installments" && s.installments ? Math.max(1, s.installments - usedBefore) : null,
          generatedThrough: s.generatedThrough,
        })
        .returning({ id: series.id });
      const prevEnd = addMonths(e.month, -1);
      await tx
        .update(series)
        .set({
          endMonth: s.frequency === "installments" ? s.endMonth : prevEnd,
          installments: s.frequency === "installments" ? usedBefore : s.installments,
          generatedThrough: s.frequency === "installments" ? prevEnd : s.generatedThrough,
        })
        .where(eq(series.id, s.id));
      const r = await tx
        .update(entries)
        .set({ amountCents, description, lineId: newLineId, seriesId: ns.id })
        .where(and(eq(entries.seriesId, s.id), gte(entries.month, e.month)))
        .returning({ id: entries.id });
      count = r.length;
    });
    refresh();
    return { ok: true, count };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteEntry(input: { entryId: string; scope: "one" | "next" | "all" }): Promise<Result<{ count: number }>> {
  try {
    const { householdId } = await requireHousehold();
    const scope = scopeSchema.parse(input.scope);
    const e = await assertEntry(householdId, input.entryId);
    let count = 1;
    await db.transaction(async (tx) => {
      if (scope === "one" || !e.seriesId) {
        await tx.delete(entries).where(eq(entries.id, e.id));
        return;
      }
      const [s] = await tx.select().from(series).where(eq(series.id, e.seriesId));
      if (scope === "all" || monthDiff(s.startMonth, e.month) <= 0) {
        const r = await tx.delete(entries).where(eq(entries.seriesId, s.id)).returning({ id: entries.id });
        count = r.length;
        await tx.delete(series).where(eq(series.id, s.id));
        return;
      }
      const r = await tx
        .delete(entries)
        .where(and(eq(entries.seriesId, s.id), gte(entries.month, e.month)))
        .returning({ id: entries.id });
      count = r.length;
      const prevEnd = addMonths(e.month, -1);
      await tx
        .update(series)
        .set({
          endMonth: prevEnd,
          generatedThrough: prevEnd,
          installments: s.frequency === "installments" ? monthDiff(s.startMonth, e.month) : s.installments,
        })
        .where(eq(series.id, s.id));
    });
    refresh();
    return { ok: true, count };
  } catch (e) {
    return fail(e);
  }
}

/* ================================================================== */
/* Tabelas e linhas                                                    */
/* ================================================================== */

export async function createTable(input: { name: string; kind: "in" | "out" | "sub"; color?: string }): Promise<Result<{ id: string }>> {
  try {
    const { householdId } = await requireHousehold();
    const name = z.string().trim().min(1, "Dê um nome à tabela").max(60).parse(input.name);
    const kind = z.enum(["in", "out", "sub"]).parse(input.kind);
    const [{ maxSort }] = await db.select({ maxSort: max(finTables.sort) }).from(finTables).where(eq(finTables.householdId, householdId));
    const existing = await db.select({ id: finTables.id }).from(finTables).where(eq(finTables.householdId, householdId));
    const color =
      input.color && /^#[0-9a-fA-F]{6}$/.test(input.color)
        ? input.color
        : kind === "in"
          ? COLORS.in
          : kind === "out"
            ? COLORS.out
            : COLORS.sub[existing.length % COLORS.sub.length];
    const [t] = await db
      .insert(finTables)
      .values({ householdId, name, kind, color, sort: (maxSort ?? 0) + 1 })
      .returning({ id: finTables.id });
    refresh();
    return { ok: true, id: t.id };
  } catch (e) {
    return fail(e);
  }
}

export async function updateTable(input: { tableId: string; name: string; color: string; kind: "in" | "out" | "sub" }): Promise<Result> {
  try {
    const { householdId } = await requireHousehold();
    await assertTable(householdId, input.tableId);
    await db
      .update(finTables)
      .set({
        name: z.string().trim().min(1).max(60).parse(input.name),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).parse(input.color),
        kind: z.enum(["in", "out", "sub"]).parse(input.kind),
      })
      .where(eq(finTables.id, input.tableId));
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function moveTable(tableId: string, dir: -1 | 1): Promise<Result> {
  try {
    const { householdId } = await requireHousehold();
    const all = await db
      .select({ id: finTables.id })
      .from(finTables)
      .where(eq(finTables.householdId, householdId))
      .orderBy(asc(finTables.sort), asc(finTables.name));
    const i = all.findIndex((t) => t.id === tableId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= all.length) return { ok: true };
    [all[i], all[j]] = [all[j], all[i]];
    await db.transaction(async (tx) => {
      for (let k = 0; k < all.length; k++) await tx.update(finTables).set({ sort: k }).where(eq(finTables.id, all[k].id));
    });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteTable(tableId: string): Promise<Result> {
  try {
    const { householdId } = await requireHousehold();
    await assertTable(householdId, tableId);
    await db.delete(finTables).where(eq(finTables.id, tableId));
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

type SourceInput = z.input<typeof sourceSchema>;

async function checkSources(householdId: string, lineId: string | null, tableId: string, srcs: SourceInput[]) {
  const parsed = z.array(sourceSchema).parse(srcs);
  await assertRefs(householdId, parsed);
  if (parsed.some((s) => s.refTableId === tableId)) throw new NotFound("Uma linha não pode somar a própria tabela");
  const st = await loadStructure(householdId);
  const fakeId = lineId ?? "00000000-0000-0000-0000-000000000000";
  const linesForCheck = lineId ? st.lines : [...st.lines, { id: fakeId, tableId, name: "", isLinked: true, sort: 0 }];
  if (wouldCreateCycle(fakeId, parsed, linesForCheck, st.sources)) {
    throw new NotFound("Esse vínculo cria um ciclo (uma linha acabaria dependendo dela mesma)");
  }
  return parsed;
}

export async function createLine(input: {
  tableId: string;
  name: string;
  isLinked?: boolean;
  sources?: SourceInput[];
}): Promise<Result<{ id: string }>> {
  try {
    const { householdId } = await requireHousehold();
    await assertTable(householdId, input.tableId);
    const name = z.string().trim().min(1, "Dê um nome à linha").max(80).parse(input.name);
    const srcs = input.isLinked ? await checkSources(householdId, null, input.tableId, input.sources ?? []) : [];
    const [{ maxSort }] = await db.select({ maxSort: max(lines.sort) }).from(lines).where(eq(lines.tableId, input.tableId));
    const id = await db.transaction(async (tx) => {
      const [l] = await tx
        .insert(lines)
        .values({ tableId: input.tableId, name, isLinked: !!input.isLinked, sort: (maxSort ?? 0) + 1 })
        .returning({ id: lines.id });
      if (srcs.length) await tx.insert(lineSources).values(srcs.map((s) => ({ ...s, lineId: l.id })));
      return l.id;
    });
    refresh();
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

export async function renameLine(lineId: string, name: string): Promise<Result> {
  try {
    const { householdId } = await requireHousehold();
    await assertLine(householdId, lineId);
    await db.update(lines).set({ name: z.string().trim().min(1).max(80).parse(name) }).where(eq(lines.id, lineId));
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function moveLine(lineId: string, dir: -1 | 1): Promise<Result> {
  try {
    const { householdId } = await requireHousehold();
    const l = await assertLine(householdId, lineId);
    const all = await db
      .select({ id: lines.id })
      .from(lines)
      .where(eq(lines.tableId, l.tableId))
      .orderBy(asc(lines.sort), asc(lines.createdAt));
    const i = all.findIndex((x) => x.id === lineId);
    const j = i + dir;
    if (j < 0 || j >= all.length) return { ok: true };
    [all[i], all[j]] = [all[j], all[i]];
    await db.transaction(async (tx) => {
      for (let k = 0; k < all.length; k++) await tx.update(lines).set({ sort: k }).where(eq(lines.id, all[k].id));
    });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteLine(lineId: string): Promise<Result> {
  try {
    const { householdId } = await requireHousehold();
    await assertLine(householdId, lineId);
    await db.delete(lines).where(eq(lines.id, lineId));
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Define a origem do valor de uma linha.
 * - mode "linked": substitui as origens (checa ciclo). Lançamentos existentes são mantidos mas ignorados.
 * - mode "fixed": remove o vínculo; a linha volta a usar os próprios lançamentos.
 */
export async function setLineMode(input: { lineId: string; mode: "fixed" | "linked"; sources?: SourceInput[] }): Promise<Result> {
  try {
    const { householdId } = await requireHousehold();
    const l = await assertLine(householdId, input.lineId);
    if (input.mode === "fixed") {
      await db.transaction(async (tx) => {
        await tx.delete(lineSources).where(eq(lineSources.lineId, l.id));
        await tx.update(lines).set({ isLinked: false }).where(eq(lines.id, l.id));
      });
    } else {
      const srcs = await checkSources(householdId, l.id, l.tableId, input.sources ?? []);
      await db.transaction(async (tx) => {
        await tx.delete(lineSources).where(eq(lineSources.lineId, l.id));
        if (srcs.length) await tx.insert(lineSources).values(srcs.map((s) => ({ ...s, lineId: l.id })));
        await tx.update(lines).set({ isLinked: true }).where(eq(lines.id, l.id));
      });
    }
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* ================================================================== */
/* Budgets                                                             */
/* ================================================================== */

const budgetSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Dê um nome ao budget").max(60),
  defaultLimit: z.string(),
  alertPct: z.coerce.number().int().min(1).max(100),
  year: z.coerce.number().int().min(2000).max(2100),
  /** 12 valores; vazio = usa o padrão */
  monthLimits: z.array(z.string()).length(12),
  sources: z.array(sourceSchema).min(1, "Escolha pelo menos uma linha ou tabela"),
});

export async function saveBudget(input: z.input<typeof budgetSchema>): Promise<Result<{ id: string }>> {
  try {
    const { householdId } = await requireHousehold();
    const d = budgetSchema.parse(input);
    if (d.id) await assertBudget(householdId, d.id);
    await assertRefs(householdId, d.sources);
    const defaultLimitCents = parseCents(d.defaultLimit);
    if (defaultLimitCents <= 0) return { ok: false, error: "Informe o limite mensal" };

    const id = await db.transaction(async (tx) => {
      let budgetId = d.id;
      if (budgetId) {
        await tx.update(budgets).set({ name: d.name, defaultLimitCents, alertPct: d.alertPct }).where(eq(budgets.id, budgetId));
        await tx.delete(budgetSources).where(eq(budgetSources.budgetId, budgetId));
      } else {
        const [b] = await tx
          .insert(budgets)
          .values({ householdId, name: d.name, defaultLimitCents, alertPct: d.alertPct })
          .returning({ id: budgets.id });
        budgetId = b.id;
      }
      await tx.insert(budgetSources).values(d.sources.map((s) => ({ ...s, budgetId: budgetId! })));
      await tx
        .delete(budgetLimits)
        .where(
          and(
            eq(budgetLimits.budgetId, budgetId),
            gte(budgetLimits.month, monthStr(d.year, 0)),
            lt(budgetLimits.month, monthStr(d.year + 1, 0)),
          ),
        );
      const overrides = d.monthLimits
        .map((v, m0) => ({ m0, cents: v.trim() ? parseCents(v) : null }))
        .filter((x) => x.cents !== null && x.cents !== defaultLimitCents);
      if (overrides.length) {
        await tx
          .insert(budgetLimits)
          .values(overrides.map((o) => ({ budgetId: budgetId!, month: monthStr(d.year, o.m0), limitCents: o.cents! })));
      }
      return budgetId;
    });
    refresh();
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteBudget(budgetId: string): Promise<Result> {
  try {
    const { householdId } = await requireHousehold();
    await assertBudget(householdId, budgetId);
    await db.delete(budgets).where(eq(budgets.id, budgetId));
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export type BudgetImpact = { name: string; limitCents: number; spentCents: number; alertPct: number; sign: number };

/** Quais budgets um novo lançamento nesta tabela afeta (para mostrar no "Adicionar rápido"). */
export async function budgetImpact(tableId: string, month: string): Promise<Result<{ impacts: BudgetImpact[] }>> {
  try {
    const { householdId } = await requireHousehold();
    await assertTable(householdId, tableId);
    const { year, m0 } = parseMonth(monthSchema.parse(month));
    const { budgets: list, data } = await loadBudgets(householdId, year);

    // efeito de +1 centavo numa linha nova desta tabela em cada budget (considera vínculos encadeados)
    const affects = (refTableId: string | null, refLineId: string | null): number => {
      const seen = new Set<string>();
      const walkLine = (lid: string): number => {
        if (seen.has("L" + lid)) return 0;
        seen.add("L" + lid);
        const l = data.lines.find((x) => x.id === lid);
        if (!l?.isLinked) return 0;
        return data.sources
          .filter((s) => s.lineId === lid)
          .reduce((acc, s) => acc + s.sign * (s.refTableId ? walkTable(s.refTableId) : walkLine(s.refLineId!)), 0);
      };
      const walkTable = (tid: string): number => {
        if (tid === tableId) return 1;
        if (seen.has("T" + tid)) return 0;
        seen.add("T" + tid);
        return data.lines.filter((l) => l.tableId === tid).reduce((acc, l) => acc + walkLine(l.id), 0);
      };
      return refTableId ? walkTable(refTableId) : walkLine(refLineId!);
    };

    const impacts: BudgetImpact[] = [];
    for (const b of list) {
      const sign = b.sources.reduce((acc, s) => acc + s.sign * affects(s.refTableId, s.refLineId), 0);
      if (sign) impacts.push({ name: b.name, limitCents: b.limits[m0], spentCents: b.spent[m0], alertPct: b.alertPct, sign });
    }
    return { ok: true, impacts };
  } catch (e) {
    return fail(e);
  }
}

/** Média mensal de uma origem nos meses com valor (para sugerir limite). */
export async function suggestLimit(sources: SourceInput[], year: number): Promise<Result<{ avgCents: number; months: number }>> {
  try {
    const { householdId } = await requireHousehold();
    const parsed = z.array(sourceSchema).parse(sources);
    await assertRefs(householdId, parsed);
    const { data } = await loadBudgets(householdId, year);
    const { evalSources } = await import("@/lib/grid");
    const v = evalSources(parsed, data.grid.tableTotals, data.grid.lineVals);
    const t = today();
    const lastM = year < t.year ? 11 : year > t.year ? -1 : t.m0;
    const used = v.slice(0, lastM + 1).filter((x) => x > 0);
    const avg = used.length ? Math.round(used.reduce((a, b) => a + b, 0) / used.length) : 0;
    return { ok: true, avgCents: avg, months: used.length };
  } catch (e) {
    return fail(e);
  }
}
