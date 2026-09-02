import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import BreadcrumbJsonLd from "@/components/BreadcrumbJsonLd";
import SiteHeader from "@/components/SiteHeader";
import WidgetBuilder from "@/components/WidgetBuilder";
import WidgetUsers, { type WidgetUser } from "@/components/WidgetUsers";
import { getPathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { navLabels } from "@/lib/nav";
import { REGION_ORDER, REGION_SLUG, regionDisplay } from "@/lib/regions";
import { SITE_URL } from "@/lib/site";

/**
 * The page an outreach email links to.
 *
 * "Would you like a widget" is a conversation; "pick your region and paste
 * this" is a decision someone can make in a minute, and the difference is most
 * of the reply rate. It is also worth indexing on its own — a free, no-tracking
 * embed for a health listing is the kind of page other sites write about.
 */
type Params = Promise<{ locale: string }>;

const path = (locale: string) => getPathname({ locale: locale as "tr" | "en", href: "/widget" });

/**
 * The sites carrying the widget. Empty until the first one does; the strip
 * renders nothing while it is. Add `{ name, href, logo: "/widget/users/x.svg" }`.
 */
const USERS: WidgetUser[] = [];

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "widget" });
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

export default async function WidgetPage({ params }: { params: Params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, app, nav] = await Promise.all([
    getTranslations({ locale, namespace: "widget" }),
    getTranslations({ locale, namespace: "app" }),
    navLabels(locale),
  ]);

  return (
    <>
      <BreadcrumbJsonLd
        trail={[
          { name: nav.home, path: getPathname({ locale: locale as "tr" | "en", href: "/" }) },
          { name: t("h1"), path: path(locale) },
        ]}
      />
      <SiteHeader brand={app("name")} labels={nav} current="/widget" />
      <main className="doc">
        <article className="prose">
          <h1>{t("h1")}</h1>
          <p className="lede">{t("lead")}</p>

          <WidgetBuilder
            origin={SITE_URL}
            regions={REGION_ORDER.map((code) => ({
              slug: REGION_SLUG[code],
              tr: regionDisplay(code, "tr"),
              en: regionDisplay(code, "en"),
            }))}
            labels={{
              pickLabel: t("pickLabel"),
              allRegions: t("allRegions"),
              langLabel: t("langLabel"),
              langTr: t("langTr"),
              langEn: t("langEn"),
              codeTitle: t("codeTitle"),
              copy: t("copy"),
              copied: t("copied"),
              previewTitle: t("previewTitle"),
              themeLabel: t("themeLabel"),
              themeLight: t("themeLight"),
              themeDark: t("themeDark"),
              accentLabel: t("accentLabel"),
              accentReset: t("accentReset"),
              lazyLabel: t("lazyLabel"),
              lazyHint: t("lazyHint"),
              viewDesktop: t("viewDesktop"),
              viewMobile: t("viewMobile"),
              posterAlt: t("posterAlt"),
              noscript: t("noscript"),
              heightTitle: t("heightTitle"),
              heightBody: t("heightBody"),
            }}
          />

          <section>
            <h2>{t("creditTitle")}</h2>
            <p>{t("creditBody")}</p>
          </section>
          <section>
            <h2>{t("perfTitle")}</h2>
            <p>{t("perfBody1")}</p>
            <p>{t("perfBody2")}</p>
          </section>
          <section>
            <h2>{t("outageTitle")}</h2>
            <p>{t("outageBody1")}</p>
            <p>{t("outageBody2")}</p>
          </section>
          <section>
            <h2>{t("kktcTitle")}</h2>
            <ul className="wterms">
              <li>{t("kktcOncall")}</li>
              <li>{t("kktcSeason")}</li>
              <li>{t("kktcSubregion")}</li>
            </ul>
          </section>
          <section>
            <h2>{t("termsTitle")}</h2>
            <ul className="wterms">
              <li>{t("term1")}</li>
              <li>{t("term2")}</li>
              <li>{t("term3")}</li>
              <li>{t("term4")}</li>
            </ul>
          </section>
          <WidgetUsers title={t("usersTitle")} users={USERS} />
        </article>
      </main>
    </>
  );
}
