import { zeros } from "./format";

export type TableKind = "in" | "out" | "sub";

export type TableRow = { id: string; name: string; kind: TableKind; color: string; sort: number };
export type LineRow = { id: string; tableId: string; name: string; isLinked: boolean; sort: number };
export type SourceRow = { refTableId: string | null; refLineId: string | null; sign: number };
export type LineSourceRow = SourceRow & { lineId: string };

export type ResolvedLine = LineRow & { vals: number[]; sources: SourceRow[] };
export type ResolvedTable = TableRow & { lines: ResolvedLine[]; sum: number[] };

export type Resolved = {
  tables: ResolvedTable[];
  byId: Map<string, ResolvedTable>;
  lineVals: Map<string, number[]>;
  tableTotals: Map<string, number[]>;
  income: number[];
  expense: number[];
  balance: number[];
};

function add(into: number[], from: number[] | undefined, sign = 1) {
  if (!from) return;
  for (let i = 0; i < 12; i++) into[i] += sign * from[i];
}

/** Valor de um conjunto de origens (+/−) dado o estado atual dos totais. */
export function evalSources(
  sources: SourceRow[],
  tableTotals: Map<string, number[]>,
  lineVals: Map<string, number[]>,
): number[] {
  const v = zeros();
  for (const s of sources) {
    if (s.refTableId) add(v, tableTotals.get(s.refTableId), s.sign);
    else if (s.refLineId) add(v, lineVals.get(s.refLineId), s.sign);
  }
  return v;
}

/**
 * Calcula todas as linhas (inclusive as vinculadas) e os totais de cada tabela.
 * Ordem: resolve dependências com uma ordenação topológica; se houver ciclo
 * (não deveria — é bloqueado ao salvar), as linhas do ciclo ficam zeradas.
 */
export function resolveGrid(
  tables: TableRow[],
  lines: LineRow[],
  sources: LineSourceRow[],
  raw: Map<string, number[]>,
): Resolved {
  const srcByLine = new Map<string, SourceRow[]>();
  for (const s of sources) {
    const list = srcByLine.get(s.lineId) ?? [];
    list.push(s);
    srcByLine.set(s.lineId, list);
  }
  const linesByTable = new Map<string, LineRow[]>();
  for (const l of lines) {
    const list = linesByTable.get(l.tableId) ?? [];
    list.push(l);
    linesByTable.set(l.tableId, list);
  }

  const lineVals = new Map<string, number[]>();
  const tableTotals = new Map<string, number[]>();
  for (const l of lines) if (!l.isLinked) lineVals.set(l.id, raw.get(l.id) ?? zeros());

  // nós: "L:<id>" e "T:<id>"
  const done = new Set<string>();
  const visiting = new Set<string>();

  const computeTable = (tid: string): number[] => {
    const key = "T:" + tid;
    if (done.has(key)) return tableTotals.get(tid)!;
    if (visiting.has(key)) return zeros();
    visiting.add(key);
    const sum = zeros();
    for (const l of linesByTable.get(tid) ?? []) add(sum, computeLine(l.id));
    visiting.delete(key);
    done.add(key);
    tableTotals.set(tid, sum);
    return sum;
  };
  const lineById = new Map(lines.map((l) => [l.id, l]));
  const computeLine = (lid: string): number[] => {
    const l = lineById.get(lid);
    if (!l) return zeros();
    if (!l.isLinked) return lineVals.get(lid)!;
    const key = "L:" + lid;
    if (done.has(key)) return lineVals.get(lid)!;
    if (visiting.has(key)) return zeros();
    visiting.add(key);
    const v = zeros();
    for (const s of srcByLine.get(lid) ?? []) {
      if (s.refTableId) add(v, computeTable(s.refTableId), s.sign);
      else if (s.refLineId) add(v, computeLine(s.refLineId), s.sign);
    }
    visiting.delete(key);
    done.add(key);
    lineVals.set(lid, v);
    return v;
  };

  for (const t of tables) computeTable(t.id);

  const resolved: ResolvedTable[] = tables.map((t) => ({
    ...t,
    lines: (linesByTable.get(t.id) ?? []).map((l) => ({
      ...l,
      vals: lineVals.get(l.id) ?? zeros(),
      sources: srcByLine.get(l.id) ?? [],
    })),
    sum: tableTotals.get(t.id) ?? zeros(),
  }));

  const income = zeros();
  const expense = zeros();
  for (const t of resolved) {
    if (t.kind === "in") add(income, t.sum);
    if (t.kind === "out") add(expense, t.sum);
  }
  const balance = zeros().map((_, i) => income[i] - expense[i]);

  return {
    tables: resolved,
    byId: new Map(resolved.map((t) => [t.id, t])),
    lineVals,
    tableTotals,
    income,
    expense,
    balance,
  };
}

/**
 * Detecta ciclo se a linha `lineId` passar a depender de `newSources`.
 * Retorna true se houver ciclo.
 */
export function wouldCreateCycle(
  lineId: string,
  newSources: SourceRow[],
  lines: LineRow[],
  sources: LineSourceRow[],
): boolean {
  const srcByLine = new Map<string, SourceRow[]>();
  for (const s of sources) {
    if (s.lineId === lineId) continue;
    const list = srcByLine.get(s.lineId) ?? [];
    list.push(s);
    srcByLine.set(s.lineId, list);
  }
  srcByLine.set(lineId, newSources);
  const lineById = new Map(lines.map((l) => [l.id, l]));
  const linesByTable = new Map<string, string[]>();
  for (const l of lines) {
    const list = linesByTable.get(l.tableId) ?? [];
    list.push(l.id);
    linesByTable.set(l.tableId, list);
  }

  // DFS a partir de lineId: chegou de volta em lineId => ciclo
  const seen = new Set<string>();
  const stack: string[] = [];
  const pushDeps = (lid: string) => {
    const l = lineById.get(lid);
    const isLinked = lid === lineId ? true : l?.isLinked;
    if (!isLinked) return;
    for (const s of srcByLine.get(lid) ?? []) {
      if (s.refLineId) stack.push(s.refLineId);
      if (s.refTableId) for (const x of linesByTable.get(s.refTableId) ?? []) stack.push(x);
    }
  };
  pushDeps(lineId);
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === lineId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    pushDeps(cur);
  }
  return false;
}
