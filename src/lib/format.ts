export const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const MESES_LONGOS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const nf = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 123456 -> "1.234,56" ; 0 -> "—" */
export function fmt(cents: number): string {
  if (!cents) return "—";
  return (cents < 0 ? "−" : "") + nf.format(Math.abs(cents) / 100);
}

/** 123456 -> "R$ 1.234,56" */
export function fmtR(cents: number): string {
  return (cents < 0 ? "−" : "") + "R$ " + nf.format(Math.abs(cents) / 100);
}

/** valor para um <input>: 123456 -> "1.234,56" ; 0 -> "" */
export function toInput(cents: number): string {
  return cents ? nf.format(cents / 100) : "";
}

/** "1.234,56" | "1234.56" | "87,5" -> centavos */
export function parseCents(input: string | number | null | undefined): number {
  if (typeof input === "number") return Math.round(input * 100);
  let s = String(input ?? "").trim().replace(/[^\d,.-]/g, "");
  if (!s) return 0;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/* ---------------- meses ("YYYY-MM-01") ---------------- */

export function monthStr(year: number, m0: number): string {
  const y = year + Math.floor(m0 / 12);
  const m = ((m0 % 12) + 12) % 12;
  return `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

export function parseMonth(s: string): { year: number; m0: number } {
  const [y, m] = s.split("-").map(Number);
  return { year: y, m0: m - 1 };
}

export function addMonths(s: string, n: number): string {
  const { year, m0 } = parseMonth(s);
  return monthStr(year, m0 + n);
}

export function monthDiff(a: string, b: string): number {
  const A = parseMonth(a);
  const B = parseMonth(b);
  return (B.year - A.year) * 12 + (B.m0 - A.m0);
}

export function monthLabel(s: string): string {
  const { year, m0 } = parseMonth(s);
  return `${MESES[m0]}/${year}`;
}

/** Data de hoje no fuso de São Paulo. */
export function today(): { year: number; m0: number; day: number; iso: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [y, m, d] = parts.split("-").map(Number);
  return { year: y, m0: m - 1, day: d, iso: parts };
}

export function daysInMonth(year: number, m0: number): number {
  return new Date(Date.UTC(year, m0 + 1, 0)).getUTCDate();
}

export function zeros(): number[] {
  return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
}
