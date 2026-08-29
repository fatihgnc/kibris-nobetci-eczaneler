import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import BreadcrumbJsonLd from "@/components/BreadcrumbJsonLd";
import SiteHeader from "@/components/SiteHeader";
import { getPathname, Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { navLabels } from "@/lib/nav";
import { listIndexablePharmacies } from "@/lib/pharmacies";
import { REGION_ORDER, REGION_SLUG, regionDisplay } from "@/lib/regions";
import { pharmacySlug } from "@/lib/slug";

type Params = Promise<{ locale: string }>;

/**
 * The directory: every pharmacy, grouped by region.
 *
 * Two jobs. For a reader it is the answer to "where is the list of pharmacies",
 * which the roster pages deliberately do not answer — they are about tonight.
 * For a crawler it is the shortest path to four hundred pages that were
 * otherwise reachable only from the foot of a region page's scrolling list;
 * pages nothing links to are pages Google treats as unimportant, however
 * faithfully the sitemap names them.
 */
export const revalidate = 3600;

const path = (locale: string) => getPathname({ locale: locale as "tr" | "en", href: "/pharmacies" });

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "directory" });
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

export default async function DirectoryPage({ params }: { params: Params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [pharmacies, t, app, labels] = await Promise.all([
    listIndexablePharmacies(),
    getTranslations({ locale, namespace: "directory" }),
    getTranslations({ locale, namespace: "app" }),
    navLabels(locale),
  ]);

  // REGION_ORDER rather than whatever order the query returned, so the page
  // reads the same way as the region filter everywhere else in the app.
  const grouped = REGION_ORDER.map((code) => ({
    code,
    name: regionDisplay(code, locale),
    items: pharmacies.filter((p) => p.region === code),
  })).filter((g) => g.items.length > 0);

  return (
    <>
      <BreadcrumbJsonLd
        trail={[
          { name: labels.home, path: getPathname({ locale: locale as "tr" | "en", href: "/" }) },
          { name: labels.pharmacies, path: path(locale) },
        ]}
      />
      <SiteHeader brand={app("name")} labels={labels} current="/pharmacies" />
      <main className="doc">
        <article className="prose">
          <h1>{t("h1")}</h1>
          <p className="lede">{t("lead", { count: pharmacies.length })}</p>

          {/* <details>, not a scripted accordion. Four hundred rows open at
              once is unreadable, but this page exists to be the short path from
              the site's front door to four hundred pharmacy pages — and a
              widget that renders its contents only after a click would hand a
              crawler an empty page. Collapsed <details> keeps every link in the
              HTML; it is only the browser that folds it away. */}
          {grouped.map((g) => (
            <details key={g.code} className="regiongroup">
              <summary>
                <h2>
                  {g.name}{" "}
                  <span className="note">· {t("countInRegion", { count: g.items.length })}</span>
                </h2>
              </summary>
              <p>
                <Link
                  href={{
                    pathname: "/pharmacies-on-duty/[region]",
                    params: { region: REGION_SLUG[g.code] },
                  }}
                >
                  {t("regionLink", { region: g.name })}
                </Link>
              </p>
              <ul className="dirlist">
                {g.items.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={{
                        pathname: "/pharmacy/[slug]",
                        params: { slug: pharmacySlug(p) },
                        query: { from: "directory" },
                      }}
                    >
                      {p.name}
                    </Link>
                    {p.address && <span>{p.address}</span>}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </article>
      </main>
    </>
  );
}
