"use client";

import Link from "next/link";
import { useState } from "react";
import { IconChevron, IconLink } from "@/components/ui";
import { MESES, MESES_LONGOS, daysInMonth, fmt, fmtR } from "@/lib/format";

type B = { id: string; name: string; alertPct: number; limits: number[]; spent: number[]; sources: string[] };
type Status = "ok" | "warn" | "over" | "none";

function statusOf(spent: number, limit: number, alertPct: number): Status {
  if (!spent) return "none";
  if (spent > limit) return "over";
  if (spent >= (limit * alertPct) / 100) return "warn";
  return "ok";
}
const BAR: Record<Status, string> = { ok: "bg-in", warn: "bg-warn", over: "bg-over", none: "bg-in" };
const CELL: Record<Status, string> = {
  ok: "bg-in-soft text-in-ink",
  warn: "bg-warn-soft text-warn-ink",
  over: "bg-over-soft text-[#9A3412]",
  none: "bg-soft-2 text-faint",
};

export function BudgetView({ budgets, year, m0, today }: { budgets: B[]; year: number; m0: number; today: { year: number; m0: number; day: number } }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const isCur = year === today.year && m0 === today.m0;
  const isFuture = year > today.year || (year === today.year && m0 > today.m0);
  const dim = daysInMonth(year, m0);
  const pace = isCur ? (today.day / dim) * 100 : null;
  const daysLeft = dim - today.day + 1;

  const sumL = budgets.reduce((s, b) => s + b.limits[m0], 0);
  const sumS = budgets.reduce((s, b) => s + b.spent[m0], 0);
  const overCount = budgets.filter((b) => b.spent[m0] > b.limits[m0]).length;
  const prev = m0 === 0 ? `/budget?ano=${year - 1}&m=11` : `/budget?ano=${year}&m=${m0 - 1}`;
  const next = m0 === 11 ? `/budget?ano=${year + 1}&m=0` : `/budget?ano=${year}&m=${m0 + 1}`;

  return (
    <main className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 pb-10 pt-5 md:px-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-xs font-medium uppercase tracking-wider text-muted">Budget</span>
          <h1 className="text-[26px] font-semibold tracking-tight">
            {MESES_LONGOS[m0]} <span className="text-muted">{year}</span>
          </h1>
        </div>
        <div className="flex gap-1">
          <Link href={prev} aria-label="Mês anterior" className="flex size-11 items-center justify-center rounded-xl border border-line bg-card">
            <IconChevron dir="left" />
          </Link>
          <Link href={next} aria-label="Próximo mês" className="flex size-11 items-center justify-center rounded-xl border border-line bg-card">
            <IconChevron />
          </Link>
        </div>
      </div>

      <section className="flex flex-col gap-3.5 rounded-[20px] bg-ink p-[18px] text-white md:max-w-3xl">
        <div className="flex items-end justify-between gap-2.5">
          <div className="flex flex-col gap-1">
            <span className="text-[13px] text-[#B5BBB5]">Gasto nos budgets</span>
            <span className="num text-[30px] font-semibold tracking-tight">{fmtR(sumS)}</span>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-xs text-[#B5BBB5]">de</span>
            <span className="num text-[15px] font-semibold">{fmtR(sumL)}</span>
          </div>
        </div>
        <div className="relative h-2.5 rounded-full bg-[#2C3133]">
          <div
            className={`absolute inset-y-0 left-0 rounded-full ${sumS > sumL ? "bg-[#F09A62]" : sumS >= sumL * 0.8 ? "bg-[#E2B04A]" : "bg-[#7FA6F5]"}`}
            style={{ width: `${sumL ? Math.min(100, (sumS / sumL) * 100) : 0}%` }}
          />
          {pace !== null && <span title="Hoje" className="absolute -inset-y-1 w-0.5 rounded bg-white" style={{ left: `calc(${pace}% - 1px)` }} />}
        </div>
        <div className="flex justify-between gap-2 text-[12.5px] text-[#CDD2CC]">
          <span>{sumS > sumL ? `Passou ${fmtR(sumS - sumL)}` : `Restam ${fmtR(sumL - sumS)}`}</span>
          <span>{isCur ? `Dia ${today.day} de ${dim}` : isFuture ? "Mês futuro" : "Mês fechado"}</span>
        </div>
      </section>

      <div className="flex items-baseline justify-between px-0.5">
        <h2 className="text-[15px] font-semibold">
          {budgets.length} {budgets.length === 1 ? "budget" : "budgets"}
          {overCount ? ` · ${overCount} estourado${overCount > 1 ? "s" : ""}` : ""}
        </h2>
        <Link href={`/budget/novo?ano=${year}`} className="flex min-h-11 items-center text-sm font-semibold text-in">
          + Novo budget
        </Link>
      </div>

      {budgets.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line bg-card p-6 text-center text-sm text-muted">
          Crie um budget para acompanhar uma linha (ex.: Alimentação) ou uma tabela inteira (ex.: Cartão).
        </div>
      )}

      <div className="grid gap-2.5 md:grid-cols-[repeat(auto-fill,minmax(320px,1fr))]">
        {budgets.map((b) => {
          const lim = b.limits[m0];
          const sp = b.spent[m0];
          const st = statusOf(sp, lim, b.alertPct);
          const pct = lim ? (sp / lim) * 100 : 0;
          const isOpen = !!open[b.id];
          let status: React.ReactNode;
          if (st === "none") status = <span className="text-muted">{isFuture ? "Planejado · nenhum gasto ainda" : "Nenhum gasto lançado ainda"}</span>;
          else if (st === "over") status = <span className="font-semibold text-neg">Passou {fmtR(sp - lim)}</span>;
          else if (st === "warn") status = <span className="font-semibold text-warn-ink">Atenção · restam {fmtR(lim - sp)}</span>;
          else
            status = (
              <span className="text-ink-2">
                Restam {fmtR(lim - sp)}
                {isCur ? ` · ${fmtR(Math.floor((lim - sp) / daysLeft))}/dia` : ""}
              </span>
            );
          return (
            <section key={b.id} className="self-start overflow-hidden rounded-2xl border border-line bg-card">
              <button onClick={() => setOpen({ ...open, [b.id]: !isOpen })} aria-expanded={isOpen} className="flex w-full flex-col gap-2.5 px-3.5 pb-3 pt-3.5 text-left">
                <span className="flex w-full items-start justify-between gap-2.5">
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-[15px] font-semibold">{b.name}</span>
                    <span className="flex items-center gap-1 truncate text-xs text-muted">
                      <IconLink size={11} />
                      {b.sources.join(" + ")}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-0.5">
                    <span className="num text-[15px] font-semibold">{fmtR(sp)}</span>
                    <span className="num text-[11.5px] text-muted">de {fmtR(lim)}</span>
                  </span>
                </span>
                <span className="relative block h-2 w-full rounded-full bg-line-2">
                  <span className={`absolute inset-y-0 left-0 rounded-full ${BAR[st]}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
                  {pace !== null && <span className="absolute -inset-y-[3px] w-0.5 rounded bg-ink" style={{ left: `calc(${pace}% - 1px)` }} />}
                </span>
                <span className="flex w-full justify-between gap-2 text-[12.5px]">
                  {status}
                  <span className="num text-muted">{Math.round(pct)}%</span>
                </span>
              </button>
              {isOpen && (
                <div className="flex flex-col gap-2 border-t border-line-2 bg-soft px-3.5 pb-3.5 pt-3">
                  <span className="text-xs uppercase tracking-wider text-muted">Últimos meses</span>
                  {Array.from({ length: Math.min(6, m0 + 1) }, (_, k) => m0 - Math.min(5, m0) + k).map((k) => {
                    const s2 = statusOf(b.spent[k], b.limits[k], b.alertPct);
                    return (
                      <div key={k} className="grid grid-cols-[36px_1fr_132px] items-center gap-2">
                        <span className={`text-xs ${k === m0 ? "font-semibold" : "text-muted"}`}>{MESES[k]}</span>
                        <span className="block h-1.5 overflow-hidden rounded-full bg-[#E6E8E3]">
                          <span className={`block h-full rounded-full ${BAR[s2]}`} style={{ width: `${b.limits[k] ? Math.min(100, (b.spent[k] / b.limits[k]) * 100) : 0}%` }} />
                        </span>
                        <span className="num text-right text-[11.5px] text-muted">
                          {fmt(b.spent[k])} / {fmt(b.limits[k])}
                        </span>
                      </div>
                    );
                  })}
                  <Link href={`/budget/${b.id}?ano=${year}`} className="mt-1.5 flex h-11 items-center justify-center rounded-[10px] border border-line bg-card text-[13px] font-semibold">
                    Editar budget
                  </Link>
                </div>
              )}
            </section>
          );
        })}
      </div>

      {budgets.length > 0 && (
        <section className="hidden overflow-x-auto rounded-2xl border border-line bg-card md:block">
          <div className="flex w-max min-w-full flex-col">
            <div className="flex border-b border-line bg-soft">
              <div className="sticky left-0 w-[200px] shrink-0 bg-soft px-4 py-3 text-[13px] font-semibold">Budget × mês</div>
              {MESES.map((m, k) => (
                <Link
                  key={m}
                  href={`/budget?ano=${year}&m=${k}`}
                  className={`min-w-[92px] flex-1 px-2.5 py-3 text-right text-[11px] uppercase tracking-wider ${k === m0 ? "font-bold text-in-ink" : "text-muted"}`}
                >
                  {m}
                </Link>
              ))}
            </div>
            {budgets.map((b) => (
              <div key={b.id} className="flex border-t border-line-2">
                <div className="sticky left-0 flex h-[52px] w-[200px] shrink-0 items-center bg-card px-4 text-[13.5px] font-medium">{b.name}</div>
                {MESES.map((_, k) => {
                  const s2 = statusOf(b.spent[k], b.limits[k], b.alertPct);
                  return (
                    <div key={k} className="flex h-[52px] min-w-[92px] flex-1 p-1">
                      <span className={`flex flex-1 flex-col items-end justify-center rounded-lg px-2 ${CELL[s2]} ${k === m0 ? "ring-2 ring-ink ring-inset" : ""}`}>
                        <span className="num text-[12.5px] font-semibold">{b.spent[k] ? `${Math.round((b.spent[k] / b.limits[k]) * 100)}%` : "—"}</span>
                        <span className="num text-[10.5px] opacity-80">{fmt(b.limits[k])}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
