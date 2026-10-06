import { getMembership, getSession } from "@/lib/session";
import { buildExport, buildTemplate } from "@/server/spreadsheet";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(req: Request) {
  const s = await getSession();
  if (!s) return new Response("Não autenticado", { status: 401 });
  const m = await getMembership(s.user.id);
  if (!m) return new Response("Sem planilha", { status: 403 });

  const modelo = new URL(req.url).searchParams.has("modelo");
  const buf = modelo ? await buildTemplate() : await buildExport(m.householdId);
  const name = modelo ? "modelo-financas.xlsx" : `financas-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": XLSX, "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}
