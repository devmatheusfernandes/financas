import "server-only";
import type { Tx } from "@/db";
import { finTables, lineSources, lines } from "@/db/schema";

export const COLORS = {
  in: "#2459C7",
  out: "#C2571A",
  sub: ["#6B4BB0", "#0F7C80", "#8A6410", "#3F6E2A", "#9C3F74"],
};

/** Estrutura inicial: Entradas, Saídas e Cartão de crédito vinculado às Saídas. */
export async function createDefaultTables(tx: Tx, householdId: string) {
  const [entradas, saidas, cartao] = await tx
    .insert(finTables)
    .values([
      { householdId, name: "Entradas", kind: "in", color: COLORS.in, sort: 0 },
      { householdId, name: "Saídas", kind: "out", color: COLORS.out, sort: 1 },
      { householdId, name: "Cartão de crédito", kind: "sub", color: COLORS.sub[0], sort: 2 },
    ])
    .returning({ id: finTables.id });

  await tx.insert(lines).values([
    { tableId: entradas.id, name: "Meu salário", sort: 0 },
    { tableId: entradas.id, name: "Salário da esposa", sort: 1 },
    { tableId: entradas.id, name: "Outras entradas (minhas)", sort: 2 },
    { tableId: entradas.id, name: "Outras entradas (esposa)", sort: 3 },
    { tableId: saidas.id, name: "Aluguel", sort: 0 },
    { tableId: saidas.id, name: "Energia", sort: 1 },
    { tableId: saidas.id, name: "Internet", sort: 2 },
    { tableId: saidas.id, name: "Alimentação", sort: 3 },
  ]);
  const [cc] = await tx
    .insert(lines)
    .values({ tableId: saidas.id, name: "Cartão de crédito", isLinked: true, sort: 4 })
    .returning({ id: lines.id });
  await tx.insert(lineSources).values({ lineId: cc.id, refTableId: cartao.id, sign: 1 });
}
