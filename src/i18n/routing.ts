import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["tr", "en"],
  defaultLocale: "tr",
  /**
   * Turkish lives at the bare URL; only /en carries a prefix.
   *
   * `/` used to 307 to /tr on every arrival, and on a throttled phone that
   * round trip was the single largest line in the Lighthouse audit (~1s of
   * LCP). Serving the default locale at the root removes the hop entirely;
   * /tr/* now permanently redirects to /*, so old links keep working.
   */
  localePrefix: "as-needed",
  /**
   * No detection and no cookie — both deliberate, and they stand together.
   *
   * Detection would still redirect `/` for any browser whose Accept-Language
   * is not Turkish (Lighthouse's included), which is the exact cost being
   * removed. And the NEXT_LOCALE Set-Cookie on every page response is what
   * kept the CDN from caching the HTML at all. English stays one tap away on
   * the visible TR/EN switch, and /en URLs hold the choice from then on.
   */
  localeDetection: false,
  localeCookie: false,
  /**
   * Localised URLs, so each side of the site is addressed in its own language.
   *
   * The keys are internal names — what the folders under app/[locale] are called
   * and what `Link` is given — and they stay English along with the rest of the
   * code. Only the values on the right are user-facing; next-intl rewrites
   * between the two. The region and pharmacy slugs inside them are the same in
   * both locales: they are proper nouns, and one slug per place means one page
   * per place rather than two competing for it.
   */
  pathnames: {
    "/": "/",
    "/pharmacies-on-duty/[region]": {
      tr: "/nobetci-eczaneler/[region]",
      en: "/pharmacies-on-duty/[region]",
    },
    "/pharmacies": { tr: "/eczaneler", en: "/pharmacies" },
    // The same word in both: it is what the people who would embed it call it.
    "/widget": { tr: "/widget", en: "/widget" },
    "/pharmacy/[slug]": { tr: "/eczane/[slug]", en: "/pharmacy/[slug]" },
    "/about": { tr: "/hakkinda", en: "/about" },
    "/privacy": { tr: "/gizlilik", en: "/privacy" },
    "/contact": { tr: "/iletisim", en: "/contact" },
  },
});

export type AppLocale = (typeof routing.locales)[number];
export type AppPathname = keyof typeof routing.pathnames;
