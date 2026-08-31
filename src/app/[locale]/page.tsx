import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { permanentRedirect } from "next/navigation";
import { Suspense } from "react";
import AppShell from "@/components/AppShell";
import DutyJsonLd from "@/components/DutyJsonLd";
import { getPathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { addDutyDays, dutyDateFor } from "@/lib/duty-date";
import { MAX_LOOKAHEAD_DAYS } from "@/lib/duty-days";
import { formatDutyDate } from "@/lib/format";
import { isRegionCode, REGION_SLUG } from "@/lib/regions";
import { loadRosterPage } from "@/lib/roster-page";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

/** The `?date=` this request is for, or null when there is no usable one. */
function requestedDate(raw: string | string[] | undefined): string | null {
  const date = Array.isArray(raw) ? raw[0] : raw;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const today = dutyDateFor();
  // Bounded rather than checked against the roster: this runs on every render
  // of the page, and a database round trip to decide a <title> is not worth
  // it. The window is the furthest the roster is ever published.
  if (date < today || date > addDutyDays(today, MAX_LOOKAHEAD_DAYS)) return null;
  return date;
}

/**
 * Date-aware metadata, so a day in the sitemap has something of its own to
 * rank with.
 *
 * The layout canonicalises every page to the bare `/{locale}`, which is right
 * for the app but would tell a crawler that `?date=…` is the same page — the
 * sitemap would then be listing URLs the site itself disowns. A day inside the
 * published window gets its own canonical, title and description; today keeps
 * the bare URL, since the two would otherwise be one roster at two addresses.
 * Anything else — a malformed date, one past the horizon — is left
 * canonicalised home and marked noindex, so guessed URLs cannot accumulate.
 */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: SearchParams;
}): Promise<Metadata> {
  const { locale } = await params;
  const date = requestedDate((await searchParams).date);
  const t = await getTranslations({ locale, namespace: "app" });

  if (!date) {
    const raw = (await searchParams).date;
    return raw ? { robots: { index: false, follow: true } } : {};
  }
  if (date === dutyDateFor()) return {};

  const dateText = formatDutyDate(date, locale);
  const path = (l: string) =>
    getPathname({ locale: l as "tr" | "en", href: { pathname: "/", query: { date } } });
  return {
    title: t("titleOnDate", { date: dateText }),
    description: t("descriptionOnDate", { date: dateText }),
    alternates: {
      canonical: path(locale),
      languages: {
        ...Object.fromEntries(routing.locales.map((l) => [l, path(l)])),
        "x-default": path(routing.defaultLocale),
      },
    },
    openGraph: {
      url: path(locale),
      title: t("ogTitleOnDate", { date: dateText }),
      description: t("ogDescriptionOnDate", { date: dateText }),
    },
    twitter: {
      title: t("ogTitleOnDate", { date: dateText }),
      description: t("ogDescriptionOnDate", { date: dateText }),
    },
  };
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: SearchParams;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const sp = await searchParams;

  // The region used to be a query parameter written after the fact. It is a
  // path now, so anything still arriving on the old shape — a link pasted into
  // a group chat months ago, a page held in someone's service worker cache — is
  // sent on to the address that actually exists.
  const legacyRegion = Array.isArray(sp.region) ? sp.region[0] : sp.region;
  if (isRegionCode(legacyRegion)) {
    const date = requestedDate(sp.date);
    permanentRedirect(
      getPathname({
        locale: locale as "tr" | "en",
        href: {
          pathname: "/pharmacies-on-duty/[region]",
          params: { region: REGION_SLUG[legacyRegion] },
          ...(date ? { query: { date } } : {}),
        },
      })
    );
  }

  const requested = requestedDate(sp.date);
  const { data, days, nowMinutes, date } = await loadRosterPage(requested);
  const t = await getTranslations({ locale, namespace: "app" });

  return (
    <>
      {/* Hoisted into <head>. The placeholder <img> sits deep in the body,
          behind everything the parser reads first; this line hands its URL to
          the browser in the first kilobyte instead, which is worth most of a
          second of LCP on a throttled phone. */}
      <link rel="preload" as="image" href="/map-placeholder.webp" fetchPriority="high" />
      {/* Today included. This used to be withheld from the bare URL on the
          grounds that it was prerendered at build time and the roster baked
          into it would go stale — but the route reads searchParams, so it has
          in fact been rendering per request all along, and the day it names is
          always the day it is serving. */}
      {data && (
        <DutyJsonLd
          date={date}
          title={t("titleOnDate", { date: formatDutyDate(date, locale) })}
          pharmacies={data.pharmacies}
        />
      )}
      <Suspense>
        <AppShell initialData={data} initialDays={days} initialNowMinutes={nowMinutes} />
      </Suspense>
    </>
  );
}
