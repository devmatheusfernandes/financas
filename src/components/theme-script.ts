export const THEME_KEY = "tema";
export const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * Roda no <head> antes da primeira pintura, para a página já abrir no tema certo (sem flash).
 * Usa um atributo, e não uma classe: o React gerencia o className do <html> e apagaria a classe.
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");var d=t==="dark"||(t!=="light"&&matchMedia("${DARK_QUERY}").matches);document.documentElement.setAttribute("data-theme",d?"dark":"light")}catch(_){}})()`;
