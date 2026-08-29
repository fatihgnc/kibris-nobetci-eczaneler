import type { MetadataRoute } from "next";
import { getPathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { coveredDutyDays, lastDutySyncAt } from "@/lib/duty-days";
import { listIndexablePharmacies } from "@/lib/pharmacies";
import { REGION_ORDER, REGION_SLUG } from "@/lib/regions";
import { SITE_URL } from "@/lib/site";
import { pharmacySlug } from "@/lib/slug";

/**
 * Rebuilt hourly. The published horizon slides — a day drops off the front as
 * it becomes today, and new ones appear as KTEB publishes them — so a sitemap
 * frozen at build time would keep advertising days that have passed and never
 * mention the ones that arrived.
 */
export const revalidate = 3600;

type Locale = (typeof routing.locales)[number];
type Entry = MetadataRoute.Sitemap[number];

/**
 * One URL per locale, with each locale listed as the other's alternate.
 *
 * `lastmod` is the only freshness field Google actually reads — it ignores
 * `changefreq` and `priority` — so it is the one to get right, and the one to
 * leave out entirely rather than invent when there is nothing to claim.
 */
function localised(
  path: (locale: Locale) => string,
  opts: { priority: number; changeFrequency: Entry["changeFrequency"]; lastModified?: string | null }
): Entry[] {
  const languages = Object.fromEntries(routing.locales.map((l) => [l, `${SITE_URL}${path(l)}`]));
  return routing.locales.map((locale) => ({
    url: `${SITE_URL}${path(locale)}`,
    changeFrequency: opts.changeFrequency,
    // The Turkish side is the default locale and carries most of the traffic.
    priority: locale === routing.defaultLocale ? opts.priority : opts.priority - 0.1,
    ...(opts.lastModified ? { lastModified: new Date(opts.lastModified) } : {}),
    alternates: { languages },
  }));
}

/**
 * The homepages, every published day ahead, every region, and every pharmacy
 * with a page worth indexing.
 *
 * Region and pharmacy URLs are built without touching the duty-day query on
 * purpose. `coveredDutyDays` degrades to `[today]` when the database blips, and
 * with everything hanging off one query a single bad moment used to shrink the
 * whole sitemap to two URLs for an hour. Now only the dated section can thin
 * out; the rest of the site stays advertised.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [{ today, days }, pharmacies, syncedAt] = await Promise.all([
    coveredDutyDays(),
    listIndexablePharmacies(),
    lastDutySyncAt(),
  ]);

  const home = localised((l) => `/${l}`, {
    priority: 1,
    changeFrequency: "daily",
    lastModified: syncedAt,
  });

  // Today is deliberately absent: it is served at the bare `/tr`, and listing
  // `?date=<today>` beside it would offer the same roster at two addresses.
  const dated = days
    .filter((d) => d !== today)
    .flatMap((date) =>
      localised((l) => `/${l}?date=${date}`, {
        // A published day is settled: it can still be revised, but not on the
        // homepage's daily rhythm.
        priority: 0.6,
        changeFrequency: "weekly",
        lastModified: syncedAt,
      })
    );

  const regions = REGION_ORDER.flatMap((code) =>
    localised(
      (l) =>
        getPathname({
          locale: l,
          href: { pathname: "/pharmacies-on-duty/[region]", params: { region: REGION_SLUG[code] } },
        }),
      { priority: 0.8, changeFrequency: "daily", lastModified: syncedAt }
    )
  );

  const detail = pharmacies.flatMap((p) =>
    localised(
      (l) =>
        getPathname({
          locale: l,
          href: { pathname: "/pharmacy/[slug]", params: { slug: pharmacySlug(p) } },
        }),
      // A pharmacy's own page changes when the source does, or when a new duty
      // date is published for it — neither of which follows a weekly rhythm.
      { priority: 0.5, changeFrequency: "monthly", lastModified: p.updatedAt }
    )
  );

  // Rarely touched, and that is the point of listing them: they are what a
  // crawler reads to decide there is a publisher behind the roster.
  const docs = (["/about", "/privacy"] as const).flatMap((pathname) =>
    localised((l) => getPathname({ locale: l, href: pathname }), {
      priority: 0.3,
      changeFrequency: "yearly",
    })
  );

  // The directory sits above the doc pages and below the regions: it is the
  // page that makes four hundred pharmacy pages reachable in one hop.
  const directory = localised((l) => getPathname({ locale: l, href: "/pharmacies" }), {
    priority: 0.7,
    changeFrequency: "weekly",
    lastModified: syncedAt,
  });

  return [...home, ...regions, ...directory, ...dated, ...detail, ...docs];
}
