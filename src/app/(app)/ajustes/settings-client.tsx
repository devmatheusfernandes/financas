"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/app-shell";
import { limparCacheOffline } from "@/lib/offline-cache";
import { ThemeSetting } from "@/components/theme";
import { Field, inputCls } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { regenerateInvite, renameHousehold, resetHouseholdData } from "@/server/actions";
import { ImportExport } from "./import-export";

export function SettingsClient({
  householdName,
  inviteUrl,
  members,
  userName,
  ai,
  audio,
}: {
  householdName: string;
  inviteUrl: string;
  members: { name: string; email: string; role: string }[];
  userName: string;
  ai: boolean;
  audio: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(householdName);
  const [url, setUrl] = useState(inviteUrl);
  const [resetting, setResetting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 pb-10 pt-5 md:px-6">
      <div className="flex flex-col">
        <span className="text-xs font-medium uppercase tracking-wider text-muted">Olá, {userName}</span>
        <h1 className="text-[26px] font-semibold tracking-tight">Ajustes</h1>
      </div>

      <section className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-4">
        <h2 className="text-[15px] font-semibold">Planilha</h2>
        <Field label="Nome">
          <div className="flex gap-2">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
            <button
              onClick={async () => {
                const r = await renameHousehold(name);
                if (r.ok) {
                  toast("Nome atualizado");
                  router.refresh();
                } else toast(r.error);
              }}
              className="h-11 shrink-0 rounded-[10px] bg-ink px-4 text-sm font-semibold text-on-ink"
            >
              Salvar
            </button>
          </div>
        </Field>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-4">
        <h2 className="text-[15px] font-semibold">Quem participa</h2>
        <ul className="flex flex-col divide-y divide-line-2">
          {members.map((m) => (
            <li key={m.email} className="flex items-center justify-between py-2.5 text-sm">
              <span className="flex flex-col">
                <span className="font-medium">{m.name}</span>
                <span className="text-xs text-muted">{m.email}</span>
              </span>
              <span className="text-xs text-muted">{m.role === "owner" ? "Criou a planilha" : "Membro"}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-2 rounded-xl bg-soft p-3">
          <span className="text-[13px] font-medium">Convidar alguém</span>
          <span className="text-xs text-muted">Quem abrir este link e criar uma conta entra nesta mesma planilha.</span>
          <input readOnly value={url} className={`${inputCls} num text-xs`} onFocus={(e) => e.currentTarget.select()} />
          <div className="flex gap-2">
            <button
              onClick={async () => {
                try {
                  if (navigator.share) await navigator.share({ title: "Nossa planilha", url });
                  else {
                    await navigator.clipboard.writeText(url);
                    toast("Link copiado");
                  }
                } catch {}
              }}
              className="h-10 flex-1 rounded-[10px] bg-ink text-sm font-semibold text-on-ink"
            >
              Compartilhar link
            </button>
            <button
              onClick={async () => {
                const r = await regenerateInvite();
                if (r.ok) {
                  setUrl(url.replace(/[^/]+$/, r.token));
                  toast("Link antigo desativado");
                }
              }}
              className="h-10 rounded-[10px] border border-line px-3 text-sm"
            >
              Gerar novo
            </button>
          </div>
        </div>
      </section>

      <ThemeSetting />

      <ImportExport />

      <section className="flex flex-col gap-2 rounded-2xl border border-line bg-card p-4 text-sm">
        <h2 className="text-[15px] font-semibold">IA</h2>
        <p className="text-muted">
          Texto e foto: {ai ? <b className="text-in-ink">ativo</b> : "desativado (defina OPENAI_API_KEY — sem ela, o texto usa palavras-chave)"}
        </p>
        <p className="text-muted">Áudio: {audio ? <b className="text-in-ink">ativo</b> : "desativado (defina OPENAI_API_KEY)"}</p>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-neg/40 bg-card p-4 text-sm">
        <h2 className="text-[15px] font-semibold text-neg">Começar de novo</h2>
        <p className="text-muted">
          Apaga todas as tabelas, linhas, lançamentos e orçamentos da planilha e deixa só Entradas e Saídas vazias. Vale para todos
          que participam dela e não dá para desfazer. Considere <b>Exportar tudo</b> antes.
        </p>
        {!resetting ? (
          <button onClick={() => setResetting(true)} className="h-10 rounded-[10px] border border-neg/40 text-sm font-semibold text-neg">
            Zerar todos os dados
          </button>
        ) : (
          <div className="flex flex-col gap-2 rounded-xl bg-soft p-3">
            <span className="text-[13px] font-medium">
              Digite <b>ZERAR</b> para confirmar
            </span>
            <input className={inputCls} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setResetting(false);
                  setConfirmText("");
                }}
                className="h-10 flex-1 rounded-[10px] border border-line text-sm"
              >
                Cancelar
              </button>
              <button
                disabled={busy || confirmText.trim().toUpperCase() !== "ZERAR"}
                onClick={async () => {
                  setBusy(true);
                  const r = await resetHouseholdData(confirmText);
                  setBusy(false);
                  if (r.ok) {
                    await limparCacheOffline();
                    toast("Dados zerados");
                    setResetting(false);
                    setConfirmText("");
                    router.refresh();
                  } else toast(r.error);
                }}
                className="h-10 flex-1 rounded-[10px] bg-neg text-sm font-semibold text-white disabled:opacity-40"
              >
                {busy ? "Apagando…" : "Apagar tudo"}
              </button>
            </div>
          </div>
        )}
      </section>

      <button
        onClick={async () => {
          await authClient.signOut();
          await limparCacheOffline(); // nada desta sessão fica guardado no aparelho
          router.replace("/login");
          router.refresh();
        }}
        className="h-12 rounded-[14px] border border-line bg-card text-[15px] font-semibold"
      >
        Sair
      </button>
    </main>
  );
}
