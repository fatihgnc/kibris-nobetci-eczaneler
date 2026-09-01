import type { Metadata, Viewport } from "next";

/**
 * A second root layout, and deliberately almost empty.
 *
 * Everything under `[locale]` inherits a layout that is right for this site and
 * wrong for someone else's: globals.css, two Google font families, Vercel
 * Analytics, Speed Insights, the site-wide JSON-LD, and a service worker
 * registration. Dropping that into an iframe on a newspaper's article page
 * would be rude at best — a service worker scoped to our origin, registered
 * from inside their page, is not something to do to a host who agreed to embed
 * a pharmacy list.
 *
 * So the embed answers from its own root: no fonts to fetch, no scripts, no
 * stylesheet, nothing but the markup and the rules right here.
 */
export const metadata: Metadata = {
  /**
   * Never indexed, and this is not a detail.
   *
   * An indexed /embed/lefkosa is the same roster as /nobetci-eczaneler/lefkosa
   * at a second address, with none of the page around it — the textbook way to
   * make two of your own pages compete and lose to each other. It stays out of
   * the sitemap for the same reason.
   */
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

/**
 * Every colour is a variable, and the page sets them.
 *
 * The first version asked `prefers-color-scheme` instead, which reads the
 * viewer's operating system rather than the site the frame is sitting in — so a
 * light news page on a dark-mode laptop got a frame painted for the wrong
 * surroundings. Worse, that version left the body transparent in dark mode:
 * near-white headings landed on the host's white background and the title
 * disappeared. The embedder picks the theme now, and every theme paints its own
 * background explicitly.
 *
 * The type is set in the host's own system stack on purpose. A webfont is the
 * one thing that would make this frame expensive to carry — a second connection
 * and a render-blocking request on someone else's article — and the system
 * faces are the ones already loaded on the reader's machine. What is left to
 * work with is spacing, weight and rhythm, which is most of it anyway.
 */
const css = `
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0}
body{
  font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  background:var(--bg);color:var(--fg);-webkit-text-size-adjust:100%;
  -webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;
}
/* Room to breathe inside the frame. It had almost none, which left the header
   sitting on the top edge and the cards running into the sides — the look of
   something pasted in rather than placed. The padding belongs here and not on
   the host's iframe: theirs is a style attribute an editor may well overwrite,
   and this is the one that travels with the widget. */
.wrap{padding:16px}
@media (max-width:420px){.wrap{padding:12px}}

/* ---- header ---- */
.head{
  display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap;
  padding-bottom:11px;margin-bottom:13px;border-bottom:1px solid var(--line);
}
.head h2{
  margin:0;font-size:15px;font-weight:650;letter-spacing:-.015em;color:var(--fg);
  display:flex;align-items:center;gap:7px;
}
/* The mark that says this thing keeps itself current — the single reason an
   editor takes it instead of typing the list out. Held to one soft pulse so it
   reads as "live" rather than as something demanding attention on a page it
   does not own. */
.dot{width:7px;height:7px;border-radius:50%;background:var(--live);flex:none;
  box-shadow:0 0 0 3px var(--live-halo);animation:p 2.4s ease-in-out infinite}
@keyframes p{0%,100%{opacity:1}50%{opacity:.45}}
@media (prefers-reduced-motion:reduce){.dot{animation:none}}
.meta{font-size:12px;color:var(--dim);letter-spacing:.005em;font-variant-numeric:tabular-nums}
.meta b{font-weight:600;color:var(--fg2)}

/* ---- list ---- */
ul{list-style:none;margin:0;padding:0;display:grid;gap:9px}
li{
  border:1px solid var(--line);border-radius:12px;padding:12px 13px;background:var(--card);
  box-shadow:var(--sh);transition:border-color .15s ease,box-shadow .15s ease;
}
li:hover{border-color:var(--line-hi);box-shadow:var(--sh-hi)}
.nm{
  font-size:14px;font-weight:650;margin:0;color:var(--fg);
  letter-spacing:-.01em;line-height:1.3;overflow-wrap:anywhere;
}
/* The clock is the thing the eye is looking for, so it gets the one enclosed
   shape on the card and tabular figures so the column does not wobble. */
.hrs{
  display:inline-flex;align-items:center;gap:6px;margin:8px 0 0;padding:4px 9px;
  border-radius:7px;background:var(--chip);border:1px solid var(--chip-line);
  font-size:12.5px;font-weight:600;color:var(--fg);font-variant-numeric:tabular-nums;
  letter-spacing:.01em;
}
.hrs svg{width:12px;height:12px;flex:none;opacity:.55}
.ad{font-size:12.5px;color:var(--dim);margin:9px 0 0;line-height:1.5}
.ph{
  display:inline-flex;align-items:center;gap:7px;margin-top:11px;padding:7px 12px;
  border-radius:9px;border:1px solid var(--accent-line);background:var(--accent-soft);
  font-size:13px;font-weight:600;color:var(--accent);text-decoration:none;
  font-variant-numeric:tabular-nums;transition:background .15s ease;
}
.ph:hover{background:var(--accent-soft-hi)}
.ph svg{width:13px;height:13px;flex:none}

/* ---- credit ----
   Inside the frame, so it cannot be stripped the way the line on the host page
   can. It is the attribution that always survives, which is why it is set to be
   read rather than tucked away. */
.foot{
  margin-top:13px;padding-top:10px;border-top:1px solid var(--line);
  font-size:11.5px;color:var(--dim);letter-spacing:.01em;
}
.foot a{color:var(--fg2);text-decoration:none;font-weight:600}
.foot a:hover{color:var(--accent)}
.empty{
  border:1px dashed var(--line-hi);border-radius:12px;padding:18px 14px;
  font-size:13px;color:var(--dim);text-align:center;line-height:1.5;
}
`;

export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <head>
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
