import { revalidatePath } from "next/cache";
import { getMembership, getSession } from "@/lib/session";
import { ImportError, importSpreadsheet } from "@/server/spreadsheet";

const json = (body: object, status = 200) => Response.json(body, { status });

export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return json({ ok: false, error: "Não autenticado" }, 401);
  const m = await getMembership(s.user.id);
  if (!m) return json({ ok: false, error: "Crie sua planilha primeiro" }, 403);

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return json({ ok: false, error: "Escolha um arquivo .xlsx" }, 400);
  const mode = form.get("mode") === "replace" ? "replace" : "add";
  const dryRun = form.get("dry") === "1";

  try {
    const summary = await importSpreadsheet(m.householdId, s.user.id, Buffer.from(await file.arrayBuffer()), mode, dryRun);
    if (!dryRun) revalidatePath("/", "layout");
    return json({ ok: true, summary });
  } catch (e) {
    if (e instanceof ImportError) return json({ ok: false, error: e.message }, 400);
    console.error(e);
    return json({ ok: false, error: "Falha ao importar. Nada foi alterado." }, 500);
  }
}
