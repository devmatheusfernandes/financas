"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useToast } from "@/components/app-shell";
import { LinkEditor, evalLinkSources, type LinkSource, type LinkTables } from "@/components/link-editor";
import { Field, IconSpark, MoneyInput, Segmented, btnDanger, btnGhost, btnPrimary, inputCls } from "@/components/ui";
import { MESES, fmtR, toInput } from "@/lib/format";
import { deleteBudget, saveBudget } from "@/server/actions";

export type BudgetInitial = {
  id?: string;
  name: string;
  defaultLimitCents: number;
  alertPct: number;
  sources: LinkSource[];
  limits: number[]; // limites efetivos do ano (12)
};

export function BudgetForm({ initial, tables, year, curM0 }: { initial: BudgetInitial; tables: LinkTables; year: number; curM0: number }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(initial.name);
  const [sources, setSources] = useState<LinkSource[]>(initial.sources);
  const [limit, setLimit] = useState(toInput(initial.defaultLimitCents));
  const hasOverrides = initial.limits.some((l) => l !== initial.defaultLimitCents);
  const [mode, setMode] = useState<"same" | "per">(hasOverrides ? "per" : "same");
  const [perMonth, setPerMonth] = useState<string[]>(initial.limits.map((l) => toInput(l)));
  const [alert, setAlert] = useState(initial.alertPct);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  const suggestion = useMemo(() => {
    const v = evalLinkSources(sources, tables);
    const last = curM0 >= 0 ? curM0 : 11;
    const used = v.slice(0, last + 1).filter((x) => x > 0);
    if (!used.length) return null;
    const avg = Math.round(used.reduce((a, b) => a + b, 0) / used.length);
    return { avg, months: used.length, rounded: Math.ceil(avg / 5000) * 5000 };
  }, [sources, tables, curM0]);

  async function save() {
    setBusy(true);
    setError(null);
    const r = await saveBudget({
      id: initial.id,
      name,
      defaultLimit: limit,
      alertPct: alert,
      year,
      monthLimits: mode === "same" ? Array(12).fill("") : perMonth,
      sources,
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast(initial.id ? "Budget atualizado" : "Budget criado");
    router.push(`/budget?ano=${year}`);
    router.refresh();
  }

  async function remove() {
    if (!initial.id) return;
    setBusy(true);
    const r = await deleteBudget(initial.id);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast("Budget excluído");
    router.push(`/budget?ano=${year}`);
    router.refresh();
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5 px-4 pb-10 pt-5 md:px-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-xs font-medium uppercase tracking-wider text-muted">Budget · {year}</span>
          <h1 className="text-[26px] font-semibold tracking-tight">{initial.id ? "Editar budget" : "Novo budget"}</h1>
        </div>
        <Link href={`/budget?ano=${year}`} className="text-sm font-semibold text-in">
          Voltar
        </Link>
      </div>

      <Field label="Nome">
        <input className={`${inputCls} h-12`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Alimentação" />
      </Field>

      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-muted">Acompanha</span>
        <LinkEditor
          value={sources}
          onChange={setSources}
          tables={tables}
          month={curM0 >= 0 ? curM0 : 0}
          title="Tudo que entrar aqui no mês conta no budget:"
          showPreview={false}
        />
        <span className="text-xs text-muted">Pode somar várias origens — ex.: a linha Alimentação + as compras de mercado do Cartão.</span>
      </div>

      <div className="flex flex-col gap-2.5 rounded-2xl border border-edge-in-2 bg-tint-in-2 p-3.5">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-in-ink">
          <IconSpark size={14} /> Sugestão
        </span>
        {suggestion ? (
          <>
            <span className="text-[13.5px] leading-relaxed">
              Em {year} essas origens tiveram valor em {suggestion.months} {suggestion.months > 1 ? "meses" : "mês"}, com média de{" "}
              <b className="num">{fmtR(suggestion.avg)}</b>.
            </span>
            <button
              type="button"
              onClick={() => {
                setLimit(toInput(suggestion.rounded));
                setMode("same");
              }}
              className="h-10 self-start rounded-[10px] border border-edge-in bg-card px-3.5 text-[13px] font-semibold text-in-ink"
            >
              Usar {fmtR(suggestion.rounded)}/mês
            </button>
          </>
        ) : (
          <span className="text-[13.5px] text-muted">Ainda não há valores nessas origens em {year} para sugerir um limite.</span>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        <span className="text-[13px] font-medium text-muted">Limite por mês</span>
        <Segmented
          value={mode}
          onChange={(v) => {
            if (v === "per") setPerMonth((p) => p.map((x) => x || limit));
            setMode(v);
          }}
          options={[
            { value: "same", label: "Mesmo valor" },
            { value: "per", label: "Valor por mês" },
          ]}
        />
        <MoneyInput value={limit} onChange={setLimit} label={mode === "same" ? "Limite mensal" : "Limite padrão"} />
        {mode === "per" && (
          <>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {MESES.map((m, i) => (
                <label key={m} className={`flex flex-col gap-0.5 rounded-[10px] border px-2 py-1.5 ${i === curM0 ? "border-edge-in bg-tint-in" : "border-line"}`}>
                  <span className="text-[11px] uppercase tracking-wider text-muted">{m}</span>
                  <input
                    inputMode="decimal"
                    className="num w-full bg-transparent text-sm font-semibold outline-none"
                    value={perMonth[i]}
                    onChange={(e) => setPerMonth(perMonth.map((x, k) => (k === i ? e.target.value : x)))}
                  />
                </label>
              ))}
            </div>
            <span className="text-xs text-muted">Útil para meses com gasto maior, como luz no inverno ou viagens.</span>
          </>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-medium text-muted">Avisar quando chegar em</span>
        <div className="flex gap-2">
          {[70, 80, 90, 100].map((n) => (
            <button
              type="button"
              key={n}
              aria-pressed={alert === n}
              onClick={() => setAlert(n)}
              className={`h-11 flex-1 rounded-[10px] border text-sm ${alert === n ? "border-ink bg-ink font-semibold text-on-ink" : "border-line bg-card"}`}
            >
              {n}%
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-over-soft px-3 py-2 text-sm text-neg">
          {error}
        </p>
      )}

      {!confirmDel ? (
        <div className="flex gap-2.5">
          {initial.id && (
            <button type="button" onClick={() => setConfirmDel(true)} className={btnDanger}>
              Excluir
            </button>
          )}
          <Link href={`/budget?ano=${year}`} className={`${btnGhost} flex items-center`}>
            Cancelar
          </Link>
          <button onClick={save} disabled={busy} className={`${btnPrimary} flex-1`}>
            {busy ? "Salvando…" : initial.id ? "Salvar" : "Criar budget"}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl bg-over-soft p-3">
          <span className="flex-1 text-sm text-neg">Excluir o budget “{name}”?</span>
          <button onClick={() => setConfirmDel(false)} className={btnGhost}>
            Não
          </button>
          <button onClick={remove} disabled={busy} className={`${btnPrimary} bg-neg`}>
            Excluir
          </button>
        </div>
      )}
    </main>
  );
}
