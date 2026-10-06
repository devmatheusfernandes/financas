"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";

const DESKTOP = "(min-width: 768px)";
/** No desktop o Sheet é uma gaveta à direita; no celular, uma folha que sobe de baixo. */
function useIsDesktop() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(DESKTOP);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(DESKTOP).matches,
    () => false,
  );
}

export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const t = setTimeout(() => panel.current?.focus(), 10);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      clearTimeout(t);
      document.body.style.overflow = "";
      prev?.focus?.();
    };
  }, [open, onClose]);

  const desktop = useIsDesktop();
  const hidden = desktop ? { x: "100%" } : { y: "100%" };
  return (
    <AnimatePresence>
      {open && (
    <div key="sheet" className="fixed inset-0 z-50">
      <motion.button
        aria-label="Fechar"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      />
      <motion.div
        ref={panel}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        initial={hidden}
        animate={{ x: 0, y: 0 }}
        exit={hidden}
        transition={{ type: "spring", damping: 34, stiffness: 360 }}
        className="absolute inset-x-0 bottom-0 flex max-h-[94dvh] flex-col rounded-t-3xl bg-card shadow-2xl outline-none md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[460px] md:rounded-none md:rounded-l-2xl"
      >
        <div className="flex justify-center pt-2 md:hidden">
          <span className="h-1.5 w-10 rounded-full bg-line" />
        </div>
        <div className="flex items-start justify-between gap-3 border-b border-line-2 px-4 pb-3 pt-2.5 md:px-6 md:pt-5">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
            {subtitle && <div className="text-[13px] text-muted">{subtitle}</div>}
          </div>
          <button onClick={onClose} aria-label="Fechar" className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-soft-2">
            <IconX />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6">{children}</div>
        {footer && <div className="flex gap-2.5 border-t border-line-2 px-4 pb-7 pt-3 md:px-6 md:pb-5">{footer}</div>}
      </motion.div>
    </div>
      )}
    </AnimatePresence>
  );
}

/**
 * Bloco cinza de carregamento. Use com as medidas do conteúdo real, para a tela não
 * "pular" quando os dados chegam. `escuro` é para painéis de fundo escuro.
 */
export function Skel({
  w,
  h = 12,
  r = 6,
  escuro = false,
  className = "",
}: {
  w?: number | string;
  h?: number | string;
  r?: number;
  escuro?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`block esqueleto ${escuro ? "esqueleto-escuro" : ""} ${className}`}
      style={{ width: w ?? "100%", height: h, borderRadius: r }}
    />
  );
}

/** Envolve um esqueleto de tela inteira, anunciando o carregamento a leitores de tela. */
export function SkelTela({ children, label = "Carregando" }: { children: ReactNode; label?: string }) {
  return (
    <div role="status" aria-label={label} aria-busy="true">
      {children}
    </div>
  );
}

/** Preenchimento de barra de progresso que cresce até `pct` (0–100). A cor/posição vêm de `className`. */
export function Bar({ pct, className = "" }: { pct: number; className?: string }) {
  return (
    <motion.span
      className={className}
      initial={{ width: 0 }}
      animate={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    />
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className = "",
  size = "md",
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      className={`grid rounded-xl bg-soft-2 p-1 ${className}`}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={`${size === "sm" ? "h-9 text-[13px]" : "h-10 text-sm"} rounded-[9px] px-2 ${
            o.value === value ? "bg-card font-semibold shadow-sm" : "font-medium text-muted"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const inputCls = "h-11 rounded-[10px] border border-line bg-card px-3 text-[15px] w-full";
export const btnPrimary = "h-12 rounded-[14px] bg-ink px-5 text-[15px] font-semibold text-on-ink disabled:opacity-50";
export const btnGhost = "h-12 rounded-[14px] border border-line bg-card px-4 text-[15px] font-semibold";
export const btnDanger = "h-12 rounded-[14px] border border-edge-out bg-card px-4 text-[15px] font-semibold text-over-ink";

export function MoneyInput({
  value,
  onChange,
  autoFocus,
  big = false,
  label = "Valor",
}: {
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  big?: boolean;
  label?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-muted">{label}</span>
      <span className={`flex items-center gap-2 rounded-[14px] border-[1.5px] border-ink px-3.5 ${big ? "h-[60px]" : "h-[52px]"}`}>
        <span className="text-muted">R$</span>
        <input
          inputMode="decimal"
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0,00"
          className={`num min-w-0 flex-1 bg-transparent font-semibold outline-none ${big ? "text-[28px]" : "text-2xl"}`}
        />
      </span>
    </label>
  );
}

export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 2800);
    return () => clearTimeout(t);
  }, [message, onDone]);
  return (
    <AnimatePresence>
      {message && (
        <div key="toast" className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex justify-center px-4">
          <motion.div
            role="status"
            initial={{ opacity: 0, y: -16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-auto w-[min(92vw,460px)] rounded-xl bg-ink px-4 py-3 text-sm text-on-ink shadow-xl"
          >
            {message}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/* ---------- ícones (traço) ---------- */
const S = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
export const IconX = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...S}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
export const IconPlus = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...S} strokeWidth={2.2}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const IconChevron = ({ dir = "right", size = 18 }: { dir?: "left" | "right" | "down"; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...S} style={{ transform: dir === "left" ? "rotate(180deg)" : dir === "down" ? "rotate(90deg)" : undefined }}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);
export const IconLink = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...S} strokeWidth={2.5}>
    <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
    <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
  </svg>
);
export const IconSpark = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...S}>
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
  </svg>
);
export const IconCamera = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...S}>
    <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
);
export const IconMic = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...S}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
);
export const IconText = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...S}>
    <path d="M4 6h16M4 12h10M4 18h13" />
  </svg>
);
export const IconForm = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...S}>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="M8 9h8M8 13h5" />
  </svg>
);
export const IconTable = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...S}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 10h18M9 10v10" />
  </svg>
);
export const IconPie = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...S}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3v9h9" />
  </svg>
);
export const IconGear = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...S}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
);
export const IconLayers = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...S}>
    <path d="M12 3l9 5-9 5-9-5 9-5z" />
    <path d="M3 13l9 5 9-5" />
  </svg>
);
