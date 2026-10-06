import "server-only";
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { budgetLimits, budgetSources, budgets, entries, finTables, lineSources, lines } from "@/db/schema";
import { monthStr, parseMonth, zeros } from "@/lib/format";
import { evalSources, resolveGrid, type LineRow, type LineSourceRow, type TableRow } from "@/lib/grid";
import { extendOpenSeries } from "./series";

export async function loadStructure(householdId: string) {
  const tables: TableRow[] = await db
    .select({ id: finTables.id, name: finTables.name, kind: finTables.kind, color: finTables.color, sort: finTables.sort })
    .from(finTables)
    .where(eq(finTables.householdId, householdId))
    .orderBy(asc(finTables.sort), asc(finTables.name));
  const tableIds = tables.map((t) => t.id);
  const lineRows: LineRow[] = tableIds.length
    ? await db
        .select({ id: lines.id, tableId: lines.tableId, name: lines.name, isLinked: lines.isLinked, sort: lines.sort })
        .from(lines)
        .where(inArray(lines.tableId, tableIds))
        .orderBy(asc(lines.sort), asc(lines.createdAt))
    : [];
  const lineIds = lineRows.map((l) => l.id);
  const sources: LineSourceRow[] = lineIds.length
    ? await db
        .select({ lineId: lineSources.lineId, refTableId: lineSources.refTableId, refLineId: lineSources.refLineId, sign: lineSources.sign })
        .from(lineSources)
        .where(inArray(lineSources.lineId, lineIds))
    : [];
  return { tables, lines: lineRows, sources };
}

/** Planilha de um ano inteiro, já com linhas vinculadas calculadas. */
export async function loadYear(householdId: string, year: number) {
  await extendOpenSeries(householdId, monthStr(year + 1, 11));
  const structure = await loadStructure(householdId);
  const lineIds = structure.lines.map((l) => l.id);
  const raw = new Map<string, number[]>();
  const counts = new Map<string, number[]>();
  if (lineIds.length) {
    const rows = await db
      .select({
        lineId: entries.lineId,
        month: entries.month,
        total: sql<string>`sum(${entries.amountCents})`,
        n: sql<string>`count(*)`,
      })
      .from(entries)
      .where(and(inArray(entries.lineId, lineIds), gte(entries.month, monthStr(year, 0)), lte(entries.month, monthStr(year, 11))))
      .groupBy(entries.lineId, entries.month);
    for (const r of rows) {
      const { m0 } = parseMonth(r.month);
      const v = raw.get(r.lineId) ?? zeros();
      v[m0] = Number(r.total);
      raw.set(r.lineId, v);
      const c = counts.get(r.lineId) ?? zeros();
      c[m0] = Number(r.n);
      counts.set(r.lineId, c);
    }
  }
  const grid = resolveGrid(structure.tables, structure.lines, structure.sources, raw);
  return { ...structure, grid, counts };
}

export type BudgetView = {
  id: string;
  name: string;
  alertPct: number;
  defaultLimitCents: number;
  sources: { refTableId: string | null; refLineId: string | null; sign: number; label: string }[];
  limits: number[];
  spent: number[];
};

export async function loadBudgets(householdId: string, year: number, grid?: Awaited<ReturnType<typeof loadYear>>) {
  const data = grid ?? (await loadYear(householdId, year));
  const list = await db.select().from(budgets).where(eq(budgets.householdId, householdId)).orderBy(asc(budgets.sort), asc(budgets.name));
  const ids = list.map((b) => b.id);
  const srcs = ids.length ? await db.select().from(budgetSources).where(inArray(budgetSources.budgetId, ids)) : [];
  const lims = ids.length
    ? await db
        .select()
        .from(budgetLimits)
        .where(and(inArray(budgetLimits.budgetId, ids), gte(budgetLimits.month, monthStr(year, 0)), lte(budgetLimits.month, monthStr(year, 11))))
    : [];

  const tableName = new Map(data.tables.map((t) => [t.id, t.name]));
  const lineLabel = new Map(data.lines.map((l) => [l.id, `${tableName.get(l.tableId)} › ${l.name}`]));

  const views: BudgetView[] = list.map((b) => {
    const sources = srcs
      .filter((s) => s.budgetId === b.id)
      .map((s) => ({
        refTableId: s.refTableId,
        refLineId: s.refLineId,
        sign: s.sign,
        label: s.refTableId ? `Tabela ${tableName.get(s.refTableId) ?? "?"} (total)` : (lineLabel.get(s.refLineId ?? "") ?? "?"),
      }));
    const limits = zeros().map(() => b.defaultLimitCents);
    for (const l of lims.filter((x) => x.budgetId === b.id)) limits[parseMonth(l.month).m0] = l.limitCents;
    const spent = evalSources(sources, data.grid.tableTotals, data.grid.lineVals);
    return { id: b.id, name: b.name, alertPct: b.alertPct, defaultLimitCents: b.defaultLimitCents, sources, limits, spent };
  });
  return { budgets: views, data };
}
