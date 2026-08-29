import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["tr", "en"],
  defaultLocale: "tr",
  // Initial locale from Accept-Language, then persisted in a cookie.
  localeDetection: true,
  localeCookie: true,
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
    "/pharmacy/[slug]": { tr: "/eczane/[slug]", en: "/pharmacy/[slug]" },
    "/about": { tr: "/hakkinda", en: "/about" },
    "/privacy": { tr: "/gizlilik", en: "/privacy" },
  },
});

export type AppLocale = (typeof routing.locales)[number];
export type AppPathname = keyof typeof routing.pathnames;
