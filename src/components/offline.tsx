"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useOffline } from "next/offline";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { listarFila, ouvirFila, pendentesAgora, recarregarTotal, removerDaFila } from "@/lib/offline-queue";
import { addTransaction } from "@/server/actions";

/** Registra o service worker — é ele que faz o app abrir sem internet. */
export function RegistrarServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return; // em dev o SW atrapalha o hot reload
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
  }, []);
  return null;
}

/**
 * Barra fixa com o estado da conexão e a fila de lançamentos pendentes.
 * Tenta enviar a fila ao abrir o app e sempre que a conexão volta.
 */
export function BarraOffline() {
  const offline = useOffline();
  const router = useRouter();
  const pendentes = useSyncExternalStore(ouvirFila, pendentesAgora, () => 0);

  const enviarFila = useCallback(async () => {
    const fila = await listarFila();
    if (!fila.length) return;
    let enviados = 0;
    for (const item of fila) {
      try {
        const r = await addTransaction({
          tableId: item.tableId,
          name: item.name,
          amount: item.amount,
          month: item.month,
          occurredOn: item.occurredOn,
          source: item.source,
          clientId: item.clientId,
          frequency: item.frequency ?? "once",
          endMonth: item.endMonth ?? null,
          installments: item.installments ?? null,
        });
        // sucesso ou recusa do servidor (ex.: tabela apagada): sai da fila de qualquer jeito,
        // senão ficaria tentando para sempre. Falha de rede lança e o item continua guardado.
        await removerDaFila(item.clientId);
        if (r.ok) enviados++;
      } catch {
        break; // sem rede: para aqui e tenta de novo depois
      }
    }
    if (enviados) router.refresh();
  }, [router]);

  // lê o que ficou guardado de sessões anteriores e envia; repete quando a conexão volta
  useEffect(() => {
    recarregarTotal();
    if (offline) return;
    enviarFila();
    window.addEventListener("online", enviarFila);
    return () => window.removeEventListener("online", enviarFila);
  }, [offline, enviarFila]);

  const mostrar = offline || pendentes > 0;
  const texto = offline
    ? pendentes > 0
      ? `Sem internet · ${pendentes} ${pendentes === 1 ? "lançamento guardado" : "lançamentos guardados"}`
      : "Sem internet · o app continua funcionando"
    : "Enviando o que ficou pendente…";

  return (
    <AnimatePresence>
      {mostrar && (
        <motion.div
          key="barra-offline"
          role="status"
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          transition={{ duration: 0.22 }}
          className={`fixed inset-x-0 top-0 z-[70] px-4 py-2 text-center text-[13px] font-medium ${
            offline ? "bg-warn-soft text-warn-ink" : "bg-in-soft text-in-ink"
          }`}
        >
          {texto}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
