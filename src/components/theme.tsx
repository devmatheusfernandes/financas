"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { DARK_QUERY, THEME_KEY as KEY } from "./theme-script";
import { Segmented } from "./ui";

export type Theme = "system" | "light" | "dark";
const EVENT = "tema-change";

function read(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

function apply(t: Theme) {
  const dark = t === "dark" || (t === "system" && window.matchMedia(DARK_QUERY).matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const theme = useSyncExternalStore(subscribe, read, () => "system" as Theme);

  // useLayoutEffect (e não useEffect) porque roda antes da pintura: em desenvolvimento o
  // Strict Mode remonta e limpa os atributos do <html>, e isto repõe o tema sem piscar.
  useLayoutEffect(() => {
    apply(theme);
    if (theme !== "system") return;
    const m = window.matchMedia(DARK_QUERY);
    const on = () => apply("system");
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [theme]);

  const set = (t: Theme) => {
    try {
      if (t === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, t);
    } catch {}
    window.dispatchEvent(new Event(EVENT));
  };
  return [theme, set];
}

export function ThemeSetting() {
  const [theme, setTheme] = useTheme();
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-4">
      <h2 className="text-[15px] font-semibold">Aparência</h2>
      <Segmented<Theme>
        value={theme}
        onChange={setTheme}
        options={[
          { value: "system", label: "Sistema" },
          { value: "light", label: "Claro" },
          { value: "dark", label: "Escuro" },
        ]}
      />
      <p className="text-xs text-muted">“Sistema” segue o modo claro/escuro do seu aparelho.</p>
    </section>
  );
}

/** Montado uma vez no layout raiz: aplica o tema e acompanha o sistema em qualquer página. */
export function ThemeSync() {
  useTheme();
  return null;
}
