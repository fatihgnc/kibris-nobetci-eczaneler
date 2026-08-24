/**
 * Runs inline in <body> before the app renders, so the correct theme is on
 * <html> for the first paint. A stored choice wins; otherwise light, the
 * default. Failures fall back to light too.
 */
export const THEME_INIT_SCRIPT = `(function(){try{
var s=localStorage.getItem("theme");
document.documentElement.dataset.theme=(s==="light"||s==="dark")?s:"light";
}catch(e){document.documentElement.dataset.theme="light";}})();`;
