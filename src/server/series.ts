import "server-only";
import { and, eq, isNull, lt, or, gt, inArray } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { entries, finTables, lines, series } from "@/db/schema";
import { addMonths, monthDiff } from "@/lib/format";

export type Frequency = "once" | "monthly" | "yearly" | "installments";

/** Meses de ocorrência de uma regra, de `from` até `through` (inclusive). */
export function occurrenceMonths(
  freq: Frequency,
  start: string,
  end: string | null,
  installments: number | null,
  through: string,
  from: string = start,
): string[] {
  const out: string[] = [];
  if (freq === "once") return monthDiff(from, start) >= 0 && monthDiff(start, through) >= 0 ? [start] : [];
  if (freq === "installments") {
    const n = Math.max(1, installments ?? 1);
    for (let i = 0; i < n; i++) {
      const m = addMonths(start, i);
      if (monthDiff(from, m) >= 0) out.push(m);
    }
    return out;
  }
  const step = freq === "monthly" ? 1 : 12;
  const limit = end && monthDiff(end, through) > 0 ? end : through;
  for (let m = start; monthDiff(m, limit) >= 0; m = addMonths(m, step)) {
    if (monthDiff(from, m) >= 0) out.push(m);
  }
  return out;
}

export function lastOccurrence(freq: Frequency, start: string, end: string | null, installments: number | null, through: string) {
  const all = occurrenceMonths(freq, start, end, installments, through);
  return all[all.length - 1] ?? start;
}

/**
 * Séries sem data final são materializadas até `through`.
 * Chamado ao abrir a planilha de um ano (through = dezembro do ano seguinte).
 */
export async function extendOpenSeries(householdId: string, through: string) {
  const pending = await db
    .select({
      id: series.id,
      lineId: series.lineId,
      frequency: series.frequency,
      amountCents: series.amountCents,
      description: series.description,
      startMonth: series.startMonth,
      endMonth: series.endMonth,
      generatedThrough: series.generatedThrough,
    })
    .from(series)
    .innerJoin(lines, eq(lines.id, series.lineId))
    .innerJoin(finTables, eq(finTables.id, lines.tableId))
    .where(
      and(
        eq(finTables.householdId, householdId),
        inArray(series.frequency, ["monthly", "yearly"]),
        lt(series.generatedThrough, through),
        or(isNull(series.endMonth), gt(series.endMonth, series.generatedThrough)),
      ),
    );
  if (!pending.length) return;

  await db.transaction(async (tx) => {
    for (const s of pending) {
      const months = occurrenceMonths(
        s.frequency,
        s.startMonth,
        s.endMonth,
        null,
        through,
        addMonths(s.generatedThrough, 1),
      );
      if (months.length) {
        await tx.insert(entries).values(
          months.map((month) => ({
            lineId: s.lineId,
            seriesId: s.id,
            month,
            amountCents: s.amountCents,
            description: s.description,
          })),
        );
      }
      await tx.update(series).set({ generatedThrough: through }).where(eq(series.id, s.id));
    }
  });
}

/** Cria uma regra e suas ocorrências. */
export async function createSeriesWithEntries(
  tx: Tx,
  args: {
    lineId: string;
    frequency: Frequency;
    amountCents: number;
    description: string | null;
    startMonth: string;
    endMonth: string | null;
    installments: number | null;
    through: string;
    createdBy: string;
    source?: "manual" | "ai_text" | "ai_photo" | "ai_audio" | "import";
    /** marca a primeira ocorrência, para a fila offline não duplicar a série no reenvio */
    clientId?: string | null;
  },
) {
  const months = occurrenceMonths(args.frequency, args.startMonth, args.endMonth, args.installments, args.through);
  const generatedThrough =
    args.frequency === "monthly" || args.frequency === "yearly"
      ? args.endMonth && monthDiff(args.endMonth, args.through) > 0
        ? args.endMonth
        : args.through
      : (months[months.length - 1] ?? args.startMonth);
  const [s] = await tx
    .insert(series)
    .values({
      lineId: args.lineId,
      frequency: args.frequency,
      amountCents: args.amountCents,
      description: args.description,
      startMonth: args.startMonth,
      endMonth: args.endMonth,
      installments: args.installments,
      generatedThrough,
    })
    .returning({ id: series.id });
  if (months.length) {
    await tx.insert(entries).values(
      months.map((month, i) => ({
        lineId: args.lineId,
        seriesId: s.id,
        month,
        amountCents: args.amountCents,
        description: args.description,
        createdBy: args.createdBy,
        source: args.source ?? "manual",
        clientId: i === 0 ? (args.clientId ?? null) : null,
      })),
    );
  }
  return { seriesId: s.id, count: months.length };
}
