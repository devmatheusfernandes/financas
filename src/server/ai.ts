import "server-only";
import { generateText, Output, transcribe } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { parseCents, today } from "@/lib/format";

export type TableOption = { id: string; name: string; kind: "in" | "out" | "sub" };

export type Suggestion = {
  amountCents: number;
  description: string;
  tableId: string | null;
  date: string; // YYYY-MM-DD
  confidence: "high" | "low";
  transcript?: string;
  engine: "ai" | "rules";
};

export const aiEnabled = () => !!process.env.OPENAI_API_KEY;
export const audioEnabled = () => !!process.env.OPENAI_API_KEY;

const KIND_PT = { in: "entradas", out: "saídas", sub: "auxiliar" } as const;

const schema = z.object({
  amount: z.number().describe("Valor em reais (BRL), positivo. Estornos/créditos podem ser negativos."),
  description: z.string().describe("Nome curto do lançamento, ex.: 'Mercado', 'Posto Ipiranga', 'Conta de luz'"),
  tableId: z.string().nullable().describe("O id exato de uma das tabelas listadas, ou null se não houver uma boa opção"),
  date: z.string().describe("Data do gasto no formato YYYY-MM-DD"),
  confidence: z.enum(["high", "low"]),
});

export async function transcribeAudio(audio: Uint8Array): Promise<string> {
  const r = await transcribe({ model: openai.transcription("gpt-4o-transcribe"), audio });
  return r.text;
}

export async function suggestWithAI(opts: {
  text?: string;
  image?: { data: Uint8Array; mediaType: string };
  tables: TableOption[];
}): Promise<Suggestion> {
  const t = today();
  const prompt = [
    `Você organiza as finanças pessoais de uma família brasileira. Hoje é ${t.iso}.`,
    `Extraia UM gasto (ou entrada) do conteúdo abaixo e escolha a tabela da planilha onde ele deve entrar (cada lançamento vira uma linha nova nessa tabela).`,
    `Regras:`,
    `- Valores em reais. "87,50" = 87.5. Se houver total numa nota fiscal, use o TOTAL.`,
    `- "ontem" = um dia antes de hoje. Sem data, use hoje. Datas de nota fiscal valem mais que "hoje".`,
    `- Se foi pago no cartão de crédito, prefira a tabela do cartão.`,
    `- Entradas de dinheiro (salário, recebimentos) vão para uma tabela de entradas; gastos, para uma de saídas.`,
    `- Use apenas ids da lista. Se nenhuma tabela servir bem, tableId = null e confidence = "low".`,
    ``,
    `Tabelas disponíveis (id: nome — tipo):`,
    ...opts.tables.map((t) => `${t.id}: ${t.name} — ${KIND_PT[t.kind]}`),
    ``,
    opts.text ? `Conteúdo: """${opts.text}"""` : `Conteúdo: veja a imagem (nota fiscal, comprovante ou print).`,
  ].join("\n");

  const content: Array<
    { type: "text"; text: string } | { type: "file"; mediaType: string; data: Uint8Array }
  > = [{ type: "text", text: prompt }];
  if (opts.image) content.push({ type: "file", mediaType: opts.image.mediaType, data: opts.image.data });

  const { output } = await generateText({
    model: openai(process.env.AI_MODEL || "gpt-5-mini"),
    output: Output.object({ schema }),
    messages: [{ role: "user", content }],
  });

  const tableId = output.tableId && opts.tables.some((t) => t.id === output.tableId) ? output.tableId : null;
  return {
    amountCents: Math.round(output.amount * 100),
    description: output.description,
    tableId,
    date: /^\d{4}-\d{2}-\d{2}$/.test(output.date) ? output.date : t.iso,
    confidence: tableId ? output.confidence : "low",
    engine: "ai",
  };
}

/* ------------------------------------------------------------------ */
/* Fallback sem IA: palavras-chave                                     */
/* ------------------------------------------------------------------ */

const STOP = /\b(no|na|de|do|da|em|um|uma|ontem|hoje|reais|real|paguei|gastei|comprei|deu|foi|cart[ãa]o|cr[ée]dito|pix|debito|d[ée]bito|recebi)\b/g;

export function suggestWithRules(text: string, tables: TableOption[]): Suggestion {
  const t = today();
  const s = text.toLowerCase();
  const m = s.match(/-?\d[\d.,]*/);
  const amountCents = m ? parseCents(m[0].replace(/[.,]$/, "")) : 0;

  const isCard = /cart[ãa]o|cr[ée]dito/.test(s);
  const isIncome = /sal[áa]rio|recebi|freela|pix recebido/.test(s);
  const card = tables.find((x) => /cart[ãa]o/.test(x.name.toLowerCase()));
  const tableId =
    (isCard && card?.id) || (isIncome ? tables.find((x) => x.kind === "in")?.id : tables.find((x) => x.kind === "out")?.id) || null;

  const words = s.replace(/-?\d[\d.,]*/g, " ").replace(STOP, " ").trim().split(/\s+/).filter(Boolean);
  const name = words.slice(0, 4).join(" ").slice(0, 60);
  const description = name.charAt(0).toUpperCase() + name.slice(1);

  let date = t.iso;
  if (/ontem/.test(s)) {
    const d = new Date(t.iso + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    date = d.toISOString().slice(0, 10);
  }
  return {
    amountCents,
    description,
    tableId,
    date,
    confidence: amountCents && tableId && description ? "high" : "low",
    engine: "rules",
  };
}
