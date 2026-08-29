import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import DocPage from "@/components/DocPage";
import { navLabels } from "@/lib/nav";
import { getPathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

type Params = Promise<{ locale: string }>;

const path = (locale: string) =>
  getPathname({ locale: locale as "tr" | "en", href: "/about" });

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "about" });
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
  const t = await getTranslations({ locale, namespace: "about" });
  const app = await getTranslations({ locale, namespace: "app" });

  return (
    <DocPage
      h1={t("h1")}
      lead={t("p1")}
      sections={[
    { heading: t("sourceTitle"), body: t("sourceP") },
    { heading: t("freshTitle"), body: t("freshP") },
    { heading: t("limitsTitle"), body: t("limitsP") },
    { heading: t("openTitle"), body: t("openP") },
      ]}
      brand={app("name")}
      navLabels={await navLabels(locale)}
      current="/about"
    />
  );
}
