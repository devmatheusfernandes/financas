"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createEntry, deleteEntry, getCellEntries, setLineMode, updateEntry, type CellEntry } from "@/server/actions";
import { MESES, MESES_LONGOS, fmtR, monthStr, parseCents, toInput } from "@/lib/format";
import type { SheetLine, SheetTable } from "@/app/(app)/planilha/sheet-view";
import { useToast } from "./app-shell";
import { LinkEditor, type LinkSource } from "./link-editor";
import { SkeletonLista } from "./skeletons";
import { Field, MoneyInput, Segmented, Sheet, btnDanger, btnGhost, btnPrimary, inputCls } from "./ui";

type View = { kind: "loading" } | { kind: "list" } | { kind: "new" } | { kind: "edit"; entry: CellEntry } | { kind: "link" };

const FREQ_LABEL = { once: "Única", monthly: "Mensal", yearly: "Anual", installments: "Parcelada" } as const;
const SOURCE_LABEL: Record<string, string> = { ai_text: "IA · texto", ai_photo: "IA · foto", ai_audio: "IA · áudio", import: "Importado" };

export function CellPanel({
  line,
  tableName,
  year,
  m0,
  tables,
  onClose,
}: {
  line: SheetLine & { table: SheetTable };
  tableName: string;
  year: number;
  m0: number;
  tables: SheetTable[];
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const month = monthStr(year, m0);
  const [view, setView] = useState<View>(line.isLinked ? { kind: "link" } : { kind: "loading" });
  const [items, setItems] = useState<CellEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function apply(r: Awaited<ReturnType<typeof getCellEntries>>, goTo?: View) {
    if (!r.ok) {
      setError(r.error);
      setView({ kind: "list" });
      return;
    }
    setItems(r.entries);
    setView(goTo ?? (r.entries.length ? { kind: "list" } : { kind: "new" }));
  }
  async function reload(goTo?: View) {
    apply(await getCellEntries(line.id, month), goTo);
  }

  useEffect(() => {
    if (line.isLinked) return;
    let alive = true;
    getCellEntries(line.id, month).then((r) => alive && apply(r));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const done = (msg: string, close = true) => {
    toast(msg);
    router.refresh();
    if (close) onClose();
    else reload({ kind: "list" });
  };

  const title =
    view.kind === "link" ? (line.isLinked ? "Linha vinculada" : "Vincular linha") : view.kind === "new" ? "Novo lançamento" : view.kind === "edit" ? "Editar lançamento" : line.name;

  return (
    <Sheet open onClose={onClose} title={title} subtitle={`${tableName} › ${line.name} · ${MESES_LONGOS[m0]} ${year}`}>
      {error && (
        <p role="alert" className="mb-3 rounded-lg bg-over-soft px-3 py-2 text-sm text-neg">
          {error}
        </p>
      )}

      {view.kind === "loading" && <SkeletonLista />}

      {view.kind === "list" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted">Total no mês</span>
            <span className="num text-2xl font-semibold">{fmtR(line.vals[m0])}</span>
          </div>
          <ul className="flex flex-col divide-y divide-line-2 overflow-hidden rounded-2xl border border-line">
            {items.map((e) => (
              <li key={e.id}>
                <button onClick={() => setView({ kind: "edit", entry: e })} className="flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-soft">
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate text-[15px] font-medium">{e.description || line.name}</span>
                    <span className="flex flex-wrap gap-1.5 text-[11.5px] text-muted">
                      {e.series ? (
                        <span className="rounded bg-soft-2 px-1.5 py-0.5">
                          {FREQ_LABEL[e.series.frequency]} · {e.series.occurrence}
                          {e.series.total ? ` de ${e.series.total}` : ""}
                        </span>
                      ) : (
                        <span className="rounded bg-soft-2 px-1.5 py-0.5">Única</span>
                      )}
                      {SOURCE_LABEL[e.source] && <span className="rounded bg-in-soft px-1.5 py-0.5 text-in-ink">{SOURCE_LABEL[e.source]}</span>}
                      {e.occurredOn && <span>{e.occurredOn.split("-").reverse().join("/")}</span>}
                    </span>
                  </span>
                  <span className="num text-[15px] font-semibold">{fmtR(e.amountCents)}</span>
                </button>
              </li>
            ))}
          </ul>
          <button onClick={() => setView({ kind: "new" })} className={`${btnGhost} border-dashed`}>
            + Novo lançamento em {MESES[m0]}
          </button>
          <button onClick={() => setView({ kind: "link" })} className="self-start text-[13px] font-medium text-link-ink">
            Transformar em linha vinculada…
          </button>
        </div>
      )}

      {view.kind === "new" && (
        <NewEntryForm
          lineId={line.id}
          year={year}
          m0={m0}
          busy={busy}
          onCancel={items.length ? () => setView({ kind: "list" }) : onClose}
          onSubmit={async (payload) => {
            setBusy(true);
            setError(null);
            const r = await createEntry(payload);
            setBusy(false);
            if (!r.ok) return setError(r.error);
            done(r.count > 1 ? `Criado em ${r.count} meses` : "Lançamento criado");
          }}
          onLink={() => setView({ kind: "link" })}
        />
      )}

      {view.kind === "edit" && (
        <EditEntryForm
          entry={view.entry}
          lineId={line.id}
          tables={tables}
          month={m0}
          busy={busy}
          onCancel={() => setView({ kind: "list" })}
          onSave={async (p) => {
            setBusy(true);
            setError(null);
            const r = await updateEntry({ entryId: view.entry.id, ...p });
            setBusy(false);
            if (!r.ok) return setError(r.error);
            done(r.count > 1 ? `Atualizado em ${r.count} meses` : "Lançamento atualizado");
          }}
          onDelete={async (scope) => {
            setBusy(true);
            setError(null);
            const r = await deleteEntry({ entryId: view.entry.id, scope });
            setBusy(false);
            if (!r.ok) return setError(r.error);
            done(r.count > 1 ? `Removido de ${r.count} meses` : "Lançamento removido");
          }}
        />
      )}

      {view.kind === "link" && (
        <LinkView
          line={line}
          tables={tables}
          m0={m0}
          busy={busy}
          onCancel={line.isLinked ? onClose : () => reload()}
          onSave={async (sources) => {
            setBusy(true);
            setError(null);
            const r = await setLineMode({ lineId: line.id, mode: "linked", sources });
            setBusy(false);
            if (!r.ok) return setError(r.error);
            done("Vínculo salvo");
          }}
          onUnlink={async () => {
            setBusy(true);
            const r = await setLineMode({ lineId: line.id, mode: "fixed" });
            setBusy(false);
            if (!r.ok) return setError(r.error);
            done("A linha voltou a usar valores próprios");
          }}
        />
      )}
    </Sheet>
  );
}

function monthOptions(year: number) {
  const out: { v: string; label: string }[] = [];
  for (let y = year; y <= year + 3; y++) for (let m = 0; m < 12; m++) out.push({ v: monthStr(y, m), label: `${MESES_LONGOS[m]} ${y}` });
  return out;
}

function NewEntryForm({
  lineId,
  year,
  m0,
  busy,
  onCancel,
  onSubmit,
  onLink,
}: {
  lineId: string;
  year: number;
  m0: number;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (p: Parameters<typeof createEntry>[0]) => void;
  onLink: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [freq, setFreq] = useState<"once" | "monthly" | "yearly" | "installments">("once");
  const [endless, setEndless] = useState(true);
  const [until, setUntil] = useState(monthStr(year, 11));
  const [parcelas, setParcelas] = useState("3");
  const start = monthStr(year, m0);
  const help = {
    once: `Aparece só em ${MESES[m0]}/${year}.`,
    monthly: `Aparece todo mês a partir de ${MESES[m0]}/${year}.`,
    yearly: `Aparece uma vez por ano, sempre em ${MESES_LONGOS[m0].toLowerCase()}.`,
    installments: `Aparece em ${parcelas || "N"} meses seguidos a partir de ${MESES[m0]}/${year}.`,
  }[freq];

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          lineId,
          amount,
          description,
          month: start,
          frequency: freq,
          endMonth: (freq === "monthly" || freq === "yearly") && !endless ? until : null,
          installments: freq === "installments" ? Number(parcelas) : null,
        });
      }}
    >
      <MoneyInput big autoFocus value={amount} onChange={setAmount} label={`Valor (${MESES[m0]}/${year})`} />
      <Field label="Descrição (opcional)">
        <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-medium text-muted">Repetição</span>
        <Segmented
          value={freq}
          onChange={setFreq}
          options={(["once", "monthly", "yearly", "installments"] as const).map((v) => ({ value: v, label: FREQ_LABEL[v] }))}
        />
        <span className="text-xs text-muted">{help}</span>
      </div>
      {(freq === "monthly" || freq === "yearly") && (
        <div className="flex flex-col gap-2">
          <label className="flex min-h-11 items-center gap-2.5 text-sm">
            <input type="checkbox" checked={endless} onChange={(e) => setEndless(e.target.checked)} className="size-5 accent-ink" />
            Sem data final
          </label>
          {!endless && (
            <Field label="Repete até">
              <select className={inputCls} value={until} onChange={(e) => setUntil(e.target.value)}>
                {monthOptions(year)
                  .filter((o) => o.v >= start)
                  .map((o) => (
                    <option key={o.v} value={o.v}>
                      {o.label}
                    </option>
                  ))}
              </select>
            </Field>
          )}
        </div>
      )}
      {freq === "installments" && (
        <Field label="Número de parcelas">
          <input type="number" min={1} max={120} className={inputCls} value={parcelas} onChange={(e) => setParcelas(e.target.value)} />
        </Field>
      )}
      <div className="mt-1 flex gap-2.5">
        <button type="button" onClick={onCancel} className={btnGhost}>
          Cancelar
        </button>
        <button disabled={busy || !parseCents(amount)} className={`${btnPrimary} flex-1`}>
          {busy ? "Salvando…" : "Salvar"}
        </button>
      </div>
      <button type="button" onClick={onLink} className="self-start text-[13px] font-medium text-link-ink">
        Em vez de valor fixo, vincular a outras linhas…
      </button>
    </form>
  );
}

function EditEntryForm({
  entry,
  lineId,
  tables,
  month,
  busy,
  onCancel,
  onSave,
  onDelete,
}: {
  entry: CellEntry;
  lineId: string;
  tables: SheetTable[];
  month: number;
  busy: boolean;
  onCancel: () => void;
  onSave: (p: { amount: string; description: string; lineId: string; scope: "one" | "next" | "all" }) => void;
  onDelete: (scope: "one" | "next" | "all") => void;
}) {
  const [amount, setAmount] = useState(toInput(entry.amountCents));
  const [description, setDescription] = useState(entry.description ?? "");
  const [target, setTarget] = useState(lineId);
  const [scope, setScope] = useState<"one" | "next" | "all">("one");
  const [confirmDel, setConfirmDel] = useState(false);
  const lineOpts = tables.flatMap((t) => t.lines.filter((l) => !l.isLinked).map((l) => ({ id: l.id, label: `${t.name} › ${l.name}` })));

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ amount, description, lineId: target, scope });
      }}
    >
      <MoneyInput big value={amount} onChange={setAmount} label={`Valor em ${MESES[month]}`} />
      <Field label="Descrição">
        <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="Linha">
        <select className={inputCls} value={target} onChange={(e) => setTarget(e.target.value)}>
          {lineOpts.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      </Field>
      {entry.series && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-2 text-[13px] font-medium text-muted">
            Aplicar a ({FREQ_LABEL[entry.series.frequency]}, ocorrência {entry.series.occurrence}
            {entry.series.total ? ` de ${entry.series.total}` : ""})
          </legend>
          {(
            [
              ["one", `Só ${MESES[month]}`, "Os outros meses mantêm o valor."],
              ["next", "Este e os próximos", `Muda de ${MESES[month]} em diante.`],
              ["all", "Toda a série", "Muda todas as ocorrências."],
            ] as const
          ).map(([v, label, help]) => (
            <label key={v} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 ${scope === v ? "border-edge-in bg-tint-in" : "border-line"}`}>
              <input type="radio" name="scope" checked={scope === v} onChange={() => setScope(v)} className="mt-0.5 size-[18px] accent-ink" />
              <span className="flex flex-col">
                <span className="text-sm font-semibold">{label}</span>
                <span className="text-xs text-muted">{help}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {!confirmDel ? (
        <div className="mt-1 flex gap-2.5">
          <button type="button" onClick={() => setConfirmDel(true)} className={btnDanger}>
            Excluir
          </button>
          <button type="button" onClick={onCancel} className={btnGhost}>
            Voltar
          </button>
          <button disabled={busy || !parseCents(amount)} className={`${btnPrimary} flex-1`}>
            {busy ? "Salvando…" : "Salvar"}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-xl bg-over-soft p-3">
          <span className="text-sm text-neg">
            Excluir {entry.series ? (scope === "one" ? `só ${MESES[month]}` : scope === "next" ? "este e os próximos" : "toda a série") : "este lançamento"}?
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setConfirmDel(false)} className={btnGhost}>
              Cancelar
            </button>
            <button type="button" disabled={busy} onClick={() => onDelete(scope)} className={`${btnPrimary} flex-1 bg-neg`}>
              Excluir
            </button>
          </div>
        </div>
      )}
    </form>
  );
}

function LinkView({
  line,
  tables,
  m0,
  busy,
  onCancel,
  onSave,
  onUnlink,
}: {
  line: SheetLine & { table: SheetTable };
  tables: SheetTable[];
  m0: number;
  busy: boolean;
  onCancel: () => void;
  onSave: (s: LinkSource[]) => void;
  onUnlink: () => void;
}) {
  const others = tables.filter((t) => t.id !== line.table.id);
  const [sources, setSources] = useState<LinkSource[]>(
    line.sources.length
      ? line.sources.map((s) => ({ refTableId: s.refTableId, refLineId: s.refLineId, sign: s.sign < 0 ? -1 : 1 }))
      : others[0]
        ? [{ refTableId: others[0].id, refLineId: null, sign: 1 }]
        : [],
  );
  return (
    <div className="flex flex-col gap-4">
      {!line.isLinked && (
        <p className="text-sm leading-relaxed text-muted">
          A linha vai passar a ser a soma das origens abaixo em todos os meses. Os lançamentos que ela já tem ficam guardados e voltam se você
          desfizer o vínculo.
        </p>
      )}
      <LinkEditor value={sources} onChange={setSources} tables={tables} excludeTableId={line.table.id} excludeLineId={line.id} month={m0} />
      <div className="flex gap-2.5">
        <button type="button" onClick={onCancel} className={btnGhost}>
          {line.isLinked ? "Fechar" : "Voltar"}
        </button>
        <button disabled={busy || !sources.length} onClick={() => onSave(sources)} className={`${btnPrimary} flex-1`}>
          {busy ? "Salvando…" : "Salvar vínculo"}
        </button>
      </div>
      {line.isLinked && (
        <button onClick={onUnlink} disabled={busy} className="self-start text-[13px] font-medium text-neg">
          Desfazer vínculo (voltar a valor fixo)
        </button>
      )}
    </div>
  );
}
