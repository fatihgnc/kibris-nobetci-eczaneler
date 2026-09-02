import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import AppShell from "@/components/AppShell";
import DutyJsonLd from "@/components/DutyJsonLd";
import BreadcrumbJsonLd from "@/components/BreadcrumbJsonLd";
import { getPathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { addDutyDays, dutyDateFor } from "@/lib/duty-date";
import { MAX_LOOKAHEAD_DAYS } from "@/lib/duty-days";
import { formatDutyDate } from "@/lib/format";
import { navLabels } from "@/lib/nav";
import { REGION_ORDER, REGION_SLUG, regionDisplay, regionFromSlug } from "@/lib/regions";
import { loadRosterPage } from "@/lib/roster-page";

type Params = Promise<{ locale: string; region: string }>;
type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

/**
 * One page per region, prerendered as far as the roster allows.
 *
 * "girne nöbetçi eczane" is the search people actually make — the island-wide
 * phrasing is a fraction of it — and until now none of the eight regions had an
 * address of its own to answer with: the filter was client state with a
 * `?region=` written after the fact, canonicalised back to the homepage.
 */
export function generateStaticParams() {
  return REGION_ORDER.map((code) => ({ region: REGION_SLUG[code] }));
}

/** The `?date=` this request is for, or null when there is no usable one. */
function requestedDate(raw: string | string[] | undefined): string | null {
  const date = Array.isArray(raw) ? raw[0] : raw;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const today = dutyDateFor();
  if (date < today || date > addDutyDays(today, MAX_LOOKAHEAD_DAYS)) return null;
  return date;
}

const href = (slug: string) =>
  ({ pathname: "/pharmacies-on-duty/[region]", params: { region: slug } }) as const;

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}): Promise<Metadata> {
  const { locale, region: slug } = await params;
  const region = regionFromSlug(slug);
  if (!region) return {};

  const requested = requestedDate((await searchParams).date);
  const date = requested ?? dutyDateFor();
  const t = await getTranslations({ locale, namespace: "region" });
  const values = { region: regionDisplay(region, locale), date: formatDutyDate(date, locale) };

  // A dated view of a region is the same page showing another day, so it is
  // canonicalised to the region itself rather than being published as a URL of
  // its own. Sixteen region pages times a fortnight of days would be a few
  // hundred near-identical addresses competing with each other.
  const canonical = (l: string) => getPathname({ locale: l as "tr" | "en", href: href(slug) });

  return {
    title: t("title", values),
    description: t("description", values),
    alternates: {
      canonical: canonical(locale),
      languages: {
        ...Object.fromEntries(routing.locales.map((l) => [l, canonical(l)])),
        "x-default": canonical(routing.defaultLocale),
      },
    },
    openGraph: {
      url: canonical(locale),
      title: t("ogTitle", values),
      description: t("ogDescription", values),
    },
    twitter: {
      title: t("ogTitle", values),
      description: t("ogDescription", values),
    },
  };
}

export default async function RegionPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { locale, region: slug } = await params;
  const region = regionFromSlug(slug);
  if (!region) notFound();
  setRequestLocale(locale);

  const requested = requestedDate((await searchParams).date);
  const { data, days, nowMinutes, date } = await loadRosterPage(requested);

  const [t, nav] = await Promise.all([
    getTranslations({ locale, namespace: "region" }),
    navLabels(locale),
  ]);
  const values = { region: regionDisplay(region, locale), date: formatDutyDate(date, locale) };
  const loc = locale as "tr" | "en";

  // The roster comes back island-wide so the map can still draw the pharmacies
  // outside the filter, dimmed. The structured data must not: it describes this
  // page, and this page is about one region.
  const inRegion = data?.pharmacies.filter((p) => p.region === region) ?? [];

  return (
    <>
      {/* listName, not title: the <title> tag dropped its date because Google
          caches it and would go on showing a stale one for days, but this names
          a specific day's roster and sits beside validFrom/validThrough saying
          the same date. */}
      {inRegion.length > 0 && (
        <DutyJsonLd date={date} title={t("listName", values)} pharmacies={inRegion} />
      )}
      <BreadcrumbJsonLd
        trail={[
          { name: nav.home, path: getPathname({ locale: loc, href: "/" }) },
          { name: values.region, path: getPathname({ locale: loc, href: href(slug) }) },
        ]}
      />
      <Suspense>
        <AppShell
          initialData={data}
          initialDays={days}
          initialNowMinutes={nowMinutes}
          initialRegion={region}
        />
      </Suspense>
    </>
  );
}
