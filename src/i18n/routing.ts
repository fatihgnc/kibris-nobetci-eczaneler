import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["tr", "en"],
  defaultLocale: "tr",
  // Initial locale from Accept-Language, then persisted in a cookie.
  localeDetection: true,
  localeCookie: true,
});

export type AppLocale = (typeof routing.locales)[number];
