import { requireHousehold } from "@/lib/session";
import { today } from "@/lib/format";
import { loadYear } from "@/server/data";
import { toLinkTables } from "@/server/link-tables";
import { BudgetForm } from "../budget-form";

export default async function NewBudgetPage({ searchParams }: PageProps<"/budget/novo">) {
  const { householdId } = await requireHousehold();
  const sp = await searchParams;
  const t = today();
  const year = Number(sp.ano) || t.year;
  const data = await loadYear(householdId, year);
  const tables = toLinkTables(data);
  const firstOut = data.grid.tables.find((x) => x.kind === "out")?.lines.find((l) => !l.isLinked);
  return (
    <BudgetForm
      year={year}
      curM0={year === t.year ? t.m0 : year < t.year ? 11 : -1}
      tables={tables}
      initial={{
        name: firstOut?.name ?? "",
        defaultLimitCents: 0,
        alertPct: 80,
        sources: firstOut ? [{ refTableId: null, refLineId: firstOut.id, sign: 1 }] : [],
        limits: Array(12).fill(0),
      }}
    />
  );
}
