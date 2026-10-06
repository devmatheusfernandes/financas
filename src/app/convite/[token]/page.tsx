import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { households } from "@/db/schema";
import { getMembership, getSession } from "@/lib/session";
import { joinHousehold } from "@/server/actions";

export default async function InvitePage({ params }: PageProps<"/convite/[token]">) {
  const { token } = await params;
  const [h] = await db.select({ name: households.name }).from(households).where(eq(households.inviteToken, token));
  const session = await getSession();
  const member = session ? await getMembership(session.user.id) : null;
  const next = `/convite/${token}`;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-line bg-card p-6">
        {!h ? (
          <>
            <h1 className="text-xl font-semibold">Convite inválido</h1>
            <p className="mt-2 text-sm text-muted">Esse link expirou ou foi trocado. Peça um novo.</p>
          </>
        ) : (
          <>
            <p className="text-xs font-medium uppercase tracking-wider text-muted">Convite</p>
            <h1 className="mt-1 text-xl font-semibold">Entrar em “{h.name}”</h1>
            {!session ? (
              <div className="mt-6 flex flex-col gap-3">
                <Link href={`/cadastro?next=${encodeURIComponent(next)}`} className="flex h-12 items-center justify-center rounded-xl bg-ink font-semibold text-white">
                  Criar conta e entrar
                </Link>
                <Link href={`/login?next=${encodeURIComponent(next)}`} className="flex h-12 items-center justify-center rounded-xl border border-line font-semibold">
                  Já tenho conta
                </Link>
              </div>
            ) : member ? (
              <p className="mt-4 text-sm text-muted">
                Você já participa de uma planilha (“{member.name}”). Cada conta pode estar em uma planilha só.{" "}
                <Link className="font-semibold text-in" href="/planilha">
                  Ir para a minha
                </Link>
              </p>
            ) : (
              <form action={joinHousehold} className="mt-6">
                <input type="hidden" name="token" value={token} />
                <button className="h-12 w-full rounded-xl bg-ink font-semibold text-white">Entrar na planilha</button>
              </form>
            )}
          </>
        )}
      </div>
    </main>
  );
}
