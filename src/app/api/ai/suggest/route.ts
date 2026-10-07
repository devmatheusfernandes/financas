import { NextResponse } from "next/server";
import { getMembership, getSession } from "@/lib/session";
import { loadStructure } from "@/server/data";
import { aiEnabled, audioEnabled, suggestWithAI, suggestWithRules, transcribeAudio, type Suggestion } from "@/server/ai";

export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Faça login" }, { status: 401 });
  const m = await getMembership(session.user.id);
  if (!m) return NextResponse.json({ error: "Sem household" }, { status: 403 });

  const form = await req.formData();
  const mode = String(form.get("mode") || "text");
  const text = String(form.get("text") || "").slice(0, 1000);
  const file = form.get("file");

  const structure = await loadStructure(m.householdId);
  const tables = structure.tables.map((t) => ({ id: t.id, name: t.name, kind: t.kind }));

  try {
    let result: Suggestion;
    if (mode === "photo") {
      if (!(file instanceof File)) return NextResponse.json({ error: "Envie uma foto" }, { status: 400 });
      if (file.size > MAX_BYTES) return NextResponse.json({ error: "Foto muito grande (máx. 4 MB)" }, { status: 413 });
      if (!aiEnabled()) {
        return NextResponse.json(
          { error: "Leitura de foto precisa da IA. Configure OPENAI_API_KEY." },
          { status: 501 },
        );
      }
      result = await suggestWithAI({
        image: { data: new Uint8Array(await file.arrayBuffer()), mediaType: file.type || "image/jpeg" },
        tables,
      });
    } else if (mode === "audio") {
      if (!(file instanceof File)) return NextResponse.json({ error: "Envie um áudio" }, { status: 400 });
      if (file.size > MAX_BYTES) return NextResponse.json({ error: "Áudio muito longo" }, { status: 413 });
      if (!audioEnabled()) {
        return NextResponse.json({ error: "Transcrição precisa de OPENAI_API_KEY." }, { status: 501 });
      }
      const transcript = await transcribeAudio(new Uint8Array(await file.arrayBuffer()));
      result = aiEnabled() ? await suggestWithAI({ text: transcript, tables }) : suggestWithRules(transcript, tables);
      result.transcript = transcript;
    } else {
      if (!text.trim()) return NextResponse.json({ error: "Escreva o gasto" }, { status: 400 });
      result = aiEnabled() ? await suggestWithAI({ text, tables }) : suggestWithRules(text, tables);
    }
    return NextResponse.json(result);
  } catch (e) {
    console.error(e);
    // Se a IA falhar com texto, ainda dá para usar as regras
    if (text.trim()) return NextResponse.json(suggestWithRules(text, tables));
    return NextResponse.json({ error: "Não consegui interpretar. Tente de novo ou use o modo manual." }, { status: 500 });
  }
}
