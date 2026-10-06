"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { QuickAdd, type LineOpt } from "./quick-add";
import { IconGear, IconLayers, IconPie, IconPlus, IconTable, Toast } from "./ui";

const ToastCtx = createContext<(m: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

const NAV = [
  { href: "/planilha", label: "Planilha", icon: <IconTable /> },
  { href: "/budget", label: "Budget", icon: <IconPie /> },
  { href: "/tabelas", label: "Tabelas", icon: <IconLayers /> },
  { href: "/ajustes", label: "Ajustes", icon: <IconGear /> },
];

export function AppShell({
  children,
  lines,
  ai,
  audio,
  householdName,
}: {
  children: ReactNode;
  lines: LineOpt[];
  ai: boolean;
  audio: boolean;
  householdName: string;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const clear = useCallback(() => setToast(null), []);
  const close = useCallback(() => setOpen(false), []);

  return (
    <ToastCtx.Provider value={setToast}>
      <header className="sticky top-0 z-30 hidden border-b border-line bg-card md:block">
        <div className="mx-auto flex max-w-[1440px] items-center gap-5 px-6 py-3">
          <Link href="/planilha" className="flex items-center gap-2.5">
            <span className="flex size-[34px] items-center justify-center rounded-[10px] bg-ink text-[13px] font-bold text-white">R$</span>
            <span className="text-[17px] font-semibold tracking-tight">{householdName}</span>
          </Link>
          <nav aria-label="Seções" className="flex gap-0.5 rounded-[10px] bg-line-2 p-[3px]">
            {NAV.map((n) => {
              const on = path.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={on ? "page" : undefined}
                  className={`flex h-[34px] items-center rounded-lg px-3.5 text-[13px] ${on ? "bg-card font-semibold shadow-sm" : "font-medium text-muted"}`}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex-1" />
          <button onClick={() => setOpen(true)} className="flex h-10 items-center gap-2 rounded-[10px] bg-ink px-4 text-sm font-semibold text-white">
            <IconPlus size={16} /> Adicionar gasto
          </button>
        </div>
      </header>

      <div className="pb-[150px] md:pb-0">{children}</div>

      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-[92px] right-4 z-30 flex h-[58px] items-center gap-2.5 rounded-[18px] bg-ink pl-4 pr-5 text-[15px] font-semibold text-white shadow-[0_10px_28px_rgba(22,25,27,.28)] md:hidden"
      >
        <IconPlus size={22} /> Adicionar gasto
      </button>

      <nav aria-label="Seções" className="fixed inset-x-0 bottom-0 z-30 grid h-[76px] grid-cols-4 border-t border-line bg-card pb-2 md:hidden">
        {NAV.map((n) => {
          const on = path.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={on ? "page" : undefined}
              className={`flex flex-col items-center justify-center gap-1 text-xs ${on ? "font-semibold text-ink" : "font-medium text-muted"}`}
            >
              {n.icon}
              {n.label}
            </Link>
          );
        })}
      </nav>

      <QuickAdd open={open} onClose={close} lines={lines} ai={ai} audio={audio} onSaved={setToast} />
      <Toast message={toast} onDone={clear} />
    </ToastCtx.Provider>
  );
}
