import "server-only";
import type { loadYear } from "./data";

/** Formato leve usado pelos editores de vínculo/budget no cliente. */
export function toLinkTables(data: Awaited<ReturnType<typeof loadYear>>) {
  return data.grid.tables.map((t) => ({
    id: t.id,
    name: t.name,
    sum: t.sum,
    lines: t.lines.map((l) => ({ id: l.id, name: l.name, vals: l.vals })),
  }));
}
