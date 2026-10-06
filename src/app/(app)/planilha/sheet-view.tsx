"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PeriodBar } from "@/components/period-bar";
import { CellPanel } from "@/components/cell-panel";
import { Bar, IconChevron, IconLink } from "@/components/ui";
import { MESES, MESES_LONGOS, fmt, fmtR } from "@/lib/format";
import { periodHref } from "@/lib/period";

export type SheetSource = { refTableId: string | null; refLineId: string | null; sign: number; label: string };
export type SheetLine = { id: string; name: string; isLinked: boolean; vals: number[]; counts: number[]; sources: SheetSource[] };
export type SheetTable = { id: string; name: string; kind: "in" | "out" | "sub"; color: string; sum: number[]; lines: SheetLine[] };
export type SheetData = { tables: SheetTable[]; income: number[]; expense: number[]; balance: number[] };
type Period = { year: number; size: number; start: number; curM0: number };

const OPEN_KEY = "planilha:open";

function cellTone(v: number) {
  if (!v) return "text-faint";
  if (v < 0) return "text-neg";
  return "text-ink";
}

export function SheetView({ data, period, view }: { data: SheetData; period: Period; view: "completa" | "simples" }) {
  const months = useMemo(() => Array.from({ length: period.size }, (_, i) => period.start + i), [period.size, period.start]);
  const psum = (a: number[]) => months.reduce((s, m) => s + a[m], 0);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [sel, setSel] = useState<{ lineId: string; m0: number } | null>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      try {
        const raw = localStorage.getItem(OPEN_KEY);
        if (raw) setOpen(JSON.parse(raw));
      } catch {}
    });
    return () => cancelAnimationFrame(id);
  }, []);
  const isOpen = (t: SheetTable) => open[t.id] ?? t.kind !== "sub";
  const toggle = (t: SheetTable) => {
    const next = { ...open, [t.id]: !isOpen(t) };
    setOpen(next);
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify(next));
    } catch {}
  };

  const ordered = [
    ...data.tables.filter((t) => t.kind === "in"),
    ...data.tables.filter((t) => t.kind === "out"),
    null, // balanço
    ...data.tables.filter((t) => t.kind === "sub"),
  ];
  const inT = psum(data.income);
  const outT = psum(data.expense);
  const balT = inT - outT;

  const selLine = sel ? data.tables.flatMap((t) => t.lines.map((l) => ({ ...l, table: t }))).find((l) => l.id === sel.lineId) : null;

  return (
    <main className="mx-auto flex max-w-[1440px] flex-col gap-3.5 px-4 pb-10 pt-5 md:px-6">
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-xs font-medium uppercase tracking-wider text-muted">Planilha</span>
          <h1 className="text-[26px] font-semibold tracking-tight">{period.year}</h1>
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="grid grid-cols-2 rounded-xl bg-line p-1 md:w-[300px]">
          {(["completa", "simples"] as const).map((v) => (
            <Link
              key={v}
              href={periodHref("/planilha", period, { v })}
              aria-current={view === v ? "page" : undefined}
              className={`rounded-[9px] py-2.5 text-center text-sm ${view === v ? "bg-card font-semibold shadow-sm" : "font-medium text-muted"}`}
            >
              {v === "completa" ? "Completa" : "Simplificada"}
            </Link>
          ))}
        </div>
        <PeriodBar base="/planilha" period={period} extra={{ v: view }} />
      </div>

      <div className="grid grid-cols-3 gap-2 md:max-w-[720px]">
        <Kpi label="Entradas" color="bg-in" value={inT} />
        <Kpi label="Saídas" color="bg-out" value={outT} />
        <div className="flex flex-col gap-1 rounded-xl bg-panel px-3 py-2.5 text-white">
          <span className="text-[11px] text-[#B5BBB5]">Balanço</span>
          <span className={`num text-sm font-semibold md:text-lg ${balT < 0 ? "text-[#FFB48A]" : "text-[#B9D0FF]"}`}>{fmt(balT)}</span>
        </div>
      </div>

      {data.tables.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line bg-card p-6 text-center text-sm text-muted">
          Nenhuma tabela ainda. <Link className="font-semibold text-in" href="/tabelas">Criar tabelas</Link> ou{" "}
          <Link className="font-semibold text-in" href="/ajustes">importar uma planilha</Link>.
        </div>
      )}

      {view === "completa" ? (
        <div className="flex flex-col gap-3">
          {ordered.map((t) =>
            t === null ? (
              <BalanceCard key="bal" months={months} balance={data.balance} total={balT} cur={period.curM0} />
            ) : (
              <TableCard
                key={t.id}
                t={t}
                months={months}
                open={isOpen(t)}
                onToggle={() => toggle(t)}
                cur={period.curM0}
                total={psum(t.sum)}
                sel={sel}
                onSelect={(lineId, m0) => setSel({ lineId, m0 })}
              />
            ),
          )}
          <p className="hidden text-xs text-muted md:block">
            Clique num valor para ver, editar ou adicionar lançamentos daquele mês. Linhas com <IconLink size={10} /> são
            calculadas a partir de outras tabelas ou linhas.
          </p>
        </div>
      ) : (
        <Simplified data={data} months={months} period={period} />
      )}

      {selLine && sel && (
        <CellPanel
          key={`${sel.lineId}:${sel.m0}`}
          line={selLine}
          tableName={selLine.table.name}
          year={period.year}
          m0={sel.m0}
          tables={data.tables}
          onClose={() => setSel(null)}
        />
      )}
    </main>
  );
}

function Kpi({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-line bg-card px-3 py-2.5">
      <span className="flex items-center gap-1.5 text-[11px] text-muted">
        <span className={`size-2 rounded-[2px] ${color}`} />
        {label}
      </span>
      <span className="num text-sm font-semibold md:text-lg">{fmt(value)}</span>
    </div>
  );
}

function MonthHeader({ months, cur, dark = false, label = "Item" }: { months: number[]; cur: number; dark?: boolean; label?: string }) {
  return (
    <div className={`flex ${dark ? "" : "bg-soft"}`}>
      <div className={`sticky left-0 z-[1] w-[112px] shrink-0 px-3 py-2 text-[11px] uppercase tracking-wider md:w-[240px] md:px-4 ${dark ? "bg-panel text-[#9AA19B]" : "bg-soft text-muted"}`}>
        {label}
      </div>
      {months.map((m) => (
        <div
          key={m}
          className={`min-w-[86px] flex-1 px-2.5 py-2 text-right text-[11px] uppercase tracking-wider ${
            m === cur ? (dark ? "font-semibold text-white" : "bg-in-soft font-semibold text-in-ink") : dark ? "text-[#9AA19B]" : "text-muted"
          }`}
        >
          {MESES[m]}
          {m === cur && <span className="hidden md:inline"> · hoje</span>}
        </div>
      ))}
    </div>
  );
}

function TableCard({
  t,
  months,
  open,
  onToggle,
  cur,
  total,
  sel,
  onSelect,
}: {
  t: SheetTable;
  months: number[];
  open: boolean;
  onToggle: () => void;
  cur: number;
  total: number;
  sel: { lineId: string; m0: number } | null;
  onSelect: (lineId: string, m0: number) => void;
}) {
  const meta = t.kind === "in" ? "Entradas" : t.kind === "out" ? "Saídas" : "Tabela auxiliar";
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-card">
      <button onClick={onToggle} aria-expanded={open} className="flex min-h-[58px] w-full items-center gap-2.5 px-3.5 py-3 text-left">
        <span className={`text-muted transition-transform ${open ? "rotate-90" : ""}`}>
          <IconChevron size={16} />
        </span>
        <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: t.color }} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[15px] font-semibold">{t.name}</span>
          <span className="text-xs text-muted">
            {meta} · {t.lines.length} {t.lines.length === 1 ? "linha" : "linhas"}
          </span>
        </span>
        <span className="num text-sm font-semibold" style={{ color: t.color }}>
          {fmt(total)}
        </span>
      </button>
      <div className="no-scrollbar overflow-x-auto border-t border-line-2">
        <div className="flex w-max min-w-full flex-col">
          <MonthHeader months={months} cur={cur} />
          {open &&
            t.lines.map((l) => (
              <div key={l.id} className="flex border-t border-line-2">
                <div className="sticky left-0 z-[1] flex w-[112px] shrink-0 flex-col justify-center gap-0.5 bg-card py-2 pl-3 pr-1.5 text-[13px] leading-tight md:w-[240px] md:pl-4">
                  <span className="line-clamp-2 break-words md:truncate" title={l.name}>
                    {l.name}
                  </span>
                  {l.isLinked && (
                    <span className="flex items-center gap-1 truncate text-[10.5px] text-link-ink" title={l.sources.map((s) => (s.sign < 0 ? "− " : "+ ") + s.label).join(" ")}>
                      <IconLink size={10} />= {l.sources[0] ? (l.sources[0].sign < 0 ? "− " : "") + l.sources[0].label : "0"}
                      {l.sources.length > 1 ? ` +${l.sources.length - 1}` : ""}
                    </span>
                  )}
                </div>
                {months.map((m) => {
                  const on = sel?.lineId === l.id && sel.m0 === m;
                  return (
                    <button
                      key={m}
                      onClick={() => onSelect(l.id, m)}
                      aria-label={`${l.name}, ${MESES_LONGOS[m]}: ${fmtR(l.vals[m])}`}
                      className={`num relative min-w-[86px] flex-1 px-2.5 py-2.5 text-right text-[12.5px] hover:bg-soft ${m === cur ? "bg-tint-in" : ""} ${
                        l.isLinked && l.vals[m] ? "text-link-ink" : cellTone(l.vals[m])
                      } ${on ? "shadow-[inset_0_0_0_2px_var(--color-in)]" : ""}`}
                    >
                      {fmt(l.vals[m])}
                      {l.counts[m] > 1 && !l.isLinked && (
                        <span className="absolute right-1 top-1 text-[9px] text-muted" aria-hidden>
                          {l.counts[m]}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          <div className="flex border-t border-line bg-soft">
            <div className="sticky left-0 z-[1] w-[112px] shrink-0 bg-soft px-3 py-2.5 text-[13px] font-semibold md:w-[240px] md:px-4">Total</div>
            {months.map((m) => (
              <div key={m} className={`num min-w-[86px] flex-1 px-2.5 py-2.5 text-right text-[12.5px] font-semibold ${m === cur ? "bg-tint-in" : ""} ${cellTone(t.sum[m])}`}>
                {fmt(t.sum[m])}
              </div>
            ))}
          </div>
        </div>
      </div>
      {open && (
        <div className="border-t border-line-2 px-3.5 py-2">
          <Link href="/tabelas" className="text-xs font-medium text-in">
            + Linha / gerenciar tabela
          </Link>
        </div>
      )}
    </section>
  );
}

function BalanceCard({ months, balance, total, cur }: { months: number[]; balance: number[]; total: number; cur: number }) {
  const tone = (v: number) => (v < 0 ? "text-[#FFB48A]" : "text-[#B9D0FF]");
  return (
    <section className="overflow-hidden rounded-2xl bg-panel text-white">
      <div className="flex items-center gap-2.5 px-3.5 pb-3 pt-3.5">
        <span className="flex flex-1 flex-col">
          <span className="text-[15px] font-semibold">Balanço</span>
          <span className="text-xs text-[#B5BBB5]">Entradas − Saídas · a reservar</span>
        </span>
        <span className={`num text-[15px] font-semibold ${tone(total)}`}>{fmt(total)}</span>
      </div>
      <div className="no-scrollbar overflow-x-auto border-t border-[#2C3133]">
        <div className="flex w-max min-w-full flex-col">
          <MonthHeader months={months} cur={cur} dark label="Mês" />
          <div className="flex">
            <div className="sticky left-0 z-[1] w-[112px] shrink-0 bg-panel px-3 py-2.5 text-[13px] font-semibold md:w-[240px] md:px-4">Saldo</div>
            {months.map((m) => (
              <div key={m} className={`num min-w-[86px] flex-1 px-2.5 py-2.5 text-right text-[12.5px] font-semibold ${m === cur ? "bg-white/5" : ""} ${tone(balance[m])}`}>
                {fmt(balance[m])}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Simplified({ data, months, period }: { data: SheetData; months: number[]; period: Period }) {
  const psum = (a: number[]) => months.reduce((s, m) => s + a[m], 0);
  const inT = psum(data.income);
  const outT = psum(data.expense);
  const bal = inT - outT;
  const pct = inT ? Math.round((outT / inT) * 100) : 0;
  const max = Math.max(1, ...months.map((m) => Math.max(data.income[m], data.expense[m])));
  const subs = data.tables.filter((t) => t.kind === "sub");

  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="flex flex-col gap-4 rounded-[20px] bg-panel p-5 text-white md:col-span-2">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] text-[#B5BBB5]">Balanço do período · a reservar</span>
          <span className={`num text-[34px] font-semibold tracking-tight ${bal < 0 ? "text-[#FFB48A]" : ""}`}>{fmtR(bal)}</span>
        </div>
        <div className="grid grid-cols-2 gap-3 md:max-w-md">
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5 text-xs text-[#B5BBB5]">
              <span className="size-2 rounded-[2px] bg-[#7FA6F5]" /> Entradas
            </span>
            <span className="num text-[17px] font-semibold">{fmtR(inT)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5 text-xs text-[#B5BBB5]">
              <span className="size-2 rounded-[2px] bg-[#F09A62]" /> Saídas
            </span>
            <span className="num text-[17px] font-semibold">{fmtR(outT)}</span>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <div className="h-2 overflow-hidden rounded-full bg-[#2C3133]">
            <Bar className="block h-full rounded-full bg-[#F09A62]" pct={pct} />
          </div>
          <span className="text-xs text-[#B5BBB5]">As saídas consumiram {pct}% das entradas no período</span>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-line bg-card">
        <div className="flex items-baseline justify-between px-4 pb-1.5 pt-3.5">
          <h2 className="text-[15px] font-semibold">Mês a mês</h2>
          <span className="text-xs text-muted">Entradas · Saídas · Balanço</span>
        </div>
        {months.map((m) => {
          const b = data.income[m] - data.expense[m];
          return (
            <Link
              key={m}
              href={periodHref("/planilha", { year: period.year, size: 1, start: m }, { v: "completa" })}
              className={`flex flex-col gap-2 border-t border-line-2 px-4 py-3 ${m === period.curM0 ? "bg-tint-in" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  {MESES_LONGOS[m]}
                  {m === period.curM0 && <span className="rounded-full bg-in-soft px-2 py-0.5 text-[11px] font-semibold text-in-ink">atual</span>}
                </span>
                <span className={`num text-sm font-semibold ${b < 0 ? "text-neg" : "text-in-ink"}`}>
                  {b > 0 ? "+" : ""}
                  {fmt(b)}
                </span>
              </div>
              <div className="grid grid-cols-[1fr_84px] items-center gap-x-2.5 gap-y-1">
                <div className="h-1.5 rounded-full bg-line-2">
                  <div className="h-full rounded-full bg-in" style={{ width: `${(data.income[m] / max) * 100}%` }} />
                </div>
                <span className="num text-right text-xs text-muted">{fmt(data.income[m])}</span>
                <div className="h-1.5 rounded-full bg-line-2">
                  <div className="h-full rounded-full bg-out" style={{ width: `${(data.expense[m] / max) * 100}%` }} />
                </div>
                <span className="num text-right text-xs text-muted">{fmt(data.expense[m])}</span>
              </div>
            </Link>
          );
        })}
      </section>

      <section className="self-start overflow-hidden rounded-2xl border border-line bg-card">
        <div className="px-4 pb-1.5 pt-3.5">
          <h2 className="text-[15px] font-semibold">Outras tabelas</h2>
        </div>
        {subs.length === 0 && <p className="border-t border-line-2 px-4 py-3 text-sm text-muted">Nenhuma tabela auxiliar.</p>}
        {subs.map((t) => {
          const tot = psum(t.sum);
          return (
            <Link key={t.id} href={periodHref("/planilha", period, { v: "completa" })} className="flex min-h-11 items-center gap-3 border-t border-line-2 px-4 py-3">
              <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: t.color }} />
              <span className="flex-1 text-sm font-semibold">{t.name}</span>
              <span className="flex flex-col items-end">
                <span className="num text-sm font-semibold">{fmtR(tot)}</span>
                <span className="num text-[11px] text-muted">média {fmt(Math.round(tot / months.length))}/mês</span>
              </span>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
