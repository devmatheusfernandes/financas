import "server-only";
import ExcelJS from "exceljs";
import { and, eq, inArray, max, min } from "drizzle-orm";
import { db } from "@/db";
import { entries, finTables, lines } from "@/db/schema";
import { MESES, monthLabel, monthStr, parseCents, parseMonth, today } from "@/lib/format";
import type { Resolved, TableKind } from "@/lib/grid";
import { loadYear } from "./data";
import { COLORS } from "./defaults";

/**
 * Formato da planilha (aba "Planilha"):
 *   Tabela | Tipo | Linha | jan/26 | fev/26 | …
 * Uma linha por (tabela, linha); valores em reais. Células vazias = sem informação.
 */

const KIND_LABEL: Record<TableKind, string> = { in: "Entrada", out: "Saída", sub: "Auxiliar" };
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 5000;
const MAX_MONTHS = 120;
const NUM_FMT = '#,##0.00;[Red]-#,##0.00';

export class ImportError extends Error {}

/* ------------------------------------------------------------------ */
/* Exportar                                                            */
/* ------------------------------------------------------------------ */

function headerRow(ws: ExcelJS.Worksheet, labels: string[]) {
  const r = ws.addRow(labels);
  r.font = { bold: true, color: { argb: "FFFFFFFF" } };
  r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2A24" } };
  ws.views = [{ state: "frozen", xSplit: 3, ySplit: 1 }];
}

function monthColumns(ws: ExcelJS.Worksheet, from: number) {
  for (let c = from; c <= ws.columnCount; c++) {
    ws.getColumn(c).width = 12;
    ws.getColumn(c).numFmt = NUM_FMT;
  }
}

async function toBuffer(wb: ExcelJS.Workbook) {
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Exporta tudo: todos os anos com lançamentos (ou o ano atual, se não houver nenhum). */
export async function buildExport(householdId: string): Promise<Buffer> {
  const [range] = await db
    .select({ lo: min(entries.month), hi: max(entries.month) })
    .from(entries)
    .innerJoin(lines, eq(lines.id, entries.lineId))
    .innerJoin(finTables, eq(finTables.id, lines.tableId))
    .where(eq(finTables.householdId, householdId));
  const nowYear = today().year;
  const y0 = range?.lo ? parseMonth(range.lo).year : nowYear;
  const y1 = range?.hi ? parseMonth(range.hi).year : nowYear;
  const years: number[] = [];
  for (let y = y0; y <= y1; y++) years.push(y);

  const grids: Resolved[] = [];
  for (const y of years) grids.push((await loadYear(householdId, y)).grid);
  const labels = years.flatMap((y) => MESES.map((m) => `${m}/${String(y).slice(2)}`));
  const series = (pick: (g: Resolved) => number[]) => grids.flatMap(pick);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Planilha");
  headerRow(ws, ["Tabela", "Tipo", "Linha", ...labels]);
  ws.getColumn(1).width = 24;
  ws.getColumn(2).width = 10;
  ws.getColumn(3).width = 30;
  for (const t of grids[0].tables) {
    for (const l of t.lines) {
      const vals = series((g) => g.lineVals.get(l.id) ?? Array(12).fill(0));
      ws.addRow([t.name, KIND_LABEL[t.kind], l.name, ...vals.map((v) => (v ? v / 100 : null))]);
    }
  }
  monthColumns(ws, 4);

  const rs = wb.addWorksheet("Resumo");
  headerRow(rs, ["", "", "", ...labels]);
  rs.getColumn(1).width = 14;
  for (const [name, pick] of [
    ["Entradas", (g: Resolved) => g.income],
    ["Saídas", (g: Resolved) => g.expense],
    ["Balanço", (g: Resolved) => g.balance],
  ] as const) {
    rs.addRow([name, "", "", ...series(pick).map((v) => v / 100)]);
  }
  monthColumns(rs, 4);
  return toBuffer(wb);
}

/** Modelo em branco com instruções e três linhas de exemplo (sem valores). */
export async function buildTemplate(): Promise<Buffer> {
  const y = today().year;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Planilha");
  headerRow(ws, ["Tabela", "Tipo", "Linha", ...MESES.map((m) => `${m}/${String(y).slice(2)}`)]);
  ws.getColumn(1).width = 24;
  ws.getColumn(2).width = 10;
  ws.getColumn(3).width = 30;
  ws.addRow(["Entradas", "Entrada", "Salário"]);
  ws.addRow(["Saídas", "Saída", "Aluguel"]);
  ws.addRow(["Cartão de crédito", "Auxiliar", "Mercado"]);
  monthColumns(ws, 4);

  const help = wb.addWorksheet("Como usar");
  help.getColumn(1).width = 110;
  for (const line of [
    "Cada linha da aba “Planilha” vira uma linha numa tabela do app.",
    "Tabela: nome da tabela (criada se ainda não existir). Pode ficar em branco para repetir a de cima.",
    "Tipo: Entrada, Saída ou Auxiliar (só vale para tabelas novas; vazio = Saída).",
    "Linha: nome da linha (criada se ainda não existir).",
    "Colunas de mês: jan/26, fev/26… (ou datas). Quantos meses e anos você quiser.",
    "Valores em reais, ex.: 1234,56. Use negativo para estornos. Célula vazia = não mexe nesse mês.",
    "Apague as linhas de exemplo e escreva as suas.",
  ]) {
    help.addRow([line]);
  }
  return toBuffer(wb);
}

/* ------------------------------------------------------------------ */
/* Ler a planilha                                                      */
/* ------------------------------------------------------------------ */

type ParsedRow = { table: string; kind: TableKind | null; line: string; cents: (number | null)[] };
type Parsed = { months: string[]; rows: ParsedRow[] };

function plain(v: ExcelJS.CellValue): unknown {
  if (v && typeof v === "object" && !(v instanceof Date)) {
    if ("result" in v) return plain(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("text" in v) return String(v.text);
    return null;
  }
  return v;
}

function text(v: ExcelJS.CellValue): string {
  const p = plain(v);
  return p == null || p instanceof Date ? "" : String(p).trim();
}

function cellCents(v: ExcelJS.CellValue): number | null {
  const p = plain(v);
  if (typeof p === "number") return Math.round(p * 100);
  if (typeof p === "string" && /\d/.test(p)) return parseCents(p);
  return null;
}

function headerMonth(v: ExcelJS.CellValue): string | null {
  const p = plain(v);
  if (p instanceof Date) return monthStr(p.getUTCFullYear(), p.getUTCMonth());
  const s = String(p ?? "").trim().toLowerCase();
  let m = s.match(/^(\d{4})-(\d{1,2})/);
  if (m) {
    const mo = Number(m[2]);
    return mo >= 1 && mo <= 12 ? monthStr(Number(m[1]), mo - 1) : null;
  }
  m = s.match(/^([a-zç]{3})[a-zç]*\.?\s*[\/\-]?\s*(\d{4}|\d{2})$/);
  if (!m) return null;
  const idx = MESES.indexOf(m[1]);
  if (idx < 0) return null;
  return monthStr(m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]), idx);
}

function kindOf(s: string): TableKind | null {
  const k = s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (["entrada", "receita", "in"].includes(k)) return "in";
  if (["saida", "despesa", "out"].includes(k)) return "out";
  if (["auxiliar", "detalhe", "sub"].includes(k)) return "sub";
  return null;
}

async function parseWorkbook(buf: Buffer): Promise<Parsed> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
  } catch {
    throw new ImportError("Não consegui abrir o arquivo. Envie um .xlsx (no Google Planilhas: Arquivo › Fazer download › Excel).");
  }
  const ws = wb.getWorksheet("Planilha") ?? wb.worksheets[0];
  if (!ws) throw new ImportError("O arquivo não tem nenhuma aba.");

  let head = 0;
  let cTable = 0;
  let cKind = 0;
  let cLine = 0;
  for (let r = 1; r <= Math.min(ws.rowCount, 10) && !head; r++) {
    const row = ws.getRow(r);
    row.eachCell((cell, c) => {
      const t = text(cell.value).toLowerCase();
      if (t === "linha") cLine = c;
      else if (t === "tabela") cTable = c;
      else if (t === "tipo") cKind = c;
    });
    if (cLine && cTable) head = r;
    else cLine = cTable = cKind = 0;
  }
  if (!head) {
    throw new ImportError("Não achei o cabeçalho. A primeira linha precisa ter as colunas “Tabela”, “Linha” e os meses (jan/26…). Baixe o modelo para ver o formato.");
  }

  const monthCols: { col: number; month: string }[] = [];
  ws.getRow(head).eachCell((cell, c) => {
    const m = headerMonth(cell.value);
    if (m) monthCols.push({ col: c, month: m });
  });
  if (!monthCols.length) throw new ImportError("Não achei colunas de mês no cabeçalho (ex.: jan/26, fev/26).");
  if (monthCols.length > MAX_MONTHS) throw new ImportError(`Muitos meses (máximo ${MAX_MONTHS}).`);
  if (new Set(monthCols.map((m) => m.month)).size !== monthCols.length) throw new ImportError("Há meses repetidos no cabeçalho.");
  if (ws.rowCount - head > MAX_ROWS) throw new ImportError(`Linhas demais (máximo ${MAX_ROWS}).`);

  const rows: ParsedRow[] = [];
  let table = "";
  let kind: TableKind | null = null;
  for (let r = head + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const t = text(row.getCell(cTable).value);
    if (t) {
      table = t.slice(0, 60);
      kind = null;
    }
    const k = cKind ? kindOf(text(row.getCell(cKind).value)) : null;
    if (k) kind = k;
    const line = text(row.getCell(cLine).value).slice(0, 80);
    if (!line) continue;
    if (!table) throw new ImportError(`Linha ${r} (“${line}”): falta o nome da tabela.`);
    rows.push({ table, kind, line, cents: monthCols.map((m) => cellCents(row.getCell(m.col).value)) });
  }
  if (!rows.length) throw new ImportError("Não encontrei nenhuma linha para importar.");
  return { months: monthCols.map((m) => m.month), rows };
}

/* ------------------------------------------------------------------ */
/* Importar                                                            */
/* ------------------------------------------------------------------ */

export type ImportMode = "add" | "replace";
export type ImportSummary = {
  rows: number;
  newTables: string[];
  newLines: number;
  values: number;
  replaced: number;
  skippedLinked: string[];
  from: string;
  to: string;
};

class DryRun extends Error {}
const key = (s: string) => s.trim().toLowerCase();
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

/**
 * Importa a planilha. "add" soma aos lançamentos existentes; "replace" apaga, nos meses preenchidos
 * do arquivo, o que já existia naquelas linhas antes de lançar. Com dryRun só calcula o resumo.
 */
export async function importSpreadsheet(
  householdId: string,
  userId: string,
  file: Buffer,
  mode: ImportMode,
  dryRun: boolean,
): Promise<ImportSummary> {
  if (file.byteLength > MAX_BYTES) throw new ImportError("Arquivo grande demais (máximo 5 MB).");
  const parsed = await parseWorkbook(file);

  const summary: ImportSummary = {
    rows: parsed.rows.length,
    newTables: [],
    newLines: 0,
    values: 0,
    replaced: 0,
    skippedLinked: [],
    from: monthLabel([...parsed.months].sort()[0]),
    to: monthLabel([...parsed.months].sort().at(-1)!),
  };

  try {
    await db.transaction(async (tx) => {
      const tbls = await tx
        .select({ id: finTables.id, name: finTables.name, sort: finTables.sort })
        .from(finTables)
        .where(eq(finTables.householdId, householdId));
      const tableByName = new Map(tbls.map((t) => [key(t.name), t.id]));
      let tableCount = tbls.length;
      let tableSort = tbls.reduce((a, t) => Math.max(a, t.sort), 0);

      const existing = tbls.length
        ? await tx
            .select({ id: lines.id, tableId: lines.tableId, name: lines.name, isLinked: lines.isLinked, sort: lines.sort })
            .from(lines)
            .where(inArray(lines.tableId, tbls.map((t) => t.id)))
        : [];
      const lineByKey = new Map(existing.map((l) => [`${l.tableId}|${key(l.name)}`, { id: l.id, isLinked: l.isLinked }]));
      const lineSort = new Map<string, number>();
      for (const l of existing) lineSort.set(l.tableId, Math.max(lineSort.get(l.tableId) ?? 0, l.sort));

      const toInsert: (typeof entries.$inferInsert)[] = [];
      const touched = new Map<string, Set<string>>(); // lineId -> meses preenchidos (modo replace)
      const skipped = new Set<string>();

      for (const row of parsed.rows) {
        let tableId = tableByName.get(key(row.table));
        if (!tableId) {
          const kind = row.kind ?? "out";
          const color = kind === "in" ? COLORS.in : kind === "out" ? COLORS.out : COLORS.sub[tableCount % COLORS.sub.length];
          const [t] = await tx
            .insert(finTables)
            .values({ householdId, name: row.table, kind, color, sort: ++tableSort })
            .returning({ id: finTables.id });
          tableId = t.id;
          tableByName.set(key(row.table), tableId);
          tableCount++;
          summary.newTables.push(row.table);
        }
        const lk = `${tableId}|${key(row.line)}`;
        let line = lineByKey.get(lk);
        if (!line) {
          const sort = (lineSort.get(tableId) ?? 0) + 1;
          lineSort.set(tableId, sort);
          const [l] = await tx.insert(lines).values({ tableId, name: row.line, sort }).returning({ id: lines.id });
          line = { id: l.id, isLinked: false };
          lineByKey.set(lk, line);
          summary.newLines++;
        }
        if (line.isLinked) {
          skipped.add(`${row.table} › ${row.line}`);
          continue;
        }
        row.cents.forEach((c, i) => {
          if (c === null) return;
          if (mode === "replace") {
            const s = touched.get(line.id) ?? new Set<string>();
            s.add(parsed.months[i]);
            touched.set(line.id, s);
          }
          if (c === 0) return;
          toInsert.push({ lineId: line.id, month: parsed.months[i], amountCents: c, source: "import", createdBy: userId });
        });
      }

      for (const [lineId, months] of touched) {
        const del = await tx
          .delete(entries)
          .where(and(eq(entries.lineId, lineId), inArray(entries.month, [...months])))
          .returning({ id: entries.id });
        summary.replaced += del.length;
      }
      for (const part of chunk(toInsert, 1000)) await tx.insert(entries).values(part);
      summary.values = toInsert.length;
      summary.skippedLinked = [...skipped];
      if (dryRun) throw new DryRun();
    });
  } catch (e) {
    if (!(e instanceof DryRun)) throw e;
  }
  return summary;
}
