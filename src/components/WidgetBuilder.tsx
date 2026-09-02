"use client";
// The snippet generator, and a live frame of what it produces.
//
// Every string arrives as a prop rather than through useTranslations. The
// `widget` namespace is held back from the browser (src/lib/messages.ts) the
// way every other page-specific namespace is: shipping twenty strings to every
// visitor of the roster so that one page can render them is the trade that file
// exists to refuse. Plain text on a plain object crosses the boundary cleanly.
import { useState } from "react";

export interface WidgetLabels {
  pickLabel: string;
  allRegions: string;
  langLabel: string;
  langTr: string;
  langEn: string;
  codeTitle: string;
  copy: string;
  copied: string;
  previewTitle: string;
  themeLabel: string;
  themeLight: string;
  themeDark: string;
  accentLabel: string;
  accentReset: string;
  anchorLabel: string;
  anchorHint: string;
  lazyLabel: string;
  lazyHint: string;
  viewDesktop: string;
  viewMobile: string;
  posterAlt: string;
  noscript: string;
  heightTitle: string;
  heightBody: string;
}

/**
 * Both spellings, because the page's language and the snippet's are separate
 * choices: a Turkish editor may well want the English frame for an English
 * edition, and the credit line beside it should then read "Nicosia (Lefkoşa)"
 * rather than the name the page around it happens to be written in.
 */
export interface WidgetRegion {
  slug: string;
  tr: string;
  en: string;
}

type Lang = "tr" | "en";
type Theme = "light" | "dark";

/** The theme's own accent; must match LIGHT/DARK in app/embed/[region]/page.tsx. */
const DEFAULT_ACCENT: Record<Theme, string> = { light: "#1550a8", dark: "#8ab4f8" };

/**
 * Text that lands in the host's HTML, in the snippet's language rather than
 * the page's. Kept here with the other snippet-only strings ("Kaynak" used to
 * be one) because the catalogue only knows the page's locale.
 */
const DEFAULT_ANCHOR: Record<Lang, string> = {
  tr: "Nöbetçi eczane verisi: acikeczanevarmi.com",
  en: "On-duty pharmacy data: acikeczanevarmi.com",
};
const FRAME_TITLE: Record<Lang, string> = {
  tr: "KKTC nöbetçi eczaneler",
  en: "Northern Cyprus pharmacies on duty",
};

/** Placeholders until real captures exist; swap the files, keep the paths. */
const POSTER = { desktop: "/widget/preview-desktop.svg", mobile: "/widget/preview-mobile.svg" };

/** The anchor text is typed by the editor and pasted as markup, so it is escaped as markup. */
const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The height snippet, offered but never required.
 *
 * It listens for the message the frame posts on load and on every resize. The
 * origin check matters: without it any page in any frame could resize this
 * element by posting the right shape.
 *
 * The frame is found by `e.source` — the window that sent the message — so a
 * page carrying two widgets (Lefkoşa and Girne side by side, say) sizes each
 * one to its own list instead of both to whichever posted last. The lookup by
 * id is kept as the fallback for pages that pasted the first version of the
 * snippet, whose frame is `#eczane-widget` and whose script is this one.
 */
const heightScript = (origin: string) => `<script>
addEventListener('message',function(e){
  if(e.origin!=='${origin}'||!e.data||!e.data.acikeczanevarmi)return;
  var f=null,all=document.getElementsByTagName('iframe');
  for(var i=0;i<all.length;i++)if(all[i].contentWindow===e.source){f=all[i];break}
  if(!f)f=document.getElementById('eczane-widget');
  if(f)f.style.height=e.data.height+'px';
});
</script>`;

export default function WidgetBuilder({
  regions,
  origin,
  labels,
}: {
  regions: WidgetRegion[];
  /** Absolute, so the snippet works when pasted somewhere else entirely. */
  origin: string;
  labels: WidgetLabels;
}) {
  const [slug, setSlug] = useState("kktc");
  const [lang, setLang] = useState<Lang>("tr");
  const [theme, setTheme] = useState<Theme>("light");
  // Null means "the theme's own", which is what the snippet leaves unsaid.
  const [accent, setAccent] = useState<string | null>(null);
  // Null means "not edited": the default then follows the snippet language,
  // and stops following it the moment the editor types their own.
  const [anchor, setAnchor] = useState<string | null>(null);
  const [lazy, setLazy] = useState(false);
  const [copied, setCopied] = useState(false);
  // Which preview address has finished loading. Compared against the current
  // one rather than stored as a boolean, so a change of options puts the
  // poster back until the new frame paints.
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);

  const region = regions.find((r) => r.slug === slug);
  const name = region ? region[lang] : labels.allRegions;
  // Only the non-defaults are written, so the common snippet stays a bare URL
  // rather than one trailing three parameters that change nothing.
  const q = new URLSearchParams();
  if (lang !== "tr") q.set("lang", lang);
  if (theme !== "light") q.set("theme", theme);
  if (accent) q.set("accent", accent); // "#" is written as %23 for us
  const query = q.toString() ? `?${q}` : "";
  // Absolute in the snippet, because it is going to be pasted somewhere else.
  const src = `${origin}/embed/${slug}${query}`;
  // Relative in the preview, so the frame below always shows this deployment
  // rather than whatever is live at the canonical origin. On production the two
  // resolve to the same page; anywhere else they would not, and a preview that
  // quietly renders production is a preview of the wrong thing.
  const previewSrc = `/embed/${slug}${query}`;
  const loaded = loadedSrc === previewSrc;
  // Where the credit link goes: the region's own page, in the snippet's
  // language, so a Girne newspaper sends its readers to the Girne roster.
  const page =
    lang === "en"
      ? slug === "kktc"
        ? `${origin}/en`
        : `${origin}/en/pharmacies-on-duty/${slug}`
      : slug === "kktc"
        ? origin
        : `${origin}/nobetci-eczaneler/${slug}`;
  const title = region ? `${FRAME_TITLE[lang]} — ${name}` : FRAME_TITLE[lang];
  const anchorText = anchor ?? DEFAULT_ANCHOR[lang];

  // The credit line is a sibling of the frame, never inside it. A link within
  // the iframe is a document of ours pointing at us and does nothing for
  // either side; this one lives in the host's own HTML, which is the entire
  // reason the widget is free.
  //
  // The id carries the region so two frames on one page do not share one;
  // the resize script no longer needs it, but an editor's own CSS might.
  const snippet = `<iframe id="eczane-widget-${slug}" src="${src}"
        title="${escapeHtml(title)}"${lazy ? '\n        loading="lazy"' : ""}
        style="width:100%;height:420px;border:0"></iframe>
<p><a href="${page}">${escapeHtml(anchorText)}</a></p>`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission denied, or an insecure origin. The code is on
      // screen and selectable either way, so this needs no error of its own.
    }
  };

  // The static fallback. With scripts off the poster swap above cannot run
  // and the tabs still work (they are radio buttons), so the honest preview is
  // the capture itself: the live frame and its poster are hidden here and the
  // capture stands in. Rendered as markup because React drops the children of
  // <noscript> on the client, which is exactly right — this must only exist
  // for a browser that will never run the component.
  const noscript = `<style>.wstage{display:none}</style>
<p class="wnoscript">${escapeHtml(labels.noscript)}</p>
<img class="wstatic wstatic-d" src="${POSTER.desktop}" alt="${escapeHtml(labels.posterAlt)}" width="640" height="420">
<img class="wstatic wstatic-m" src="${POSTER.mobile}" alt="${escapeHtml(labels.posterAlt)}" width="360" height="520">`;

  return (
    <div className="wbuild">
      <div className="wrow">
        <label>
          <span>{labels.pickLabel}</span>
          <select value={slug} onChange={(e) => setSlug(e.target.value)}>
            <option value="kktc">{labels.allRegions}</option>
            {regions.map((r) => (
              <option key={r.slug} value={r.slug}>
                {r[lang]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{labels.langLabel}</span>
          <select value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
            <option value="tr">{labels.langTr}</option>
            <option value="en">{labels.langEn}</option>
          </select>
        </label>
        {/* Theirs to choose, not ours to detect. The frame sits inside someone
            else's design, and a widget that read the reader's own dark-mode
            setting would paint itself dark on a light news page. */}
        <label>
          <span>{labels.themeLabel}</span>
          <select value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
            <option value="light">{labels.themeLight}</option>
            <option value="dark">{labels.themeDark}</option>
          </select>
        </label>
        {/* One colour, for the phone buttons and the tints around them, so the
            frame can wear the host's brand instead of ours. A colour input only
            ever yields #rrggbb; the frame re-checks that on its own side. */}
        <div className="wfield">
          <label htmlFor="waccent">
            <span>{labels.accentLabel}</span>
          </label>
          <span className="waccent">
            <input
              id="waccent"
              type="color"
              value={accent ?? DEFAULT_ACCENT[theme]}
              onChange={(e) => setAccent(e.target.value)}
            />
            <code>{accent ?? DEFAULT_ACCENT[theme]}</code>
            {accent && (
              <button type="button" onClick={() => setAccent(null)}>
                {labels.accentReset}
              </button>
            )}
          </span>
        </div>
      </div>

      <h2>{labels.codeTitle}</h2>
      <pre className="wcode">
        <code>{snippet}</code>
      </pre>
      <p>
        <button className="wcopy" onClick={copy}>
          {copied ? labels.copied : labels.copy}
        </button>
      </p>

      <div className="wopts">
        <label>
          <span>{labels.anchorLabel}</span>
          <input
            type="text"
            value={anchorText}
            onChange={(e) => setAnchor(e.target.value)}
            spellCheck={false}
          />
        </label>
        <p className="note">{labels.anchorHint}</p>
        {/* Off by default. Lazy loading is right for a frame below the fold
            and wrong for one at the top of an article, where it costs the
            reader a visible wait for a list they came for; that is the
            editor's call, and they know where on the page it goes. */}
        <label className="wcheck">
          <input type="checkbox" checked={lazy} onChange={(e) => setLazy(e.target.checked)} />
          {labels.lazyLabel}
        </label>
        <p className="note">{labels.lazyHint}</p>
      </div>

      <h2>{labels.previewTitle}</h2>
      {/* The real thing, from the real address: what is shown here is what the
          snippet produces, so nobody has to paste it to find out. The
          desktop/mobile switch is a pair of radio buttons driven by CSS, so it
          works before hydration and without scripts at all. */}
      <div className="wview">
        <input type="radio" name="wview" id="wview-desktop" className="wview-in" defaultChecked />
        <label htmlFor="wview-desktop" className="wtab">
          {labels.viewDesktop}
        </label>
        <input type="radio" name="wview" id="wview-mobile" className="wview-in" />
        <label htmlFor="wview-mobile" className="wtab">
          {labels.viewMobile}
        </label>
        <div className={`wstage${loaded ? " is-loaded" : ""}`}>
          {/* Static captures under the frame, shown until it paints: the
              preview has a shape from the first byte instead of a blank box
              for as long as the roster takes. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- poster, not content */}
          <img className="wposter wposter-d" src={POSTER.desktop} alt="" aria-hidden="true" />
          {/* eslint-disable-next-line @next/next/no-img-element -- poster, not content */}
          <img className="wposter wposter-m" src={POSTER.mobile} alt="" aria-hidden="true" />
          <iframe
            key={previewSrc}
            className="wframe"
            src={previewSrc}
            title={title}
            onLoad={() => setLoadedSrc(previewSrc)}
          />
        </div>
        <noscript dangerouslySetInnerHTML={{ __html: noscript }} />
      </div>

      <h2>{labels.heightTitle}</h2>
      <p>{labels.heightBody}</p>
      <pre className="wcode">
        <code>{heightScript(origin)}</code>
      </pre>
    </div>
  );
}
