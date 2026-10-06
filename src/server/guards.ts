import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { budgets, entries, finTables, lines } from "@/db/schema";

export class NotFound extends Error {}

export async function assertTable(householdId: string, tableId: string) {
  const [t] = await db
    .select({ id: finTables.id, kind: finTables.kind })
    .from(finTables)
    .where(and(eq(finTables.id, tableId), eq(finTables.householdId, householdId)));
  if (!t) throw new NotFound("Tabela não encontrada");
  return t;
}

export async function assertLine(householdId: string, lineId: string) {
  const [l] = await db
    .select({ id: lines.id, tableId: lines.tableId, isLinked: lines.isLinked, name: lines.name })
    .from(lines)
    .innerJoin(finTables, eq(finTables.id, lines.tableId))
    .where(and(eq(lines.id, lineId), eq(finTables.householdId, householdId)));
  if (!l) throw new NotFound("Linha não encontrada");
  return l;
}

export async function assertEntry(householdId: string, entryId: string) {
  const [e] = await db
    .select({
      id: entries.id,
      lineId: entries.lineId,
      seriesId: entries.seriesId,
      month: entries.month,
      amountCents: entries.amountCents,
      description: entries.description,
    })
    .from(entries)
    .innerJoin(lines, eq(lines.id, entries.lineId))
    .innerJoin(finTables, eq(finTables.id, lines.tableId))
    .where(and(eq(entries.id, entryId), eq(finTables.householdId, householdId)));
  if (!e) throw new NotFound("Lançamento não encontrado");
  return e;
}

export async function assertBudget(householdId: string, budgetId: string) {
  const [b] = await db
    .select({ id: budgets.id })
    .from(budgets)
    .where(and(eq(budgets.id, budgetId), eq(budgets.householdId, householdId)));
  if (!b) throw new NotFound("Budget não encontrado");
  return b;
}

/** Garante que todas as referências (tabelas/linhas) pertencem ao household. */
export async function assertRefs(householdId: string, refs: { refTableId: string | null; refLineId: string | null }[]) {
  const tIds = [...new Set(refs.map((r) => r.refTableId).filter(Boolean) as string[])];
  const lIds = [...new Set(refs.map((r) => r.refLineId).filter(Boolean) as string[])];
  if (tIds.length) {
    const ok = await db
      .select({ id: finTables.id })
      .from(finTables)
      .where(and(inArray(finTables.id, tIds), eq(finTables.householdId, householdId)));
    if (ok.length !== tIds.length) throw new NotFound("Tabela de origem inválida");
  }
  if (lIds.length) {
    const ok = await db
      .select({ id: lines.id })
      .from(lines)
      .innerJoin(finTables, eq(finTables.id, lines.tableId))
      .where(and(inArray(lines.id, lIds), eq(finTables.householdId, householdId)));
    if (ok.length !== lIds.length) throw new NotFound("Linha de origem inválida");
  }
}
