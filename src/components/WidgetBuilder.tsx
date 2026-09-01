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

/**
 * The height snippet, offered but never required.
 *
 * It listens for the message the frame posts on load and on every resize. The
 * origin check matters: without it any page in any frame could resize this
 * element by posting the right shape.
 */
const heightScript = (origin: string) => `<script>
addEventListener('message',function(e){if(e.origin!=='${origin}'||!e.data||!e.data.acikeczanevarmi)return;
var f=document.getElementById('eczane-widget');if(f)f.style.height=e.data.height+'px';});
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
  const [lang, setLang] = useState<"tr" | "en">("tr");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [copied, setCopied] = useState(false);

  const region = regions.find((r) => r.slug === slug);
  const name = region ? region[lang] : labels.allRegions;
  // Only the non-defaults are written, so the common snippet stays a bare URL
  // rather than one trailing two parameters that change nothing.
  const q = new URLSearchParams();
  if (lang !== "tr") q.set("lang", lang);
  if (theme !== "light") q.set("theme", theme);
  const query = q.toString() ? `?${q}` : "";
  // Absolute in the snippet, because it is going to be pasted somewhere else.
  const src = `${origin}/embed/${slug}${query}`;
  // Relative in the preview, so the frame below always shows this deployment
  // rather than whatever is live at the canonical origin. On production the two
  // resolve to the same page; anywhere else they would not, and a preview that
  // quietly renders production is a preview of the wrong thing.
  const previewSrc = `/embed/${slug}${query}`;
  const page =
    lang === "en"
      ? slug === "kktc"
        ? `${origin}/en`
        : `${origin}/en/pharmacies-on-duty/${slug}`
      : slug === "kktc"
        ? origin
        : `${origin}/nobetci-eczaneler/${slug}`;

  // The credit line is a sibling of the frame, never inside it. A link within
  // the iframe is a document of ours pointing at us and does nothing for
  // either side; this one lives in the host's own HTML, which is the entire
  // reason the widget is free.
  const snippet = `<iframe id="eczane-widget" src="${src}"
        title="${name}" loading="lazy"
        style="width:100%;height:420px;border:0"></iframe>
<p>${lang === "en" ? "Source" : "Kaynak"}: <a href="${page}">${name} — acikeczanevarmi.com</a></p>`;

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
          <select value={lang} onChange={(e) => setLang(e.target.value as "tr" | "en")}>
            <option value="tr">{labels.langTr}</option>
            <option value="en">{labels.langEn}</option>
          </select>
        </label>
        {/* Theirs to choose, not ours to detect. The frame sits inside someone
            else's design, and a widget that read the reader's own dark-mode
            setting would paint itself dark on a light news page. */}
        <label>
          <span>{labels.themeLabel}</span>
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as "light" | "dark")}
          >
            <option value="light">{labels.themeLight}</option>
            <option value="dark">{labels.themeDark}</option>
          </select>
        </label>
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

      <h2>{labels.previewTitle}</h2>
      {/* The real thing, from the real address: what is shown here is what the
          snippet produces, so nobody has to paste it to find out. */}
      <iframe
        key={previewSrc}
        className="wframe"
        src={previewSrc}
        title={labels.previewTitle}
        loading="lazy"
      />

      <h2>{labels.heightTitle}</h2>
      <p>{labels.heightBody}</p>
      <pre className="wcode">
        <code>{heightScript(origin)}</code>
      </pre>
    </div>
  );
}
