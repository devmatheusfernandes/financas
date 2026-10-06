import Link from "next/link";
import { MESES, MESES_LONGOS } from "@/lib/format";
import { periodHref } from "@/lib/period";
import { IconChevron } from "./ui";

export function PeriodBar({
  base,
  period,
  extra = {},
}: {
  base: string;
  period: { year: number; size: number; start: number; curM0: number };
  extra?: Record<string, string>;
}) {
  const { year, size, start } = period;
  const cur = period.curM0;
  const sizes = [1, 3, 6, 12];
  const label =
    size === 1 ? `${MESES_LONGOS[start]}` : size === 12 ? "jan – dez" : `${MESES[start]} – ${MESES[start + size - 1]}`;
  const prev =
    start - size >= 0
      ? periodHref(base, { year, size, start: start - size }, extra)
      : periodHref(base, { year: year - 1, size, start: 12 - size }, extra);
  const next =
    start + size <= 12 - size
      ? periodHref(base, { year, size, start: start + size }, extra)
      : periodHref(base, { year: year + 1, size, start: 0 }, extra);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex gap-1.5" role="group" aria-label="Período">
        {sizes.map((n) => {
          const s = n === 12 ? 0 : cur >= 0 ? Math.floor(cur / n) * n : Math.floor(start / n) * n;
          const on = n === size;
          return (
            <Link
              key={n}
              href={periodHref(base, { year, size: n, start: s }, extra)}
              aria-current={on ? "true" : undefined}
              className={`flex h-10 min-w-11 items-center justify-center rounded-full border px-2.5 text-[13px] font-semibold ${
                on ? "border-ink bg-ink text-on-ink" : "border-line bg-card"
              }`}
            >
              {n === 1 ? "Mês" : `${n}M`}
            </Link>
          );
        })}
      </div>
      <div className="flex items-center">
        <Link href={prev} aria-label="Período anterior" className="flex size-10 items-center justify-center rounded-lg">
          <IconChevron dir="left" />
        </Link>
        <span className="min-w-[110px] text-center text-sm font-semibold">
          {label} <span className="font-normal text-muted">{year}</span>
        </span>
        <Link href={next} aria-label="Próximo período" className="flex size-10 items-center justify-center rounded-lg">
          <IconChevron />
        </Link>
      </div>
    </div>
  );
}
