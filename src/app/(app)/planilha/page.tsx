import { requireHousehold } from "@/lib/session";
import { parsePeriod } from "@/lib/period";
import { loadYear } from "@/server/data";
import { SheetView, type SheetData } from "./sheet-view";

export default async function PlanilhaPage({ searchParams }: PageProps<"/planilha">) {
  const { householdId } = await requireHousehold();
  const sp = await searchParams;
  const period = parsePeriod(sp);
  const view = sp.v === "simples" ? "simples" : "completa";
  const data = await loadYear(householdId, period.year);

  const tableName = new Map(data.tables.map((t) => [t.id, t.name]));
  const lineName = new Map(data.lines.map((l) => [l.id, `${tableName.get(l.tableId)} › ${l.name}`]));

  const sheet: SheetData = {
    tables: data.grid.tables.map((t) => ({
      id: t.id,
      name: t.name,
      kind: t.kind,
      color: t.color,
      sum: t.sum,
      lines: t.lines.map((l) => ({
        id: l.id,
        name: l.name,
        isLinked: l.isLinked,
        vals: l.vals,
        counts: data.counts.get(l.id) ?? Array(12).fill(0),
        sources: l.sources.map((s) => ({
          refTableId: s.refTableId,
          refLineId: s.refLineId,
          sign: s.sign,
          label: s.refTableId ? `${tableName.get(s.refTableId) ?? "?"} (total)` : (lineName.get(s.refLineId ?? "") ?? "?"),
        })),
      })),
    })),
    income: data.grid.income,
    expense: data.grid.expense,
    balance: data.grid.balance,
  };

  return <SheetView data={sheet} period={period} view={view} />;
}
