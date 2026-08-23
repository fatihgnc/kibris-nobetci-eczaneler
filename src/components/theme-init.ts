/**
 * Runs inline in <body> before the app renders, so the correct theme is on
 * <html> for the first paint. A stored choice wins; otherwise the system
 * preference decides. Failures fall back to dark, the design's default.
 */
export const THEME_INIT_SCRIPT = `(function(){try{
var s=localStorage.getItem("theme");
var t=(s==="light"||s==="dark")?s:(window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark");
document.documentElement.dataset.theme=t;
}catch(e){document.documentElement.dataset.theme="dark";}})();`;
