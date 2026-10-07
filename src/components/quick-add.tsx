"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useOffline } from "next/offline";
import { enfileirar } from "@/lib/offline-queue";
import { useCallback, useEffect, useRef, useState } from "react";
import { addTransaction, budgetImpact, type BudgetImpact } from "@/server/actions";
import { MESES, MESES_LONGOS, fmtR, monthStr, parseCents, parseMonth, toInput, today } from "@/lib/format";
import { Field, IconCamera, IconForm, IconMic, IconSpark, IconText, MoneyInput, Segmented, Sheet, Skel, btnPrimary, inputCls } from "./ui";

export type TableOpt = { id: string; name: string; kind: "in" | "out" | "sub" };
type Mode = "photo" | "audio" | "text" | "manual";
type Result = {
  amount: string;
  description: string;
  tableId: string;
  date: string;
  frequency: Frequency;
  endMonth: string | null;
  installments: string;
  confidence: "high" | "low" | "manual";
  engine?: "ai" | "rules";
  transcript?: string;
  source: "manual" | "ai_text" | "ai_photo" | "ai_audio";
};

type Frequency = "once" | "monthly" | "yearly" | "installments";
const FREQ_LABEL: Record<Frequency, string> = { once: "Pontual", monthly: "Mensal", yearly: "Anual", installments: "Parcelada" };

/** Meses que o lançamento pode alcançar: deste mês até o fim do ano seguinte. */
function mesesFuturos({ year, m0 }: { year: number; m0: number }) {
  const out: { v: string; label: string }[] = [];
  for (let i = 0; i <= (year + 1) * 12 + 11 - (year * 12 + m0); i++) {
    const v = monthStr(year, m0 + i);
    const p = parseMonth(v);
    out.push({ v, label: `${MESES_LONGOS[p.m0]} ${p.year}` });
  }
  return out;
}

const EXAMPLES = ["mercado 87,50 ontem", "spotify 31,90 no cartão", "gasolina 150"];

async function downscale(file: File, max = 1600): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise((res) => canvas.toBlob((b) => res(b ?? file), "image/jpeg", 0.85));
  } catch {
    return file;
  }
}

export function QuickAdd({
  open,
  onClose,
  tables,
  ai,
  audio,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  tables: TableOpt[];
  ai: boolean;
  audio: boolean;
  onSaved: (msg: string) => void;
}) {
  const router = useRouter();
  const offline = useOffline();
  const [mode, setMode] = useState<Mode>("text");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<Result | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [impactState, setImpactState] = useState<{ key: string; impacts: BudgetImpact[] }>({ key: "", impacts: [] });
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setText("");
    setRes(null);
    setError(null);
    setPhotoUrl(null);
  }, []);

  const handleClose = useCallback(() => {
    if (recorder.current && recorder.current.state !== "inactive") {
      recorder.current.onstop = null;
      recorder.current.stream.getTracks().forEach((t) => t.stop());
      recorder.current.stop();
    }
    setRecording(false);
    onClose();
  }, [onClose]);

  const blankManual = (): Result => ({
    amount: "",
    description: "",
    tableId: "",
    date: today().iso,
    frequency: "once",
    endMonth: null,
    installments: "3",
    confidence: "manual",
    source: "manual",
  });

  function pickMode(m: Mode) {
    setMode(m);
    setError(null);
    setRes(m === "manual" ? blankManual() : null);
    setPhotoUrl(null);
  }

  async function send(form: FormData, source: Result["source"]) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/ai/suggest", { method: "POST", body: form });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Falhou");
      setRes({
        amount: toInput(j.amountCents),
        description: j.description ?? "",
        tableId: j.tableId ?? "",
        date: j.date ?? today().iso,
        frequency: "once",
        endMonth: null,
        installments: "3",
        confidence: j.confidence,
        engine: j.engine,
        transcript: j.transcript,
        source,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não consegui interpretar.");
    } finally {
      setBusy(false);
    }
  }

  async function interpretText(t = text) {
    if (!t.trim()) return;
    const f = new FormData();
    f.set("mode", "text");
    f.set("text", t);
    await send(f, "ai_text");
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setPhotoUrl(URL.createObjectURL(file));
    const blob = await downscale(file);
    const f = new FormData();
    f.set("mode", "photo");
    f.set("file", new File([blob], "nota.jpg", { type: blob.type || "image/jpeg" }));
    await send(f, "ai_photo");
  }

  async function toggleRecord() {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunks.current = [];
      mr.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const type = mr.mimeType || "audio/webm";
        const blob = new Blob(chunks.current, { type });
        const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        const f = new FormData();
        f.set("mode", "audio");
        f.set("file", new File([blob], `audio.${ext}`, { type }));
        await send(f, "ai_audio");
      };
      recorder.current = mr;
      mr.start();
      setRecording(true);
      setRes(null);
    } catch {
      setError("Não consegui acessar o microfone. Verifique a permissão do navegador.");
    }
  }

  // budgets afetados
  const month = res?.date ? res.date.slice(0, 7) + "-01" : null;
  const impactKey = res?.tableId && month ? `${res.tableId}|${month}` : "";
  useEffect(() => {
    if (!impactKey) return;
    let alive = true;
    const [tableId, m] = impactKey.split("|");
    budgetImpact(tableId, m).then((r) => alive && setImpactState({ key: impactKey, impacts: r.ok ? r.impacts : [] }));
    return () => {
      alive = false;
    };
  }, [impactKey]);
  const impacts = impactState.key === impactKey ? impactState.impacts : [];

  const mesAno = parseMonth((res?.date ?? today().iso).slice(0, 7) + "-01");
  const cents = res ? parseCents(res.amount) : 0;
  const ajuda = !res
    ? ""
    : {
        once: `Entra só em ${MESES[mesAno.m0]}/${mesAno.year}.`,
        monthly: `Entra todo mês a partir de ${MESES[mesAno.m0]}/${mesAno.year}${res.endMonth ? "" : ", sem data final"}.`,
        yearly: `Entra uma vez por ano, sempre em ${MESES_LONGOS[mesAno.m0].toLowerCase()}.`,
        installments: `Entra em ${Number(res.installments) || "N"} meses seguidos a partir de ${MESES[mesAno.m0]}/${mesAno.year}.`,
      }[res.frequency];
  const sufixoBotao = !res
    ? ""
    : { once: "", monthly: "/mês", yearly: "/ano", installments: ` × ${Number(res.installments) || "?"}` }[res.frequency];
  const parcelasOk = !res || res.frequency !== "installments" || Number(res.installments) >= 2;
  const can = !!res && !!cents && !!res.tableId && !!res.description.trim() && !!res.date && parcelasOk;

  async function confirm() {
    if (!res || !can) return;
    const label = tables.find((t) => t.id === res.tableId)?.name ?? "";
    const dados = {
      tableId: res.tableId,
      name: res.description.trim(),
      amount: res.amount,
      month: res.date.slice(0, 7) + "-01",
      occurredOn: res.date,
      source: res.source,
      frequency: res.frequency,
      endMonth: res.frequency === "monthly" || res.frequency === "yearly" ? res.endMonth : null,
      installments: res.frequency === "installments" ? Number(res.installments) : null,
    };

    // Sem internet o lançamento vai para a fila do aparelho e sobe sozinho quando a conexão volta.
    if (offline) {
      await enfileirar(dados);
      onSaved(`Guardado sem internet: ${dados.name} · ${fmtR(cents)} → ${label}`);
      reset();
      handleClose();
      return;
    }

    setBusy(true);
    const r = await addTransaction(dados);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    const meses = r.count > 1 ? ` · ${r.count} meses` : "";
    onSaved(`Adicionado: ${dados.name} · ${fmtR(cents)}${meses} → ${label}`);
    reset();
    handleClose();
    router.refresh();
  }

  const modes: { m: Mode; label: string; icon: React.ReactNode }[] = [
    { m: "photo", label: "Foto", icon: <IconCamera /> },
    { m: "audio", label: "Áudio", icon: <IconMic /> },
    { m: "text", label: "Texto", icon: <IconText /> },
    { m: "manual", label: "Manual", icon: <IconForm /> },
  ];

  return (
    <Sheet
      open={open}
      onClose={handleClose}
      title="Adicionar rápido"
      subtitle={ai ? "Fale, fotografe ou escreva — a IA preenche" : "Escreva ou preencha — sem IA configurada, uso palavras-chave"}
      footer={
        <button onClick={confirm} disabled={!can || busy} className={`${btnPrimary} flex-1`}>
          {busy && res ? "Salvando…" : can ? `Adicionar ${fmtR(cents)}${sufixoBotao}` : "Adicionar"}
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-4 gap-1.5">
          {modes.map((x) => (
            <button
              key={x.m}
              onClick={() => pickMode(x.m)}
              aria-pressed={mode === x.m}
              className={`flex h-16 flex-col items-center justify-center gap-1 rounded-[14px] border text-[12.5px] ${
                mode === x.m ? "border-ink bg-ink font-semibold text-on-ink" : "border-line bg-card font-medium"
              }`}
            >
              {x.icon}
              {x.label}
            </button>
          ))}
        </div>

        {offline && mode !== "manual" && (
          <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn-ink">
            Sem internet, foto, áudio e texto não são interpretados. Use <b>Manual</b> — o lançamento fica guardado e sobe
            quando a conexão voltar.
          </p>
        )}

        {mode === "text" && (
          <div className="flex flex-col gap-2.5">
            <Field label="Escreva como você falaria">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    interpretText();
                  }
                }}
                rows={2}
                placeholder="Ex.: mercado 87,50 ontem"
                className="resize-none rounded-[14px] border-[1.5px] border-ink px-3.5 py-3 text-[17px] outline-none"
              />
            </Field>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((x) => (
                <button
                  key={x}
                  onClick={() => {
                    setText(x);
                    interpretText(x);
                  }}
                  className="h-8 rounded-full border border-line px-3 text-[12.5px] text-muted"
                >
                  {x}
                </button>
              ))}
            </div>
            <button onClick={() => interpretText()} disabled={!text.trim() || busy} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-ink text-sm font-semibold disabled:opacity-50">
              <IconSpark /> {busy ? "Interpretando…" : ai ? "Interpretar com IA" : "Interpretar"}
            </button>
          </div>
        )}

        {mode === "photo" && (
          <div className="flex gap-3">
            <div className="flex h-36 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-soft">
              {photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoUrl} alt="Foto enviada" className="h-full w-full object-cover" />
              ) : (
                <IconCamera size={28} />
              )}
            </div>
            <div className="flex flex-1 flex-col justify-center gap-2">
              {!ai && <p className="text-xs text-warn-ink">Leitura de foto precisa da IA (OPENAI_API_KEY).</p>}
              <button disabled={!ai || busy} onClick={() => camRef.current?.click()} className="h-11 rounded-xl bg-ink text-sm font-semibold text-on-ink disabled:opacity-50">
                {busy ? "Lendo a nota…" : "Tirar foto"}
              </button>
              <button disabled={!ai || busy} onClick={() => galRef.current?.click()} className="h-11 rounded-xl border border-line text-sm disabled:opacity-50">
                Escolher da galeria
              </button>
              <span className="text-xs text-muted">Nota, comprovante de Pix ou print da fatura.</span>
              <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onPhoto(e.target.files?.[0])} />
              <input ref={galRef} type="file" accept="image/*" hidden onChange={(e) => onPhoto(e.target.files?.[0])} />
            </div>
          </div>
        )}

        {mode === "audio" && (
          <div className="flex flex-col items-center gap-3 py-2">
            {!audio ? (
              <p className="text-center text-sm text-warn-ink">Transcrição de áudio precisa de OPENAI_API_KEY configurada.</p>
            ) : (
              <>
                <button
                  onClick={toggleRecord}
                  disabled={busy}
                  aria-label={recording ? "Parar gravação" : "Gravar áudio"}
                  className={`flex size-[88px] items-center justify-center rounded-full ${recording ? "bg-over text-white ring-8 ring-over-soft" : "bg-ink text-on-ink"}`}
                >
                  {recording ? <span className="size-6 rounded-md bg-white" /> : <IconMic size={34} />}
                </button>
                <span className="text-sm text-muted">
                  {busy ? "Transcrevendo…" : recording ? "Gravando… toque para parar" : "Toque e diga o gasto, ex.: “gasolina 150 hoje”"}
                </span>
              </>
            )}
            {res?.transcript && <p className="w-full rounded-xl bg-soft px-3.5 py-3 text-sm leading-relaxed">“{res.transcript}”</p>}
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-over-soft px-3 py-2 text-sm text-neg">
            {error}
          </p>
        )}

        {busy && !res && (
          <div role="status" aria-label="Interpretando" aria-busy="true" className="flex flex-col gap-3 rounded-2xl border border-edge-in-2 bg-tint-in-2 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <Skel w={120} h={13} />
              <Skel w={88} h={18} r={999} />
            </div>
            <Skel w="100%" h={52} r={14} />
            <Skel w={96} h={11} />
            <Skel w="100%" h={44} r={10} />
            <Skel w={96} h={11} />
            <Skel w="100%" h={44} r={10} />
          </div>
        )}

        <AnimatePresence initial={false}>
        {res && (
          <motion.div
            key="resultado"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.18 }}
            className="flex flex-col gap-3 rounded-2xl border border-edge-in-2 bg-tint-in-2 p-3.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[13px] font-semibold text-in-ink">
                <IconSpark size={14} />
                {res.source === "manual" ? "Novo gasto" : res.source === "ai_photo" ? "A IA leu a foto" : res.source === "ai_audio" ? "Entendi o áudio" : "Entendi assim"}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${
                  res.confidence === "high" ? "bg-in-soft text-in-ink" : res.confidence === "manual" ? "bg-soft-2 text-muted" : "bg-warn-soft text-warn-ink"
                }`}
              >
                {res.confidence === "high" ? "Alta confiança" : res.confidence === "manual" ? "Manual" : "Confira os campos"}
              </span>
            </div>
            <MoneyInput value={res.amount} onChange={(v) => setRes({ ...res, amount: v })} />
            <Field label="Descrição (vira uma linha nova na tabela)">
              <input
                className={`${inputCls} ${!res.description.trim() ? "border-[1.5px] border-warn" : ""}`}
                value={res.description}
                onChange={(e) => setRes({ ...res, description: e.target.value })}
                placeholder="Ex.: Mercado"
              />
            </Field>
            <Field label="Vai para qual tabela?">
              <select
                className={`${inputCls} ${!res.tableId ? "border-[1.5px] border-warn" : ""}`}
                value={res.tableId}
                onChange={(e) => setRes({ ...res, tableId: e.target.value })}
              >
                <option value="">Escolha a tabela…</option>
                {tables.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {tables.length === 0 && <span className="text-xs text-muted">Crie uma tabela em Tabelas primeiro.</span>}
            </Field>
            <Field label="Data">
              <input type="date" className={inputCls} value={res.date} onChange={(e) => setRes({ ...res, date: e.target.value })} />
            </Field>

            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-medium text-muted">É pontual ou se repete?</span>
              <Segmented
                value={res.frequency}
                onChange={(frequency) => setRes({ ...res, frequency })}
                options={(["once", "monthly", "yearly", "installments"] as const).map((v) => ({ value: v, label: FREQ_LABEL[v] }))}
              />
              <span className="text-xs text-muted">{ajuda}</span>
            </div>
            {(res.frequency === "monthly" || res.frequency === "yearly") && (
              <div className="flex flex-col gap-2">
                <label className="flex min-h-11 items-center gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    checked={!res.endMonth}
                    onChange={(e) => setRes({ ...res, endMonth: e.target.checked ? null : monthStr(mesAno.year, 11) })}
                    className="size-5 accent-ink"
                  />
                  Sem data final
                </label>
                {res.endMonth && (
                  <Field label="Repete até">
                    <select className={inputCls} value={res.endMonth} onChange={(e) => setRes({ ...res, endMonth: e.target.value })}>
                      {mesesFuturos(mesAno).map((o) => (
                        <option key={o.v} value={o.v}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
              </div>
            )}
            {res.frequency === "installments" && (
              <Field label="Número de parcelas" hint={`${fmtR(cents)} por mês, total ${fmtR(cents * (Number(res.installments) || 0))}.`}>
                <input
                  type="number"
                  min={2}
                  max={120}
                  className={inputCls}
                  value={res.installments}
                  onChange={(e) => setRes({ ...res, installments: e.target.value })}
                />
              </Field>
            )}

            {impacts.map((b) => {
              const after = b.spentCents + b.sign * cents;
              const before = b.spentCents;
              const pb = Math.min(100, Math.max(0, (before / b.limitCents) * 100));
              const pa = Math.min(100, Math.max(0, (after / b.limitCents) * 100));
              const over = after > b.limitCents;
              const warn = !over && after >= (b.limitCents * b.alertPct) / 100;
              return (
                <div key={b.name} className="flex flex-col gap-1.5 rounded-xl border border-line bg-card px-3 py-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[13px] font-semibold">Budget {b.name}</span>
                    <span className="num text-xs text-muted">
                      {fmtR(after)} de {fmtR(b.limitCents)}
                    </span>
                  </div>
                  <div className="relative h-2 overflow-hidden rounded-full bg-line-2">
                    <div className="absolute inset-y-0 left-0 bg-faint" style={{ width: `${pb}%` }} />
                    <div className={`absolute inset-y-0 ${over ? "bg-over" : warn ? "bg-warn" : "bg-in"}`} style={{ left: `${pb}%`, width: `${Math.max(0, pa - pb)}%` }} />
                  </div>
                  <span className={`text-xs ${over ? "font-semibold text-neg" : warn ? "font-semibold text-warn-ink" : "text-muted"}`}>
                    {over ? `Com este gasto passa ${fmtR(after - b.limitCents)} do limite.` : warn ? `Atenção: ${Math.round((after / b.limitCents) * 100)}% do limite.` : `Restam ${fmtR(b.limitCents - after)} no mês.`}
                  </span>
                </div>
              );
            })}
          </motion.div>
        )}
        </AnimatePresence>
      </div>
    </Sheet>
  );
}
