import { notFound } from "next/navigation";
import { requireHousehold } from "@/lib/session";
import { today } from "@/lib/format";
import { loadBudgets } from "@/server/data";
import { toLinkTables } from "@/server/link-tables";
import { BudgetForm } from "../budget-form";

export default async function EditBudgetPage({ params, searchParams }: PageProps<"/budget/[id]">) {
  const { householdId } = await requireHousehold();
  const { id } = await params;
  const sp = await searchParams;
  const t = today();
  const year = Number(sp.ano) || t.year;
  const { budgets, data } = await loadBudgets(householdId, year);
  const b = budgets.find((x) => x.id === id);
  if (!b) notFound();
  return (
    <BudgetForm
      year={year}
      curM0={year === t.year ? t.m0 : year < t.year ? 11 : -1}
      tables={toLinkTables(data)}
      initial={{
        id: b.id,
        name: b.name,
        defaultLimitCents: b.defaultLimitCents,
        alertPct: b.alertPct,
        sources: b.sources.map((s) => ({ refTableId: s.refTableId, refLineId: s.refLineId, sign: s.sign < 0 ? -1 : 1 })),
        limits: b.limits,
      }}
    />
  );
}
