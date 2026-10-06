"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useToast } from "@/components/app-shell";
import type { ImportSummary } from "@/server/spreadsheet";

type Mode = "add" | "replace";

export function ImportExport() {
  const router = useRouter();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode>("add");
  const [preview, setPreview] = useState<ImportSummary | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(dry: boolean) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("mode", mode);
      fd.set("dry", dry ? "1" : "0");
      const r = await fetch("/api/import", { method: "POST", body: fd });
      const j = await r.json();
      if (!j.ok) {
        setPreview(null);
        setError(j.error);
      } else if (dry) setPreview(j.summary);
      else {
        toast("Planilha importada");
        setPreview(null);
        setFile(null);
        if (input.current) input.current.value = "";
        router.refresh();
      }
    } catch {
      setError("Não consegui enviar o arquivo. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  const linkCls = "flex h-10 flex-1 items-center justify-center rounded-[10px] border border-line text-sm font-medium";

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-4">
      <h2 className="text-[15px] font-semibold">Importar e exportar</h2>
      <p className="text-sm text-muted">
        Use planilhas do Excel ou Google Planilhas (.xlsx). Cada linha tem <b>Tabela</b>, <b>Tipo</b>, <b>Linha</b> e uma coluna
        por mês (jan/26, fev/26…).
      </p>
      <div className="flex gap-2">
        <a href="/api/export" className={linkCls}>
          Exportar tudo
        </a>
        <a href="/api/export?modelo=1" className={linkCls}>
          Baixar modelo
        </a>
      </div>

      <div className="flex flex-col gap-2 rounded-xl bg-soft p-3">
        <span className="text-[13px] font-medium">Importar planilha</span>
        <input
          ref={input}
          type="file"
          accept=".xlsx"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setPreview(null);
            setError("");
          }}
          className="text-sm"
        />
        <div className="flex flex-col gap-1 text-sm">
          <label className="flex items-start gap-2">
            <input type="radio" checked={mode === "add"} onChange={() => { setMode("add"); setPreview(null); }} className="mt-1" />
            <span>
              <b>Somar</b> aos lançamentos que já existem
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input type="radio" checked={mode === "replace"} onChange={() => { setMode("replace"); setPreview(null); }} className="mt-1" />
            <span>
              <b>Substituir</b> os meses preenchidos no arquivo (apaga o que existia nessas linhas e meses)
            </span>
          </label>
        </div>
        <button
          disabled={!file || busy}
          onClick={() => send(true)}
          className="h-10 rounded-[10px] bg-ink text-sm font-semibold text-on-ink disabled:opacity-40"
        >
          {busy && !preview ? "Lendo…" : "Conferir antes de importar"}
        </button>
        {error && (
          <p role="alert" className="rounded-lg bg-over-soft px-3 py-2 text-sm text-neg">
            {error}
          </p>
        )}
        {preview && (
          <div className="flex flex-col gap-2 rounded-lg border border-line bg-card p-3 text-sm">
            <span>
              {preview.rows} linhas, de <b>{preview.from}</b> a <b>{preview.to}</b>
            </span>
            <ul className="list-disc pl-5 text-muted">
              <li>{preview.values} valores a lançar</li>
              <li>
                {preview.newTables.length} tabelas novas{preview.newTables.length ? `: ${preview.newTables.join(", ")}` : ""}
              </li>
              <li>{preview.newLines} linhas novas</li>
              {mode === "replace" && <li>{preview.replaced} lançamentos existentes serão apagados</li>}
              {preview.skippedLinked.length > 0 && (
                <li>Ignoradas (calculadas por vínculo): {preview.skippedLinked.join(", ")}</li>
              )}
            </ul>
            <button
              disabled={busy}
              onClick={() => send(false)}
              className="h-10 rounded-[10px] bg-in text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy ? "Importando…" : "Importar"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
