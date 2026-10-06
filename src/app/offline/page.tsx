import Link from "next/link";

/** Mostrada quando o app abre sem internet e a página pedida não está guardada no aparelho. */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-2xl border border-line bg-card p-6 text-center">
        <h1 className="text-xl font-semibold tracking-tight">Você está sem internet</h1>
        <p className="text-sm leading-relaxed text-muted">
          Esta página ainda não tinha sido aberta neste aparelho, por isso não dá para mostrá-la agora. As páginas que você
          já visitou continuam funcionando, e os lançamentos feitos sem internet sobem sozinhos quando a conexão voltar.
        </p>
        <Link href="/planilha" className="flex h-12 items-center justify-center rounded-xl bg-ink font-semibold text-on-ink">
          Tentar de novo
        </Link>
      </div>
    </main>
  );
}
