/*
 * Service worker do app. Objetivo: abrir offline.
 *
 * Os dados ficam no Postgres; aqui só guardamos a "casca" (HTML das páginas e os
 * arquivos estáticos). Como as páginas são autenticadas, a estratégia é network-first:
 * online sempre vence, o cache só entra quando a rede falha. Ao sair da conta o app
 * manda "limpar-cache" e nada da sessão anterior fica guardado.
 */
const VERSAO = "v1";
const CACHE_PAGINAS = `paginas-${VERSAO}`;
const CACHE_ESTATICO = `estatico-${VERSAO}`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE_PAGINAS)
      .then((c) => c.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE_PAGINAS && k !== CACHE_ESTATICO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (e) => {
  if (e.data === "limpar-cache") {
    e.waitUntil(caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k)))));
  }
});

/** Arquivos com hash no nome: nunca mudam, então o cache pode vir primeiro. */
function ehEstatico(url) {
  return url.pathname.startsWith("/_next/static/") || /\.(png|svg|ico|woff2?)$/.test(url.pathname);
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE_PAGINAS);
  try {
    const res = await fetch(req);
    // só guarda a página inteira (HTML), não as respostas parciais do roteador
    if (res.ok && res.type === "basic") cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = (await cache.match(req)) || (await cache.match(OFFLINE_URL));
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return; // Server Actions e uploads vão direto para a rede
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // pedidos do roteador (RSC) ficam com o Next: ele já repete sozinho quando a rede volta
  if (req.headers.has("RSC") || url.searchParams.has("_rsc")) return;
  // nada de API no cache (exportação de planilha, login, IA)
  if (url.pathname.startsWith("/api/")) return;

  if (ehEstatico(url)) {
    e.respondWith(cacheFirst(req, CACHE_ESTATICO));
    return;
  }
  if (req.mode === "navigate") {
    e.respondWith(networkFirst(req));
  }
});
