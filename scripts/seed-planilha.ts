/**
 * Importa a planilha "Controle Financeiro 2026" para o household de um usuário.
 *
 *   npm run seed:planilha -- --email voce@exemplo.com [--replace]
 *
 * --replace apaga as tabelas e budgets atuais do household antes de importar.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import {
  budgetLimits,
  budgetSources,
  budgets,
  entries,
  finTables,
  householdMembers,
  lineSources,
  lines,
  user,
} from "../src/db/schema";

const YEAR = 2026;
const Z = () => Array(12).fill(0) as number[];
const at = (o: Record<number, number>) => {
  const a = Z();
  for (const [k, v] of Object.entries(o)) a[Number(k)] = v;
  return a;
};
const span = (a: number, b: number, v: number) => {
  const r = Z();
  for (let i = a; i <= b; i++) r[i] = v;
  return r;
};
const month = (m0: number) => `${YEAR}-${String(m0 + 1).padStart(2, "0")}-01`;

type Row = { name: string; v?: number[]; link?: string };
type Tbl = { key: string; name: string; kind: "in" | "out" | "sub"; color: string; rows: Row[] };

const OUT_ONEOFF: [string, number][] = [
  ["Mercado Livre", 46], ["Shopee", 95.88], ["Mercado Livre", 22.03], ["Mercado Livre", 332.05],
  ["Mecânico", 710.17], ["Não lembro", 14.8], ["Confraria", 39], ["Bistrô", 20], ["Mercado", 22.23],
  ["Google One (estorno)", -24.99], ["Suely", 40.25], ["Spies", 33.21], ["The Best Açaí", 40.13],
  ["Restaurante", 15], ["Spies", 21.86], ["Pagamos", -880.7],
];

const TABLES: Tbl[] = [
  {
    key: "entradas", name: "Entradas", kind: "in", color: "#2459C7",
    rows: [
      { name: "Matheus", v: [0, 0, 0, 0, 0, 0, 7000, 7000, 7119.43, 7000, 7000, 7000] },
      { name: "Escola", v: [4738, 4738, 5000, 5000, 5000, 3724.05, 0, 1950, 2000, 1720, 1720, 2000] },
      { name: "Deise", v: [0, 0, 0, 0, 330, 1150, 1150, 1150, 1150, 2120, 2120, 0] },
      { name: "Outras receitas", v: [0, 0, 980, 880, 1550, 4959.34, 2830, 1400, 1400, 1400, 700, 0] },
      { name: "Cartão", v: at({ 9: 277.1, 10: 220 }) },
    ],
  },
  {
    key: "saidas", name: "Saídas", kind: "out", color: "#C2571A",
    rows: [
      { name: "Aluguel / Gás / Água", v: [945, 920, 908, 910, 950, 915, 900, 1021, 1034, 1033, 0, 0] },
      { name: "Luz", v: [225, 275.67, 240, 270, 215, 280, 360, 458.89, 305.99, 227.89, 0, 0] },
      { name: "Internet", v: span(0, 9, 99.9) },
      { name: "Gasolina", v: at({ 8: 200, 9: 1500, 10: 200 }) },
      { name: "Seguro carro", v: span(7, 11, 218.31) },
      { name: "MEI", v: [163, 0, 163, 163, 180, 180, 180, 173.1, 173.1, 173.1, 173.1, 173.1] },
      { name: "Plano celular", v: [80, 80, 80, 80, 80, 80, 60, 60, 60, 60, 60, 60] },
      { name: "Assinaturas", link: "assinaturas" },
      { name: "Academia", v: at({ 8: 330 }) },
      { name: "Comida / Limpeza / Higiene", v: at({ 7: 2000, 8: 2030, 10: 500 }) },
      { name: "Contador", v: Z() },
      { name: "Cartão de crédito", link: "cartao" },
      { name: "Empréstimo", v: span(9, 11, 2568.67) },
      { name: "Carro", link: "manutencoes" },
      { name: "Reservamos", v: [1164.02, 1164.02, 1164.02, 1295.82, 1295.82, 1476.82, 2185.33, 0, 3500, 2500, 5000, 5000] },
      { name: "Congresso e Assembleia", v: Z() },
      { name: "Viagem", v: at({ 8: 388.4 }) },
    ],
  },
  {
    key: "cartao", name: "Cartão de crédito", kind: "sub", color: "#6B4BB0",
    rows: [
      { name: "Fatura (sem detalhe)", v: [2717.8, 3328.18, 3255.11, 3349.28, 2747.63, 6769.1, 3588.6, 3131.2, 0, 0, 0, 0] },
      { name: "Mercado Pago", v: span(8, 11, 177.96) },
      { name: "Lurdes – Nubank", v: span(8, 11, 231.8) },
      { name: "Lurdes – Nubank (2)", v: at({ 7: 84.26, 8: 84.26 }) },
      { name: "Lurdes – Nubank (3)", v: at({ 8: 57.11, 9: 57.1 }) },
      { name: "Shopee", v: at({ 9: 386.22, 10: 386.21 }) },
      ...OUT_ONEOFF.map(([name, v]) => ({ name, v: at({ 9: v }) })),
    ],
  },
  {
    key: "assinaturas", name: "Assinaturas", kind: "sub", color: "#0F7C80",
    rows: [
      { name: "Donativos", v: span(8, 11, 150) },
      { name: "Meli+", v: at({ 8: 49.9, 9: 49.9 }) },
      { name: "Spotify", v: span(8, 11, 31.9) },
      { name: "Seguro – Deise", v: span(8, 11, 8) },
      { name: "Seguro – Matheus", v: span(8, 11, 17.93) },
      { name: "Google One", v: span(9, 11, 24.99) },
      { name: "Infra do website", v: at({ 8: 6.96, 9: 8, 10: 8, 11: 8 }) },
      { name: "Infra do Facebook", v: at({ 8: 3.85 }) },
      { name: "Domínio Fluency", v: at({ 8: 109.99 }) },
      { name: "Fluke – Matheus", v: span(8, 11, 9) },
      { name: "Fluke – Fluency", v: span(8, 11, 9) },
      { name: "Assinaturas (sem detalhe)", v: at({ 7: 280.63 }) },
    ],
  },
  {
    key: "manutencoes", name: "Manutenções e taxas", kind: "sub", color: "#8A6410",
    rows: (
      [
        ["Óleo", 224], ["Serv. óleo", 130], ["Filtro gasolina", 25], ["Filtro óleo", 28], ["Filtro ar-condicionado", 23],
        ["Filtro ar motor", 28], ["Kit correia dentada", 261], ["Serv. kit correia", 350], ["Junta tampa válvula", 35],
        ["Serv. junta", 50], ["Retentor volante", 55], ["Serv. retentor", 100], ["Serv. retirar caixa", 500],
        ["Pastilhas e discos", 220], ["Diferença não detalhada", 267.36],
      ] as [string, number][]
    ).map(([name, v]) => ({ name, v: at({ 8: v }) })),
  },
];

async function main() {
  const args = process.argv.slice(2);
  const email = args[args.indexOf("--email") + 1];
  const replace = args.includes("--replace");
  if (!email || args.indexOf("--email") < 0) throw new Error("Use: --email voce@exemplo.com");

  const [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  if (!u) throw new Error(`Usuário ${email} não encontrado. Crie a conta no app primeiro.`);
  const [m] = await db.select({ householdId: householdMembers.householdId }).from(householdMembers).where(eq(householdMembers.userId, u.id));
  if (!m) throw new Error("Esse usuário ainda não criou a planilha (onboarding).");
  const householdId = m.householdId;

  await db.transaction(async (tx) => {
    if (replace) {
      await tx.delete(budgets).where(eq(budgets.householdId, householdId));
      await tx.delete(finTables).where(eq(finTables.householdId, householdId));
    }
    const existing = await tx.select({ sort: finTables.sort }).from(finTables).where(eq(finTables.householdId, householdId));
    let sort = existing.reduce((a, b) => Math.max(a, b.sort), -1) + 1;

    const tableIds: Record<string, string> = {};
    const lineIds: Record<string, string> = {};
    const pendingLinks: { lineId: string; to: string }[] = [];

    for (const t of TABLES) {
      const [row] = await tx
        .insert(finTables)
        .values({ householdId, name: t.name, kind: t.kind, color: t.color, sort: sort++ })
        .returning({ id: finTables.id });
      tableIds[t.key] = row.id;
      let ls = 0;
      for (const r of t.rows) {
        const [l] = await tx
          .insert(lines)
          .values({ tableId: row.id, name: r.name, isLinked: !!r.link, sort: ls++ })
          .returning({ id: lines.id });
        lineIds[`${t.key}:${r.name}`] = l.id;
        if (r.link) pendingLinks.push({ lineId: l.id, to: r.link });
        const vals = (r.v ?? []).map((v, m0) => ({ v, m0 })).filter((x) => x.v !== 0);
        if (vals.length) {
          await tx.insert(entries).values(
            vals.map((x) => ({
              lineId: l.id,
              month: month(x.m0),
              amountCents: Math.round(x.v * 100),
              source: "import" as const,
              createdBy: u.id,
            })),
          );
        }
      }
    }
    for (const p of pendingLinks) await tx.insert(lineSources).values({ lineId: p.lineId, refTableId: tableIds[p.to], sign: 1 });

    // budgets de exemplo (os mesmos do design)
    const B = [
      { name: "Alimentação", limit: 2000, src: { refLineId: lineIds["saidas:Comida / Limpeza / Higiene"] } },
      { name: "Combustível", limit: 400, src: { refLineId: lineIds["saidas:Gasolina"] } },
      { name: "Luz", limit: 300, src: { refLineId: lineIds["saidas:Luz"] }, over: { 5: 350, 6: 350, 7: 350 } },
      { name: "Cartão de crédito", limit: 1200, src: { refTableId: tableIds.cartao } },
      { name: "Assinaturas", limit: 300, src: { refTableId: tableIds.assinaturas } },
    ];
    let bs = 0;
    for (const b of B) {
      const [row] = await tx
        .insert(budgets)
        .values({ householdId, name: b.name, defaultLimitCents: b.limit * 100, alertPct: 80, sort: bs++ })
        .returning({ id: budgets.id });
      await tx.insert(budgetSources).values({ budgetId: row.id, refTableId: null, refLineId: null, ...b.src, sign: 1 });
      if (b.over) {
        await tx
          .insert(budgetLimits)
          .values(Object.entries(b.over).map(([m0, v]) => ({ budgetId: row.id, month: month(Number(m0)), limitCents: v * 100 })));
      }
    }
  });

  console.log(`✓ Planilha ${YEAR} importada para ${email}${replace ? " (substituindo a anterior)" : ""}.`);
  process.exit(0);
}

main().catch((e) => {
  console.error("✗", e instanceof Error ? e.message : e);
  process.exit(1);
});
