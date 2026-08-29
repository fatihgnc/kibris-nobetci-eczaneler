// Shown for an unknown region slug, a pharmacy id that is not in the directory,
// or any address under /{locale} that does not resolve.
//
// A not-found render gets no `params`, so the locale has to be read from the
// request rather than the route — without it next-intl has nothing to resolve
// messages against and Next quietly falls back to its own bare 404.
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function LocaleNotFound() {
  const locale = await getLocale();
  const t = await getTranslations({ locale });
  return (
    <main className="doc">
      <article className="prose">
        <h1>{t("errors.notFoundTitle")}</h1>
        <p className="lede">{t("errors.notFoundBody")}</p>
        <ul className="regionlinks">
          <li>
            <Link href="/">{t("nav.home")}</Link>
          </li>
          <li>
            <Link href="/pharmacies">{t("nav.pharmacies")}</Link>
          </li>
        </ul>
      </article>
    </main>
  );
}
