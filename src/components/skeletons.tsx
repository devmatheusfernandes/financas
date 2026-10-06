"use client";

import { useOffline } from "next/offline";
import { Skel, SkelTela } from "./ui";

/** Aviso discreto no topo do esqueleto quando a demora é falta de conexão, não lentidão. */
function Aviso() {
  const offline = useOffline();
  if (!offline) return null;
  return (
    <p className="rounded-lg bg-warn-soft px-3 py-2 text-center text-[13px] font-medium text-warn-ink">
      Esperando a conexão voltar para carregar esta página…
    </p>
  );
}

function Cabecalho({ larguraTitulo = 120 }: { larguraTitulo?: number }) {
  return (
    <div className="flex flex-col gap-2">
      <Skel w={64} h={10} />
      <Skel w={larguraTitulo} h={26} r={8} />
    </div>
  );
}

/** Três cartões de total: Entradas, Saídas e Balanço (este último em painel escuro). */
function Kpis() {
  return (
    <div className="grid grid-cols-3 gap-2 md:max-w-[720px]">
      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-2 rounded-xl bg-card px-3 py-2.5">
          <Skel w={52} h={10} />
          <Skel w="70%" h={16} />
        </div>
      ))}
      <div className="flex flex-col gap-2 rounded-xl bg-panel px-3 py-2.5">
        <Skel escuro w={52} h={10} />
        <Skel escuro w="70%" h={16} />
      </div>
    </div>
  );
}

/** Uma tabela da planilha: cabeçalho colorido e algumas linhas com 12 células de mês. */
function TabelaFalsa({ linhas }: { linhas: number }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-card">
      <div className="flex items-center gap-2.5 border-b border-line-2 px-3.5 py-3">
        <Skel w={12} h={12} r={3} />
        <Skel w={110} h={14} />
      </div>
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 border-b border-line-2 px-3.5 py-3 last:border-0">
          <Skel w={96} h={12} className="shrink-0 md:!w-[200px]" />
          <div className="flex flex-1 justify-end gap-2 overflow-hidden">
            {Array.from({ length: 6 }).map((_, m) => (
              <Skel key={m} w={54} h={12} className="shrink-0" />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

export function SkeletonPlanilha() {
  return (
    <SkelTela label="Carregando a planilha">
      <main className="mx-auto flex max-w-[1440px] flex-col gap-3.5 px-4 pb-10 pt-5 md:px-6">
        <Aviso />
        <Cabecalho larguraTitulo={76} />
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Skel w="100%" h={46} r={12} className="md:!w-[300px]" />
          <Skel w={200} h={44} r={12} />
        </div>
        <Kpis />
        <TabelaFalsa linhas={4} />
        <TabelaFalsa linhas={6} />
      </main>
    </SkelTela>
  );
}

export function SkeletonBudget() {
  return (
    <SkelTela label="Carregando os budgets">
      <main className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 pb-10 pt-5 md:px-6">
        <Aviso />
        <div className="flex items-center justify-between gap-3">
          <Cabecalho larguraTitulo={150} />
          <div className="flex gap-1">
            <Skel w={44} h={44} r={12} />
            <Skel w={44} h={44} r={12} />
          </div>
        </div>

        <section className="flex flex-col gap-3.5 rounded-[20px] bg-panel p-[18px] md:max-w-3xl">
          <div className="flex items-end justify-between gap-2.5">
            <div className="flex flex-col gap-2">
              <Skel escuro w={110} h={12} />
              <Skel escuro w={140} h={28} r={8} />
            </div>
            <Skel escuro w={80} h={16} />
          </div>
          <Skel escuro w="100%" h={10} r={999} />
          <div className="flex justify-between">
            <Skel escuro w={110} h={12} />
            <Skel escuro w={90} h={12} />
          </div>
        </section>

        {[0, 1, 2].map((i) => (
          <section key={i} className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-4 md:max-w-3xl">
            <div className="flex items-center justify-between gap-2">
              <Skel w={130} h={15} />
              <Skel w={96} h={12} />
            </div>
            <Skel w="100%" h={8} r={999} />
            <Skel w={170} h={12} />
          </section>
        ))}
      </main>
    </SkelTela>
  );
}

export function SkeletonTabelas() {
  return (
    <SkelTela label="Carregando as tabelas">
      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 pb-10 pt-5 md:px-6">
        <Aviso />
        <div className="flex items-end justify-between gap-3">
          <Cabecalho larguraTitulo={190} />
          <Skel w={132} h={44} r={12} />
        </div>
        {[4, 3].map((linhas, i) => (
          <section key={i} className="overflow-hidden rounded-2xl border border-line bg-card">
            <div className="flex items-center gap-2.5 px-3.5 py-3">
              <Skel w={12} h={12} r={3} />
              <Skel w={120} h={15} />
            </div>
            {Array.from({ length: linhas }).map((_, l) => (
              <div key={l} className="flex items-center justify-between gap-3 border-t border-line-2 px-3.5 py-3">
                <Skel w={`${45 + ((l * 13) % 30)}%`} h={13} />
                <Skel w={56} h={13} />
              </div>
            ))}
          </section>
        ))}
      </main>
    </SkelTela>
  );
}

export function SkeletonAjustes() {
  return (
    <SkelTela label="Carregando os ajustes">
      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 pb-10 pt-5 md:px-6">
        <Aviso />
        <Cabecalho larguraTitulo={110} />
        {[2, 3, 3, 2].map((itens, i) => (
          <section key={i} className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-4">
            <Skel w={110} h={15} />
            {Array.from({ length: itens }).map((_, l) => (
              <Skel key={l} w={l === itens - 1 ? "60%" : "100%"} h={l === 0 ? 44 : 13} r={l === 0 ? 10 : 6} />
            ))}
          </section>
        ))}
      </main>
    </SkelTela>
  );
}

/** Esqueleto curto para dentro de um painel lateral (Sheet). */
export function SkeletonLista({ itens = 3 }: { itens?: number }) {
  return (
    <SkelTela label="Carregando os lançamentos">
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: itens }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-card px-3.5 py-3">
            <div className="flex flex-1 flex-col gap-2">
              <Skel w={`${50 + ((i * 17) % 30)}%`} h={13} />
              <Skel w={88} h={10} />
            </div>
            <Skel w={72} h={15} />
          </div>
        ))}
      </div>
    </SkelTela>
  );
}
