import { today } from "./format";

export type PeriodSize = 1 | 3 | 6 | 12;

export function parsePeriod(sp: Record<string, string | string[] | undefined>) {
  const t = today();
  const year = Number(sp.ano) || t.year;
  const sizeRaw = Number(sp.p);
  const size: PeriodSize = sizeRaw === 3 || sizeRaw === 6 || sizeRaw === 12 ? sizeRaw : 1;
  const defStart = year === t.year ? Math.floor(t.m0 / size) * size : 0;
  let start = sp.i !== undefined ? Number(sp.i) : defStart;
  if (!Number.isFinite(start) || start < 0) start = 0;
  start = Math.min(12 - size, Math.floor(start / size) * size);
  return { year, size, start, curM0: year === t.year ? t.m0 : -1 };
}

export function periodHref(base: string, p: { year: number; size: number; start: number }, extra: Record<string, string> = {}) {
  const q = new URLSearchParams({ ano: String(p.year), p: String(p.size), i: String(p.start), ...extra });
  return `${base}?${q.toString()}`;
}
