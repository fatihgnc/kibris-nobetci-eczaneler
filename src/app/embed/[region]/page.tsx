import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { getOnDuty } from "@/lib/on-duty";
import { formatDutyDate, shortTime, telHref } from "@/lib/format";
import { REGION_ORDER, REGION_SLUG, regionDisplay, regionFromSlug } from "@/lib/regions";
import { routing } from "@/i18n/routing";
import { SITE_URL } from "@/lib/site";
import type { OnDutyPharmacy } from "@/lib/types";

/**
 * The roster as someone else's page can carry it.
 *
 * The point of this route is a link we do not own. Local news sites publish a
 * duty list every day and most of them assemble it by hand; this hands them the
 * same list, kept current, in a snippet they paste once — and the credit line
 * that ships beside it is a real anchor in their HTML. That anchor is the whole
 * return: a link inside this frame would point from our origin to our origin
 * and carry nothing, which is exactly the mistake the /widget page is written
 * to stop people making.
 */
export const revalidate = 300;

/** Every region, plus the island-wide roster under a slug of its own. */
const ALL = "kktc";

export function generateStaticParams() {
  return [{ region: ALL }, ...REGION_ORDER.map((code) => ({ region: REGION_SLUG[code] }))];
}

type Params = Promise<{ region: string }>;
type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

/** `?lang=en` switches the frame; anything else is the default locale. */
function langFrom(raw: string | string[] | undefined): "tr" | "en" {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "en" ? "en" : routing.defaultLocale;
}

type Theme = "light" | "dark";

/**
 * `?theme=` — the host's choice, defaulting to light.
 *
 * There was a third option that followed `prefers-color-scheme`, and it was the
 * wrong thing to offer: that setting describes the reader's operating system,
 * not the page the frame is sitting in, so a light news site would have shown a
 * dark widget mid-article to half its audience. A site's theme is a decision its
 * editor already made; this takes that decision rather than guessing at it.
 */
function themeFrom(raw: string | string[] | undefined): Theme {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "dark" ? "dark" : "light";
}

const LIGHT = [
  "--bg:#fff",
  "--fg:#14141a",
  "--fg2:#3d3d47",
  "--dim:#71717f",
  "--line:#e8e8ef",
  "--line-hi:#d5d5e0",
  "--card:#fff",
  "--chip:#f5f5f9",
  "--chip-line:#e8e8ef",
  "--accent:#1550a8",
  "--accent-line:#d3e0f5",
  "--accent-soft:#f2f6fd",
  "--accent-soft-hi:#e7effb",
  "--live:#16a34a",
  "--live-halo:rgba(22,163,74,.16)",
  "--sh:0 1px 2px rgba(16,16,32,.04)",
  "--sh-hi:0 3px 10px rgba(16,16,32,.07)",
].join(";");

const DARK = [
  "--bg:#101014",
  "--fg:#f0f0f5",
  "--fg2:#c8c8d4",
  "--dim:#8f8f9e",
  "--line:#26262f",
  "--line-hi:#35353f",
  "--card:#17171d",
  "--chip:#1e1e26",
  "--chip-line:#2b2b35",
  "--accent:#8ab4f8",
  "--accent-line:#2c3a52",
  "--accent-soft:#181f2b",
  "--accent-soft-hi:#1e2736",
  "--live:#4ade80",
  "--live-halo:rgba(74,222,128,.15)",
  "--sh:0 1px 2px rgba(0,0,0,.3)",
  "--sh-hi:0 3px 10px rgba(0,0,0,.4)",
].join(";");

/**
 * The palette, as a stylesheet the page carries itself.
 *
 * A layout cannot read the query string, so the theme cannot be decided up
 * there — and it has to be decided on the server either way, or the frame would
 * paint itself light and then flip, in front of the reader, on somebody else's
 * article.
 */
const palette = (theme: Theme) => `:root{${theme === "dark" ? DARK : LIGHT}}`;

const ClockIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const PhoneIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path
      d="M6.5 3h3l1.5 4-2 1.5a12 12 0 0 0 5.5 5.5L16 12l4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4 6.2 2 2 0 0 1 6 4z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default async function EmbedPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { region: slug } = await params;
  const region = slug === ALL ? null : regionFromSlug(slug);
  if (region === null && slug !== ALL) notFound();

  const query = await searchParams;
  const locale = langFrom(query.lang);
  const theme = themeFrom(query.theme);
  const t = await getTranslations({ locale, namespace: "embed" });

  // Never throws its way out of here: a frame on someone else's page must
  // degrade to a line of text, never to their reader's browser showing an
  // error inside an article. The credit still goes out either way.
  let pharmacies: OnDutyPharmacy[] = [];
  let dutyDate: string | null = null;
  let failed = false;
  try {
    const data = await getOnDuty({ region });
    pharmacies = data.pharmacies;
    dutyDate = data.dutyDate;
  } catch {
    failed = true;
  }

  const regionName = region ? regionDisplay(region, locale) : t("island");
  const home = `${SITE_URL}${
    locale === "en"
      ? region
        ? `/en/pharmacies-on-duty/${slug}`
        : "/en"
      : region
        ? `/nobetci-eczaneler/${slug}`
        : "/"
  }`;

  const hours = (p: OnDutyPharmacy) => {
    const open = shortTime(p.opensAt);
    const close = shortTime(p.closesAt);
    return open && close ? `${open} – ${close}` : p.hoursRaw;
  };

  return (
    <div className="wrap">
      <style dangerouslySetInnerHTML={{ __html: palette(theme) }} />

      <div className="head">
        <h2>
          {/* The mark that says this list keeps itself current, which is the
              single reason an editor takes it instead of typing one out. */}
          <span className="dot" aria-hidden="true" />
          {t("title", { region: regionName })}
        </h2>
        {dutyDate && (
          <span className="meta">
            <b>{formatDutyDate(dutyDate, locale)}</b>
            {pharmacies.length > 0 && ` · ${t("count", { count: pharmacies.length })}`}
          </span>
        )}
      </div>

      {failed || pharmacies.length === 0 ? (
        <p className="empty">{failed ? t("unavailable") : t("empty", { region: regionName })}</p>
      ) : (
        <ul>
          {pharmacies.map((p) => (
            <li key={p.id}>
              <p className="nm">{p.name}</p>
              <p className="hrs">
                <ClockIcon />
                {hours(p)}
              </p>
              {p.address && <p className="ad">{p.address}</p>}
              {p.phone && (
                <a className="ph" href={telHref(p.phone)}>
                  <PhoneIcon />
                  {p.phone}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* The credit that travels with the frame.
          target=_blank because this document is inside someone else's page:
          navigating in place would leave their reader stranded in a pane with
          no way back. It is for a person, not a crawler — the link that counts
          for search sits in the host's own HTML, and cannot be put here. */}
      <p className="foot">
        {t("sourceLabel")}{" "}
        <a href={home} target="_blank" rel="noopener">
          {t("sourceLink")}
        </a>
      </p>

      {/* Tells the host how tall this came out, so a page that opted into the
          three-line resize snippet can stop guessing. Silent and harmless when
          nobody is listening: postMessage to a parent that never registered a
          handler simply goes nowhere. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){function h(){try{parent.postMessage({acikeczanevarmi:1,height:document.documentElement.scrollHeight},'*')}catch(e){}}
h();addEventListener('load',h);addEventListener('resize',h);
if(window.ResizeObserver)new ResizeObserver(h).observe(document.body);})();`,
        }}
      />
    </div>
  );
}
