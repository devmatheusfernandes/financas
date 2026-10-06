"use client";

import { useOffline } from "next/offline";

/**
 * Estado de carregamento que avisa quando a espera é falta de conexão, não lentidão.
 *
 * Fica num arquivo só dele, sem framer-motion nem Server Actions: é o que o
 * loading.tsx renderiza a cada navegação, então o pacote precisa ser mínimo.
 */
export function CarregandoConexao() {
  const offline = useOffline();
  return (
    <div role="status" className="flex min-h-[60dvh] items-center justify-center px-4">
      <p className="text-sm text-muted">{offline ? "Esperando a conexão voltar para carregar…" : "Carregando…"}</p>
    </div>
  );
}
