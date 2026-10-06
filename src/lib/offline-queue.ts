"use client";

/**
 * Fila de lançamentos feitos sem internet, guardada no IndexedDB do aparelho.
 *
 * O Next já repete Server Actions quando a conexão volta, mas só enquanto a aba fica
 * aberta. Aqui o lançamento sobrevive a fechar o app: ele é gravado primeiro e só sai
 * da fila quando o servidor confirma. O `clientId` é a chave que evita duplicar quando
 * o mesmo item é enviado duas vezes.
 */

export type LancamentoNaFila = {
  clientId: string;
  tableId: string;
  name: string;
  amount: string;
  month: string;
  occurredOn: string | null;
  source: "manual" | "ai_text" | "ai_photo" | "ai_audio";
  frequency: "once" | "monthly" | "yearly" | "installments";
  endMonth: string | null;
  installments: number | null;
  criadoEm: number;
};

const DB = "financas";
const STORE = "fila";
const EVENTO = "fila-change";

function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, erro) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "clientId" });
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => erro(req.error);
  });
}

async function comStore<T>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await abrir();
  try {
    return await new Promise<T>((ok, erro) => {
      const req = fn(db.transaction(STORE, modo).objectStore(STORE));
      req.onsuccess = () => ok(req.result);
      req.onerror = () => erro(req.error);
    });
  } finally {
    db.close();
  }
}

/*
 * O IndexedDB é assíncrono, mas o React precisa ler o número de pendentes de forma
 * síncrona (useSyncExternalStore). Por isso mantemos o total em memória e avisamos
 * quem estiver ouvindo sempre que ele muda.
 */
let pendentes = 0;

export const pendentesAgora = () => pendentes;

export function ouvirFila(cb: () => void) {
  window.addEventListener(EVENTO, cb);
  return () => window.removeEventListener(EVENTO, cb);
}

/** Relê o total guardado e avisa a interface. Sempre assíncrono, nunca durante um render. */
export async function recarregarTotal() {
  const n = (await listarFila()).length;
  if (n === pendentes) return;
  pendentes = n;
  window.dispatchEvent(new Event(EVENTO));
}

export async function enfileirar(item: Omit<LancamentoNaFila, "clientId" | "criadoEm">): Promise<LancamentoNaFila> {
  const completo: LancamentoNaFila = { ...item, clientId: crypto.randomUUID(), criadoEm: Date.now() };
  await comStore("readwrite", (s) => s.add(completo));
  await recarregarTotal();
  return completo;
}

export async function listarFila(): Promise<LancamentoNaFila[]> {
  try {
    const todos = await comStore<LancamentoNaFila[]>("readonly", (s) => s.getAll() as IDBRequest<LancamentoNaFila[]>);
    return todos.sort((a, b) => a.criadoEm - b.criadoEm);
  } catch {
    return [];
  }
}

export async function removerDaFila(clientId: string) {
  await comStore("readwrite", (s) => s.delete(clientId) as unknown as IDBRequest<undefined>);
  await recarregarTotal();
}
