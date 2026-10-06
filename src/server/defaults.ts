import "server-only";
import type { Tx } from "@/db";
import { finTables } from "@/db/schema";

export const COLORS = {
  in: "#2459C7",
  out: "#C2571A",
  sub: ["#6B4BB0", "#0F7C80", "#8A6410", "#3F6E2A", "#9C3F74"],
};

/** Toda planilha nova começa só com Entradas e Saídas, vazias. O resto cada usuário cria. */
export async function createDefaultTables(tx: Tx, householdId: string) {
  await tx.insert(finTables).values([
    { householdId, name: "Entradas", kind: "in", color: COLORS.in, sort: 0 },
    { householdId, name: "Saídas", kind: "out", color: COLORS.out, sort: 1 },
  ]);
}
