import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { coveredDutyDays } from "@/lib/duty-days";
import { SITE_URL } from "@/lib/site";

/**
 * The two locale homepages, plus one URL per published day ahead.
 *
 * "5 eylül nöbetçi eczane" is a real search, and the app can answer it — but
 * only if the day has a URL of its own to rank. Today is deliberately absent:
 * it is served at the bare `/tr`, and listing `?date=<today>` beside it would
 * offer the same roster at two addresses.
 */
/**
 * Rebuilt hourly. The published horizon slides — a day drops off the front as
 * it becomes today, and new ones appear as KTEB publishes them — so a sitemap
 * frozen at build time would keep advertising days that have passed and never
 * mention the ones that arrived.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { today, days } = await coveredDutyDays();

  const home = routing.locales.map((locale) => ({
    url: `${SITE_URL}/${locale}`,
    // The roster changes every day, so the page is never stale for long.
    changeFrequency: "daily" as const,
    priority: locale === routing.defaultLocale ? 1 : 0.8,
    alternates: {
      languages: Object.fromEntries(routing.locales.map((l) => [l, `${SITE_URL}/${l}`])),
    },
  }));

  const dated = days
    .filter((d) => d !== today)
    .flatMap((date) =>
      routing.locales.map((locale) => ({
        url: `${SITE_URL}/${locale}?date=${date}`,
        // A published day is settled: it can still be revised, but not on the
        // homepage's daily rhythm.
        changeFrequency: "weekly" as const,
        // Below the homepage, which is what almost everyone actually wants.
        priority: locale === routing.defaultLocale ? 0.6 : 0.5,
        alternates: {
          languages: Object.fromEntries(
            routing.locales.map((l) => [l, `${SITE_URL}/${l}?date=${date}`])
          ),
        },
      }))
    );

  return [...home, ...dated];
}
