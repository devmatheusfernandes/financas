import { AppShell } from "@/components/app-shell";
import { requireHousehold } from "@/lib/session";
import { aiEnabled, audioEnabled } from "@/server/ai";
import { loadStructure } from "@/server/data";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const h = await requireHousehold();
  const structure = await loadStructure(h.householdId);
  const tables = structure.tables.map((t) => ({ id: t.id, name: t.name, kind: t.kind }));
  return (
    <AppShell tables={tables} ai={aiEnabled()} audio={audioEnabled()} householdName={h.householdName}>
      {children}
    </AppShell>
  );
}
