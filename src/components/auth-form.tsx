"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function AuthForm({ mode, next }: { mode: "login" | "signup"; next?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const dest = next && next.startsWith("/") && !next.startsWith("//") ? next : "/planilha";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email"));
    const password = String(f.get("password"));
    const res =
      mode === "signup"
        ? await authClient.signUp.email({ email, password, name: String(f.get("name") || email.split("@")[0]) })
        : await authClient.signIn.email({ email, password });
    setPending(false);
    if (res.error) {
      setError(
        res.error.status === 401 || res.error.code === "INVALID_EMAIL_OR_PASSWORD"
          ? "Email ou senha incorretos."
          : res.error.code === "USER_ALREADY_EXISTS" || res.error.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"
            ? "Já existe uma conta com esse email."
            : res.error.code === "PASSWORD_TOO_SHORT"
              ? "A senha precisa ter pelo menos 8 caracteres."
              : (res.error.message ?? "Não deu certo. Tente de novo."),
      );
      return;
    }
    router.replace(dest);
    router.refresh();
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-ink text-sm font-bold text-on-ink">R$</span>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted">Controle financeiro</p>
            <h1 className="text-2xl font-semibold tracking-tight">{mode === "login" ? "Entrar" : "Criar conta"}</h1>
          </div>
        </div>
        <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-2xl border border-line bg-card p-5">
          {mode === "signup" && (
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-muted">Seu nome</span>
              <input name="name" required autoComplete="name" className="h-12 rounded-xl border border-line px-3.5 text-base" />
            </label>
          )}
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">Email</span>
            <input name="email" type="email" required autoComplete="email" className="h-12 rounded-xl border border-line px-3.5 text-base" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">Senha</span>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className="h-12 rounded-xl border border-line px-3.5 text-base"
            />
          </label>
          {error && (
            <p role="alert" className="rounded-lg bg-over-soft px-3 py-2 text-sm text-neg">
              {error}
            </p>
          )}
          <button disabled={pending} className="h-12 rounded-xl bg-ink text-base font-semibold text-on-ink disabled:opacity-60">
            {pending ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar conta"}
          </button>
        </form>
        <p className="mt-5 text-center text-sm text-muted">
          {mode === "login" ? (
            <>
              Ainda não tem conta?{" "}
              <Link className="font-semibold text-in" href={`/cadastro${next ? `?next=${encodeURIComponent(next)}` : ""}`}>
                Criar conta
              </Link>
            </>
          ) : (
            <>
              Já tem conta?{" "}
              <Link className="font-semibold text-in" href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`}>
                Entrar
              </Link>
            </>
          )}
        </p>
      </div>
    </main>
  );
}
