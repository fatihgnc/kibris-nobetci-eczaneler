import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import DocPage from "@/components/DocPage";
import { getPathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { navLabels } from "@/lib/nav";

type Params = Promise<{ locale: string }>;

/**
 * Published in plain text, deliberately.
 *
 * An obfuscated address defeats a scraper and the reader in equal measure, and
 * a health listing that gives no way to report a wrong phone number is worse
 * off for the spam it avoided.
 */
const EMAIL = "fathgnc.dev@gmail.com";

const path = (locale: string) => getPathname({ locale: locale as "tr" | "en", href: "/contact" });

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "contact" });
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
  const t = await getTranslations({ locale, namespace: "contact" });
  const app = await getTranslations({ locale, namespace: "app" });

  return (
    <DocPage
      h1={t("h1")}
      lead={t("p1")}
      sections={[
        { heading: t("dutyTitle"), body: t("dutyP") },
        { heading: t("pharmacyTitle"), body: t("pharmacyP") },
        { heading: t("bugTitle"), body: t("bugP") },
      ]}
      brand={app("name")}
      navLabels={await navLabels(locale)}
      current="/contact"
    >
      <dl className="pharmafacts">
        <div>
          <dt>{t("emailLabel")}</dt>
          <dd>
            <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
          </dd>
        </div>
      </dl>
    </DocPage>
  );
}
