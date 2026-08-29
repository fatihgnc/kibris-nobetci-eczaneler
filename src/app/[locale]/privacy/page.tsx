import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import DocPage from "@/components/DocPage";
import { navLabels } from "@/lib/nav";
import { getPathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

type Params = Promise<{ locale: string }>;

const path = (locale: string) =>
  getPathname({ locale: locale as "tr" | "en", href: "/privacy" });

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "privacy" });
  return {
    title: t("title"),
    description: t("description"),
    alternates: {
      canonical: path(locale),
      languages: {
        ...Object.fromEntries(routing.locales.map((l) => [l, path(l)])),
        "x-default": path(routing.defaultLocale),
      },
    },
    openGraph: { url: path(locale), title: t("title"), description: t("description") },
  };
}

export default async function Page({ params }: { params: Params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "privacy" });
  const app = await getTranslations({ locale, namespace: "app" });

  return (
    <DocPage
      h1={t("h1")}
      lead={t("p1")}
      sections={[
    { heading: t("locTitle"), body: t("locP") },
    { heading: t("cookieTitle"), body: t("cookieP") },
    { heading: t("analyticsTitle"), body: t("analyticsP") },
    { heading: t("offlineTitle"), body: t("offlineP") },
    { heading: t("thirdTitle"), body: t("thirdP") },
      ]}
      brand={app("name")}
      navLabels={await navLabels(locale)}
      current="/privacy"
    />
  );
}
