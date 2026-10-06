"use client";

/** Ao sair da conta, apaga as páginas guardadas para nada da sessão sobrar no aparelho. */
export async function limparCacheOffline() {
  try {
    navigator.serviceWorker?.controller?.postMessage("limpar-cache");
    if (window.caches) for (const k of await caches.keys()) await caches.delete(k);
  } catch {}
}
