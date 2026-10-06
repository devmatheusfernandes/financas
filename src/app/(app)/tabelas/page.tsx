import { requireHousehold } from "@/lib/session";
import { today } from "@/lib/format";
import { loadYear } from "@/server/data";
import { toLinkTables } from "@/server/link-tables";
import { TablesManager } from "./tables-manager";

export default async function TabelasPage() {
  const { householdId } = await requireHousehold();
  const t = today();
  const data = await loadYear(householdId, t.year);
  const tables = data.grid.tables.map((tb) => ({
    id: tb.id,
    name: tb.name,
    kind: tb.kind,
    color: tb.color,
    lines: tb.lines.map((l) => ({
      id: l.id,
      name: l.name,
      isLinked: l.isLinked,
      sources: l.sources.map((s) => ({ refTableId: s.refTableId, refLineId: s.refLineId, sign: (s.sign < 0 ? -1 : 1) as 1 | -1 })),
    })),
  }));
  return <TablesManager tables={tables} linkTables={toLinkTables(data)} curM0={t.m0} />;
}
