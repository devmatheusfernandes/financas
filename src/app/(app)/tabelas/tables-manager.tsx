"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/app-shell";
import { LinkEditor, type LinkSource, type LinkTables } from "@/components/link-editor";
import { Field, IconChevron, IconLink, IconX, Segmented, Sheet, btnDanger, btnGhost, btnPrimary, inputCls } from "@/components/ui";
import {
  createLine,
  createTable,
  deleteLine,
  deleteTable,
  moveLine,
  moveTable,
  renameLine,
  setLineMode,
  updateTable,
} from "@/server/actions";

type Kind = "in" | "out" | "sub";
type TLine = { id: string; name: string; isLinked: boolean; sources: LinkSource[] };
type T = { id: string; name: string; kind: Kind; color: string; lines: TLine[] };

const KIND_LABEL: Record<Kind, string> = { in: "Entradas", out: "Saídas", sub: "Auxiliar" };
const KIND_HELP: Record<Kind, string> = {
  in: "Soma no total de entradas do balanço.",
  out: "Soma no total de saídas do balanço.",
  sub: "Não entra direto no balanço — use um vínculo numa linha de Saídas (ex.: Cartão de crédito).",
};
const SWATCHES = ["#2459C7", "#C2571A", "#6B4BB0", "#0F7C80", "#8A6410", "#3F6E2A", "#9C3F74", "#16191B"];

type Dialog =
  | { kind: "newTable" }
  | { kind: "editTable"; t: T }
  | { kind: "newLine"; t: T }
  | { kind: "editLine"; t: T; l: TLine }
  | null;

export function TablesManager({ tables, linkTables, curM0 }: { tables: T[]; linkTables: LinkTables; curM0: number }) {
  const router = useRouter();
  const toast = useToast();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) {
    setBusy(true);
    setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) {
      setError(("error" in r && r.error) || "Erro");
      return false;
    }
    toast(msg);
    setDialog(null);
    router.refresh();
    return true;
  }
  const close = () => {
    setDialog(null);
    setError(null);
  };

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 pb-10 pt-5 md:px-6">
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-xs font-medium uppercase tracking-wider text-muted">Estrutura</span>
          <h1 className="text-[26px] font-semibold tracking-tight">Tabelas e linhas</h1>
        </div>
        <button onClick={() => setDialog({ kind: "newTable" })} className="h-11 rounded-xl bg-ink px-4 text-sm font-semibold text-on-ink">
          + Nova tabela
        </button>
      </div>

      {tables.map((t, ti) => (
        <section key={t.id} className="overflow-hidden rounded-2xl border border-line bg-card">
          <div className="flex items-center gap-2.5 px-3.5 py-3">
            <span className="size-3 shrink-0 rounded-[3px]" style={{ background: t.color }} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-[15px] font-semibold">{t.name}</span>
              <span className="text-xs text-muted">{KIND_LABEL[t.kind]}</span>
            </div>
            <button disabled={ti === 0} onClick={() => run(() => moveTable(t.id, -1), "Ordem atualizada")} aria-label="Mover para cima" className="flex size-9 items-center justify-center rounded-lg text-muted disabled:opacity-30">
              <span className="-rotate-90">
                <IconChevron size={16} />
              </span>
            </button>
            <button
              disabled={ti === tables.length - 1}
              onClick={() => run(() => moveTable(t.id, 1), "Ordem atualizada")}
              aria-label="Mover para baixo"
              className="flex size-9 items-center justify-center rounded-lg text-muted disabled:opacity-30"
            >
              <IconChevron dir="down" size={16} />
            </button>
            <button onClick={() => setDialog({ kind: "editTable", t })} className="h-9 rounded-lg border border-line px-3 text-[13px] font-medium">
              Editar
            </button>
          </div>
          <ul className="divide-y divide-line-2 border-t border-line-2">
            {t.lines.map((l, li) => (
              <li key={l.id} className="flex items-center gap-2 py-1 pl-9 pr-3">
                <button onClick={() => setDialog({ kind: "editLine", t, l })} className="flex min-h-11 min-w-0 flex-1 flex-col items-start justify-center text-left">
                  <span className="truncate text-sm">{l.name}</span>
                  {l.isLinked && (
                    <span className="flex items-center gap-1 text-[11px] text-link-ink">
                      <IconLink size={10} /> vinculada · {l.sources.length} {l.sources.length === 1 ? "origem" : "origens"}
                    </span>
                  )}
                </button>
                <button disabled={li === 0} onClick={() => run(() => moveLine(l.id, -1), "Ordem atualizada")} aria-label="Subir linha" className="flex size-9 items-center justify-center text-muted disabled:opacity-30">
                  <span className="-rotate-90">
                    <IconChevron size={14} />
                  </span>
                </button>
                <button
                  disabled={li === t.lines.length - 1}
                  onClick={() => run(() => moveLine(l.id, 1), "Ordem atualizada")}
                  aria-label="Descer linha"
                  className="flex size-9 items-center justify-center text-muted disabled:opacity-30"
                >
                  <IconChevron dir="down" size={14} />
                </button>
              </li>
            ))}
          </ul>
          <button onClick={() => setDialog({ kind: "newLine", t })} className="w-full border-t border-line-2 px-3.5 py-3 text-left text-[13px] font-semibold text-in">
            + Nova linha em {t.name}
          </button>
        </section>
      ))}

      {dialog?.kind === "newTable" && <TableDialog busy={busy} error={error} onClose={close} onSave={(v) => run(() => createTable(v), "Tabela criada")} />}
      {dialog?.kind === "editTable" && (
        <TableDialog
          t={dialog.t}
          busy={busy}
          error={error}
          onClose={close}
          onSave={(v) => run(() => updateTable({ tableId: dialog.t.id, ...v, color: v.color ?? dialog.t.color }), "Tabela atualizada")}
          onDelete={() => run(() => deleteTable(dialog.t.id), "Tabela excluída")}
        />
      )}
      {dialog?.kind === "newLine" && (
        <LineDialog
          t={dialog.t}
          linkTables={linkTables}
          curM0={curM0}
          busy={busy}
          error={error}
          onClose={close}
          onSave={(v) => run(() => createLine({ tableId: dialog.t.id, name: v.name, isLinked: v.linked, sources: v.sources }), "Linha criada")}
        />
      )}
      {dialog?.kind === "editLine" && (
        <LineDialog
          t={dialog.t}
          l={dialog.l}
          linkTables={linkTables}
          curM0={curM0}
          busy={busy}
          error={error}
          onClose={close}
          onSave={async (v) => {
            const l = dialog.l;
            setBusy(true);
            setError(null);
            if (v.name !== l.name) {
              const r = await renameLine(l.id, v.name);
              if (!r.ok) {
                setBusy(false);
                return setError(r.error);
              }
            }
            const r2 =
              v.linked || l.isLinked
                ? await setLineMode({ lineId: l.id, mode: v.linked ? "linked" : "fixed", sources: v.sources })
                : { ok: true as const };
            setBusy(false);
            if (!r2.ok) return setError(r2.error);
            toast("Linha atualizada");
            setDialog(null);
            router.refresh();
          }}
          onDelete={() => run(() => deleteLine(dialog.l.id), "Linha excluída")}
        />
      )}
    </main>
  );
}

function TableDialog({
  t,
  busy,
  error,
  onClose,
  onSave,
  onDelete,
}: {
  t?: T;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (v: { name: string; kind: Kind; color?: string }) => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(t?.name ?? "");
  const [kind, setKind] = useState<Kind>(t?.kind ?? "sub");
  const [color, setColor] = useState(t?.color);
  const [del, setDel] = useState(false);
  return (
    <Sheet
      open
      onClose={onClose}
      title={t ? "Editar tabela" : "Nova tabela"}
      footer={
        del ? (
          <>
            <span className="flex-1 self-center text-sm text-neg">Excluir “{t?.name}” e todos os lançamentos dela?</span>
            <button onClick={() => setDel(false)} className={btnGhost}>
              Não
            </button>
            <button onClick={onDelete} disabled={busy} className={`${btnPrimary} bg-neg`}>
              Excluir
            </button>
          </>
        ) : (
          <>
            {onDelete && (
              <button onClick={() => setDel(true)} className={btnDanger}>
                Excluir
              </button>
            )}
            <button onClick={onClose} className={btnGhost}>
              Cancelar
            </button>
            <button disabled={busy || !name.trim()} onClick={() => onSave({ name, kind, color })} className={`${btnPrimary} flex-1`}>
              Salvar
            </button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Nome">
          <input autoFocus className={`${inputCls} h-12`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Assinaturas" />
        </Field>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium text-muted">Tipo</span>
          <Segmented value={kind} onChange={setKind} options={(["in", "out", "sub"] as const).map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
          <span className="text-xs text-muted">{KIND_HELP[kind]}</span>
        </div>
        {t && (
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-medium text-muted">Cor</span>
            <div className="flex flex-wrap gap-2">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  aria-label={`Cor ${c}`}
                  aria-pressed={color === c}
                  onClick={() => setColor(c)}
                  className={`size-9 rounded-lg ${color === c ? "ring-2 ring-ink ring-offset-2" : ""}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
        )}
        {error && <p className="rounded-lg bg-over-soft px-3 py-2 text-sm text-neg">{error}</p>}
      </div>
    </Sheet>
  );
}

function LineDialog({
  t,
  l,
  linkTables,
  curM0,
  busy,
  error,
  onClose,
  onSave,
  onDelete,
}: {
  t: T;
  l?: TLine;
  linkTables: LinkTables;
  curM0: number;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (v: { name: string; linked: boolean; sources: LinkSource[] }) => void;
  onDelete?: () => void;
}) {
  const others = linkTables.filter((x) => x.id !== t.id);
  const [name, setName] = useState(l?.name ?? "");
  const [linked, setLinked] = useState(l?.isLinked ?? false);
  const [sources, setSources] = useState<LinkSource[]>(
    l?.sources.length ? l.sources : others[0] ? [{ refTableId: others[0].id, refLineId: null, sign: 1 }] : [],
  );
  const [del, setDel] = useState(false);
  return (
    <Sheet
      open
      onClose={onClose}
      title={l ? "Editar linha" : `Nova linha em ${t.name}`}
      footer={
        del ? (
          <>
            <span className="flex-1 self-center text-sm text-neg">Excluir “{l?.name}” e seus lançamentos?</span>
            <button onClick={() => setDel(false)} className={btnGhost}>
              Não
            </button>
            <button onClick={onDelete} disabled={busy} className={`${btnPrimary} bg-neg`}>
              Excluir
            </button>
          </>
        ) : (
          <>
            {onDelete && (
              <button onClick={() => setDel(true)} className={btnDanger} aria-label="Excluir linha">
                <IconX />
              </button>
            )}
            <button onClick={onClose} className={btnGhost}>
              Cancelar
            </button>
            <button disabled={busy || !name.trim() || (linked && !sources.length)} onClick={() => onSave({ name, linked, sources })} className={`${btnPrimary} flex-1`}>
              {busy ? "Salvando…" : "Salvar"}
            </button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Nome">
          <input autoFocus className={`${inputCls} h-12`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Luz" />
        </Field>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium text-muted">Origem do valor</span>
          <Segmented
            value={linked ? "linked" : "fixed"}
            onChange={(v) => setLinked(v === "linked")}
            options={[
              { value: "fixed", label: "Valor fixo" },
              { value: "linked", label: "Vinculado" },
            ]}
          />
        </div>
        {linked && (
          <LinkEditor value={sources} onChange={setSources} tables={linkTables} excludeTableId={t.id} excludeLineId={l?.id} month={Math.max(0, curM0)} />
        )}
        {error && <p className="rounded-lg bg-over-soft px-3 py-2 text-sm text-neg">{error}</p>}
      </div>
    </Sheet>
  );
}
