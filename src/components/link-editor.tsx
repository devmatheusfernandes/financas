"use client";

import { MESES, fmt, zeros } from "@/lib/format";
import { IconLink, IconX } from "./ui";

export type LinkSource = { refTableId: string | null; refLineId: string | null; sign: 1 | -1 };
export type LinkTables = {
  id: string;
  name: string;
  sum: number[];
  lines: { id: string; name: string; vals: number[] }[];
}[];

export function sourceKey(s: LinkSource) {
  return s.refTableId ? `t:${s.refTableId}` : `l:${s.refLineId}`;
}

export function evalLinkSources(sources: LinkSource[], tables: LinkTables): number[] {
  const v = zeros();
  for (const s of sources) {
    let arr: number[] | undefined;
    if (s.refTableId) arr = tables.find((t) => t.id === s.refTableId)?.sum;
    else for (const t of tables) arr = arr ?? t.lines.find((l) => l.id === s.refLineId)?.vals;
    if (arr) for (let i = 0; i < 12; i++) v[i] += s.sign * arr[i];
  }
  return v;
}

export function LinkEditor({
  value,
  onChange,
  tables,
  excludeTableId,
  excludeLineId,
  month,
  title = "Este valor é calculado a partir de:",
  showPreview = true,
}: {
  value: LinkSource[];
  onChange: (v: LinkSource[]) => void;
  tables: LinkTables;
  excludeTableId?: string;
  excludeLineId?: string;
  month: number;
  title?: string;
  showPreview?: boolean;
}) {
  const tableOpts = tables.filter((t) => t.id !== excludeTableId);
  const lineOpts = tables.flatMap((t) => t.lines.filter((l) => l.id !== excludeLineId).map((l) => ({ id: l.id, label: `${t.name} › ${l.name}` })));
  const result = evalLinkSources(value, tables);

  const setAt = (i: number, s: LinkSource) => onChange(value.map((x, k) => (k === i ? s : x)));
  const fromKey = (k: string, sign: 1 | -1): LinkSource =>
    k.startsWith("t:") ? { refTableId: k.slice(2), refLineId: null, sign } : { refTableId: null, refLineId: k.slice(2), sign };

  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-edge-link bg-tint-link p-3.5">
      <div className="flex items-center gap-2 text-[13px] font-semibold text-link-ink">
        <IconLink size={14} /> {title}
      </div>
      {value.map((s, i) => {
        const one = evalLinkSources([s], tables);
        return (
          <div key={i} className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setAt(i, { ...s, sign: s.sign === 1 ? -1 : 1 })}
              aria-label={s.sign === 1 ? "Somando — trocar para subtrair" : "Subtraindo — trocar para somar"}
              className={`num size-10 shrink-0 rounded-[10px] border text-lg font-semibold ${
                s.sign === 1 ? "border-edge-in bg-in-soft text-in-ink" : "border-edge-out bg-over-soft text-neg"
              }`}
            >
              {s.sign === 1 ? "+" : "−"}
            </button>
            <select
              aria-label="Origem"
              value={sourceKey(s)}
              onChange={(e) => setAt(i, fromKey(e.target.value, s.sign))}
              className="h-10 min-w-0 flex-1 rounded-[10px] border border-line bg-card px-2 text-[13px]"
            >
              <optgroup label="Tabela inteira (total)">
                {tableOpts.map((t) => (
                  <option key={t.id} value={`t:${t.id}`}>
                    {t.name} (total)
                  </option>
                ))}
              </optgroup>
              <optgroup label="Linha específica">
                {lineOpts.map((l) => (
                  <option key={l.id} value={`l:${l.id}`}>
                    {l.label}
                  </option>
                ))}
              </optgroup>
            </select>
            <span className="num hidden w-20 shrink-0 text-right text-xs text-muted sm:block">{fmt(one[month])}</span>
            <button
              type="button"
              onClick={() => onChange(value.filter((_, k) => k !== i))}
              aria-label="Remover origem"
              className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted"
            >
              <IconX size={15} />
            </button>
          </div>
        );
      })}
      {value.length === 0 && <span className="text-[13px] text-muted">Nenhuma origem ainda.</span>}
      <button
        type="button"
        onClick={() =>
          onChange([
            ...value,
            tableOpts[0] ? { refTableId: tableOpts[0].id, refLineId: null, sign: 1 } : { refTableId: null, refLineId: lineOpts[0]?.id ?? null, sign: 1 },
          ])
        }
        className="h-10 self-start rounded-[10px] border-[1.5px] border-dashed border-edge-link bg-card px-3 text-[13px] font-medium text-link-ink"
      >
        + Adicionar origem
      </button>
      {showPreview && (
        <>
          <div className="flex items-baseline justify-between border-t border-edge-link pt-2.5">
            <span className="text-[13px] text-muted">Resultado em {MESES[month]}</span>
            <span className="num text-xl font-semibold">{fmt(result[month])}</span>
          </div>
          <div className="grid grid-cols-4 gap-1 sm:grid-cols-6">
            {result.map((v, m) => (
              <div key={m} className={`flex flex-col rounded-md border px-1.5 py-1 ${m === month ? "border-edge-in bg-in-soft text-in-ink" : "border-edge-link bg-card"}`}>
                <span className="text-[10px] uppercase tracking-wider text-muted">{MESES[m]}</span>
                <span className="num text-[11px]">{fmt(v)}</span>
              </div>
            ))}
          </div>
          <span className="text-xs leading-relaxed text-muted">Recalcula sozinho sempre que algo nas origens muda. Use − para descontar (ex.: estornos).</span>
        </>
      )}
    </div>
  );
}
