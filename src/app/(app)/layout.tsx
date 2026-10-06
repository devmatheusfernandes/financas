import { AppShell } from "@/components/app-shell";
import { requireHousehold } from "@/lib/session";
import { aiEnabled, audioEnabled } from "@/server/ai";
import { linePickerOptions, loadStructure } from "@/server/data";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const h = await requireHousehold();
  const structure = await loadStructure(h.householdId);
  const lines = linePickerOptions(structure).map((l) => ({ id: l.id, label: l.label }));
  return (
    <AppShell lines={lines} ai={aiEnabled()} audio={audioEnabled()} householdName={h.householdName}>
      {children}
    </AppShell>
  );
}
