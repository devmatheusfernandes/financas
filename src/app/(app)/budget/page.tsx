import { requireHousehold } from "@/lib/session";
import { today } from "@/lib/format";
import { loadBudgets } from "@/server/data";
import { BudgetView } from "./budget-view";

export default async function BudgetPage({ searchParams }: PageProps<"/budget">) {
  const { householdId } = await requireHousehold();
  const sp = await searchParams;
  const t = today();
  const year = Number(sp.ano) || t.year;
  const m0Raw = Number(sp.m);
  const m0 = Number.isInteger(m0Raw) && m0Raw >= 0 && m0Raw <= 11 ? m0Raw : year === t.year ? t.m0 : 0;
  const { budgets } = await loadBudgets(householdId, year);
  return (
    <BudgetView
      budgets={budgets.map((b) => ({ id: b.id, name: b.name, alertPct: b.alertPct, limits: b.limits, spent: b.spent, sources: b.sources.map((s) => s.label) }))}
      year={year}
      m0={m0}
      today={t}
    />
  );
}
