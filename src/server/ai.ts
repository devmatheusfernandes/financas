import "server-only";
import { generateText, Output, transcribe } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { parseCents, today } from "@/lib/format";

export type LineOption = { id: string; label: string };

export type Suggestion = {
  amountCents: number;
  description: string;
  lineId: string | null;
  date: string; // YYYY-MM-DD
  confidence: "high" | "low";
  transcript?: string;
  engine: "ai" | "rules";
};

export const aiEnabled = () => !!process.env.ANTHROPIC_API_KEY;
export const audioEnabled = () => !!process.env.OPENAI_API_KEY;

const schema = z.object({
  amount: z.number().describe("Valor em reais (BRL), positivo. Estornos/créditos podem ser negativos."),
  description: z.string().describe("Descrição curta, ex.: 'Mercado', 'Posto Ipiranga', 'Conta de luz'"),
  lineId: z.string().nullable().describe("O id exato de uma das linhas listadas, ou null se não houver uma boa opção"),
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
  lines: LineOption[];
}): Promise<Suggestion> {
  const t = today();
  const prompt = [
    `Você organiza as finanças pessoais de uma família brasileira. Hoje é ${t.iso}.`,
    `Extraia UM gasto (ou entrada) do conteúdo abaixo e escolha a linha da planilha onde ele deve entrar.`,
    `Regras:`,
    `- Valores em reais. "87,50" = 87.5. Se houver total numa nota fiscal, use o TOTAL.`,
    `- "ontem" = um dia antes de hoje. Sem data, use hoje. Datas de nota fiscal valem mais que "hoje".`,
    `- Se foi pago no cartão de crédito, prefira linhas da tabela de cartão.`,
    `- Use apenas ids da lista. Se nenhuma linha servir bem, lineId = null e confidence = "low".`,
    ``,
    `Linhas disponíveis (id: Tabela › Linha):`,
    ...opts.lines.map((l) => `${l.id}: ${l.label}`),
    ``,
    opts.text ? `Conteúdo: """${opts.text}"""` : `Conteúdo: veja a imagem (nota fiscal, comprovante ou print).`,
  ].join("\n");

  const content: Array<
    { type: "text"; text: string } | { type: "file"; mediaType: string; data: Uint8Array }
  > = [{ type: "text", text: prompt }];
  if (opts.image) content.push({ type: "file", mediaType: opts.image.mediaType, data: opts.image.data });

  const { output } = await generateText({
    model: anthropic(process.env.AI_MODEL || "claude-haiku-4-5"),
    output: Output.object({ schema }),
    messages: [{ role: "user", content }],
  });

  const lineId = output.lineId && opts.lines.some((l) => l.id === output.lineId) ? output.lineId : null;
  return {
    amountCents: Math.round(output.amount * 100),
    description: output.description,
    lineId,
    date: /^\d{4}-\d{2}-\d{2}$/.test(output.date) ? output.date : t.iso,
    confidence: lineId ? output.confidence : "low",
    engine: "ai",
  };
}

/* ------------------------------------------------------------------ */
/* Fallback sem IA: palavras-chave                                     */
/* ------------------------------------------------------------------ */

const CATEGORIES: { re: RegExp; lineHints: RegExp }[] = [
  { re: /mercado|supermerc|feira|padaria|a[çc]ougue|hortifruti|ifood|restaurante|lanche|comida|limpeza|higiene/, lineHints: /aliment|comida|mercado|limpeza/ },
  { re: /gasolina|posto|combust|etanol|diesel/, lineHints: /gasolina|combust|posto|carro/ },
  { re: /conta de luz|\bluz\b|energia|enel|cemig|copel|light/, lineHints: /luz|energia/ },
  { re: /internet|wi-?fi|fibra/, lineHints: /internet/ },
  { re: /aluguel|condom[ií]nio|\bg[áa]s\b|[áa]gua/, lineHints: /aluguel|g[áa]s|[áa]gua|condom/ },
  { re: /spotify|netflix|assinatura|google one|youtube|prime|disney/, lineHints: /assinatura|spotify|netflix/ },
  { re: /oficina|mec[âa]nico|[óo]leo|pneu|ipva|licenciamento|revis[ãa]o/, lineHints: /manuten|carro|ipva|oficina/ },
  { re: /farm[áa]cia|rem[ée]dio|drogaria/, lineHints: /farm|sa[úu]de|rem[ée]dio/ },
  { re: /sal[áa]rio|recebi|freela|pix recebido/, lineHints: /sal[áa]rio|outras entradas|receita/ },
];

const STOP = /\b(no|na|de|do|da|em|um|uma|ontem|hoje|reais|real|paguei|gastei|comprei|deu|foi|cart[ãa]o|cr[ée]dito|pix|debito|d[ée]bito)\b/g;

export function suggestWithRules(text: string, lines: LineOption[]): Suggestion {
  const t = today();
  const s = text.toLowerCase();
  const m = s.match(/-?\d[\d.,]*/);
  const amountCents = m ? parseCents(m[0].replace(/[.,]$/, "")) : 0;

  const norm = (x: string) => x.toLowerCase();
  const isCard = /cart[ãa]o|cr[ée]dito/.test(s);
  let lineId: string | null = null;
  let kw = "";

  for (const c of CATEGORIES) {
    const hit = s.match(c.re);
    if (!hit) continue;
    kw = hit[0];
    const candidates = lines.filter((l) => c.lineHints.test(norm(l.label)));
    const pick = (isCard ? candidates.find((l) => /cart[ãa]o/.test(norm(l.label))) : null) ?? candidates[0];
    if (pick) lineId = pick.id;
    break;
  }
  // palavra do texto que aparece no nome de alguma linha
  if (!lineId) {
    const words = s.replace(/-?\d[\d.,]*/g, " ").replace(STOP, " ").split(/\s+/).filter((w) => w.length >= 4);
    for (const w of words) {
      const hit = lines.find((l) => norm(l.label).includes(w));
      if (hit) {
        lineId = hit.id;
        kw = kw || w;
        break;
      }
    }
  }
  if (!lineId && isCard) {
    const cardLine = lines.find((l) => /cart[ãa]o/.test(norm(l.label)));
    if (cardLine) lineId = cardLine.id;
  }
  if (!kw) kw = s.replace(/-?\d[\d.,]*/g, " ").replace(STOP, " ").trim().split(/\s+/)[0] ?? "";
  let description = kw ? kw.charAt(0).toUpperCase() + kw.slice(1) : "";
  if (/conta de luz/.test(s)) description = "Conta de luz";

  let date = t.iso;
  if (/ontem/.test(s)) {
    const d = new Date(t.iso + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    date = d.toISOString().slice(0, 10);
  }
  return {
    amountCents,
    description,
    lineId,
    date,
    confidence: amountCents && lineId ? "high" : "low",
    engine: "rules",
  };
}
