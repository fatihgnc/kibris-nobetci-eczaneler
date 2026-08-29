import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import AppShell from "@/components/AppShell";
import DutyJsonLd from "@/components/DutyJsonLd";
import { routing } from "@/i18n/routing";
import { addDutyDays, dutyDateFor } from "@/lib/duty-date";
import { MAX_LOOKAHEAD_DAYS } from "@/lib/duty-days";
import { formatDutyDate } from "@/lib/format";

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
  const path = (l: string) => `/${l}?date=${date}`;
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

  // Structured data for the days the sitemap advertises. Today is excluded for
  // the same reason it has no canonical of its own: it is the bare URL, and
  // that one is prerendered — see the note in DutyJsonLd.
  const date = requestedDate((await searchParams).date);
  const dated = date && date !== dutyDateFor() ? date : null;
  const t = dated ? await getTranslations({ locale, namespace: "app" }) : null;

  return (
    <>
      {dated && t && (
        <DutyJsonLd date={dated} title={t("titleOnDate", { date: formatDutyDate(dated, locale) })} />
      )}
      <Suspense>
        <AppShell />
      </Suspense>
    </>
  );
}
