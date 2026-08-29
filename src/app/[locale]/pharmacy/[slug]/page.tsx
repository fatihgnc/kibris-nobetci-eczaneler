import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound, permanentRedirect } from "next/navigation";
import BackLink from "@/components/BackLink";
import PharmacyJsonLd from "@/components/PharmacyJsonLd";
import SiteHeader from "@/components/SiteHeader";
import { getPathname, Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { dutyDateFor } from "@/lib/duty-date";
import { directionsUrl, formatDutyDate, mapSearchUrl, telHref } from "@/lib/format";
import { navLabels } from "@/lib/nav";
import {
  type DirectoryPharmacy,
  getDutyHistory,
  getPharmacy,
  isIndexable,
  listIndexablePharmacies,
} from "@/lib/pharmacies";
import { REGION_SLUG, regionDisplay } from "@/lib/regions";
import { SITE_URL } from "@/lib/site";
import { pharmacyIdFromSlug, pharmacySlug } from "@/lib/slug";

type Params = Promise<{ locale: string; slug: string }>;

/**
 * Rebuilt hourly.
 *
 * Time-based revalidation is right here and wrong on the roster pages, and the
 * difference is worth stating: nothing on this page is derived from the clock.
 * The homepage prints "open" or "closing soon", which a cached copy would get
 * wrong within the hour; a pharmacy's address, phone number and duty calendar
 * change when the source changes and not otherwise.
 */
export const revalidate = 3600;

/**
 * Every pharmacy worth publishing, prerendered.
 *
 * Rendering these on demand was the obvious choice and the wrong one: a dynamic
 * segment with nothing prerendered is not written to the route cache at all, so
 * the revalidate above was ignored and every visit — every crawl of four hundred
 * long-tail pages — paid for two database queries. Naming the paths here is what
 * makes them cacheable, and the build pays the queries once instead.
 */
export async function generateStaticParams() {
  const pharmacies = await listIndexablePharmacies();
  return pharmacies.map((p) => ({ slug: pharmacySlug(p) }));
}

const href = (slug: string) => ({ pathname: "/pharmacy/[slug]", params: { slug } }) as const;

async function resolve(slug: string): Promise<DirectoryPharmacy | null> {
  const id = pharmacyIdFromSlug(slug);
  return id === null ? null : getPharmacy(id);
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, slug } = await params;
  const pharmacy = await resolve(slug);
  if (!pharmacy) return {};

  const t = await getTranslations({ locale, namespace: "pharmacy" });
  const canonicalSlug = pharmacySlug(pharmacy);
  const values = {
    name: pharmacy.name,
    region: pharmacy.region ? regionDisplay(pharmacy.region, locale) : "KKTC",
  };
  const path = (l: string) => getPathname({ locale: l as "tr" | "en", href: href(canonicalSlug) });
  const duty = await getDutyHistory(pharmacy.id);

  return {
    title: t("title", values),
    description: t("description", values),
    ...(isIndexable(pharmacy, duty) ? {} : { robots: { index: false, follow: true } }),
    alternates: {
      canonical: path(locale),
      languages: {
        ...Object.fromEntries(routing.locales.map((l) => [l, path(l)])),
        "x-default": path(routing.defaultLocale),
      },
    },
    openGraph: { url: path(locale), title: t("title", values), description: t("description", values) },
  };
}

export default async function PharmacyPage({ params }: { params: Params }) {
  const { locale, slug } = await params;
  const pharmacy = await resolve(slug);
  if (!pharmacy) notFound();
  setRequestLocale(locale);

  // The id is the only trusted half of the slug, so a link shared under a name
  // the source has since corrected still lands — and is then sent on to the
  // spelling this page is published under, rather than answering on both.
  const canonicalSlug = pharmacySlug(pharmacy);
  if (canonicalSlug !== slug) {
    permanentRedirect(getPathname({ locale: locale as "tr" | "en", href: href(canonicalSlug) }));
  }

  const [t, app, nav, duty] = await Promise.all([
    getTranslations({ locale, namespace: "pharmacy" }),
    getTranslations({ locale, namespace: "app" }),
    navLabels(locale),
    getDutyHistory(pharmacy.id),
  ]);
  const today = dutyDateFor();
  const regionName = pharmacy.region ? regionDisplay(pharmacy.region, locale) : null;
  const values = { name: pharmacy.name, region: regionName ?? "KKTC" };
  const loc = locale as "tr" | "en";
  const directoryHref = getPathname({ locale: loc, href: "/pharmacies" });
  // Where back goes when nothing says otherwise: the roster this pharmacy takes
  // its turns in, which is the more useful of the two lists to land on.
  const backHref = pharmacy.region
    ? getPathname({
        locale: loc,
        href: {
          pathname: "/pharmacies-on-duty/[region]",
          params: { region: REGION_SLUG[pharmacy.region] },
        },
      })
    : directoryHref;
  const backLabel = pharmacy.region ? t("backToRegion", values) : nav.pharmacies;
  const maps =
    pharmacy.lat !== null && pharmacy.lng !== null
      ? directionsUrl(pharmacy.lat, pharmacy.lng)
      : mapSearchUrl(pharmacy.name, pharmacy.address, regionName, "KKTC");

  return (
    <>
      <SiteHeader brand={app("name")} labels={nav} current="/pharmacy/[slug]" />
      <main className="doc">
        <PharmacyJsonLd
          pharmacy={pharmacy}
          url={`${SITE_URL}${getPathname({ locale: locale as "tr" | "en", href: href(canonicalSlug) })}`}
        />
        {/* A link rather than history.back(): most arrivals here come from a
            search result and have nothing to go back to, and this is also the
            edge that ties a pharmacy to its region for a crawler. The server
            renders the region link; the client swaps it for the directory when
            the URL says that is where the visitor came from. */}
        <BackLink
          href={backHref}
          label={backLabel}
          from={{ key: "directory", href: directoryHref, label: nav.pharmacies }}
        />
        <article className="prose">
          <h1>{pharmacy.name}</h1>

          <dl className="pharmafacts">
            {regionName && pharmacy.region && (
              <div>
                <dt>{t("regionLabel")}</dt>
                <dd>
                  <Link
                    href={{
                      pathname: "/pharmacies-on-duty/[region]",
                      params: { region: REGION_SLUG[pharmacy.region] },
                    }}
                  >
                    {regionName}
                  </Link>
                </dd>
              </div>
            )}
            {pharmacy.address && (
              <div>
                <dt>{t("addressLabel")}</dt>
                <dd>{pharmacy.address}</dd>
              </div>
            )}
            {pharmacy.phone && (
              <div>
                <dt>{t("phoneLabel")}</dt>
                <dd>
                  <a href={telHref(pharmacy.phone)}>{pharmacy.phone}</a>
                </dd>
              </div>
            )}
            {pharmacy.phoneAlt && (
              <div>
                <dt>{t("phoneAltLabel")}</dt>
                <dd>
                  <a href={telHref(pharmacy.phoneAlt)}>{pharmacy.phoneAlt}</a>
                </dd>
              </div>
            )}
          </dl>

          <p>
            <a href={maps} target="_blank" rel="noopener noreferrer">
              {pharmacy.lat !== null && pharmacy.lng !== null ? t("directions") : t("onMap")}
            </a>
          </p>

          <h2>{t("upcomingTitle")}</h2>
          {duty.upcoming.length > 0 ? (
            <>
              <p>{t("upcomingNote", values)}</p>
              <ul className="dutydates">
                {duty.upcoming.map((d) => (
                  <li key={d} className={d === today ? "next" : undefined}>
                    {formatDutyDate(d, locale)}
                    {d === today ? ` · ${t("todayBadge")}` : ""}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>{t("noUpcoming", values)}</p>
          )}

          {duty.past.length > 0 && (
            <>
              <h2>{t("pastTitle")}</h2>
              <ul className="dutydates">
                {duty.past.map((d) => (
                  <li key={d}>{formatDutyDate(d, locale)}</li>
                ))}
              </ul>
            </>
          )}

          <p className="note">{t("hoursNote")}</p>
        </article>
      </main>
    </>
  );
}
