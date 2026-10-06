import { redirect } from "next/navigation";
import { createHousehold } from "@/server/actions";
import { getMembership, requireUser } from "@/lib/session";

export default async function Onboarding({ searchParams }: PageProps<"/onboarding">) {
  const u = await requireUser();
  if (await getMembership(u.id)) redirect("/planilha");
  const sp = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <p className="text-xs font-medium uppercase tracking-wider text-muted">Bem-vindo, {u.name}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Vamos montar sua planilha</h1>
        {sp.convite === "invalido" && (
          <p role="alert" className="mt-4 rounded-lg bg-over-soft px-3 py-2 text-sm text-neg">
            Esse link de convite não é mais válido. Peça um novo ou crie a sua planilha.
          </p>
        )}
        <form action={createHousehold} className="mt-6 flex flex-col gap-4 rounded-2xl border border-line bg-card p-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">Nome da planilha</span>
            <input name="name" defaultValue="Nossas finanças" className="h-12 rounded-xl border border-line px-3.5 text-base" />
          </label>
          <p className="text-sm leading-relaxed text-muted">
            Vamos criar as tabelas <b>Entradas</b>, <b>Saídas</b> e <b>Cartão de crédito</b> (já somando na linha “Cartão de
            crédito” das Saídas). Você pode mudar tudo depois.
          </p>
          <button className="h-12 rounded-xl bg-ink text-base font-semibold text-white">Criar planilha</button>
        </form>
        <p className="mt-5 text-sm text-muted">
          Sua esposa já criou a planilha? Peça para ela abrir <b>Ajustes</b> e te mandar o link de convite.
        </p>
      </div>
    </main>
  );
}
