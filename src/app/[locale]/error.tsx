"use client";
// Anything that throws while rendering a page under [locale] lands here.
//
// There was no boundary at all before, so a single failed render replaced the
// whole app with Next's default error screen — no way back, no explanation, and
// on a site someone opens at 3am looking for an open pharmacy, no hint that the
// roster itself is fine. Client component by necessity: an error boundary has
// to be one.
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function LocaleError({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations();
  return (
    <main className="doc">
      <article className="prose">
        <h1>{t("errors.errorTitle")}</h1>
        <p className="lede">{t("errors.errorBody")}</p>
        <ul className="regionlinks">
          <li>
            <button className="chip" type="button" onClick={reset}>
              {t("errors.retry")}
            </button>
          </li>
          <li>
            <Link href="/">{t("nav.home")}</Link>
          </li>
        </ul>
      </article>
    </main>
  );
}
