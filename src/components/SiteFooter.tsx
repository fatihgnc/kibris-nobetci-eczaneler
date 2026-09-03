// One line at the foot of the document pages — directory, pharmacy, widget,
// About, Privacy, Contact, and the 404/error screens.
//
// The app screen already ends in its own `.foot` block inside the sheet and
// gets none of this. Everything else simply stopped: the article ran out and
// the page ended on whitespace, with the publisher named nowhere.
//
// `useTranslations` rather than props: this renders in server components
// (DocPage and friends) and in one client component (the error boundary), and
// the hook is the only form that works in both.
import { useTranslations } from "next-intl";

export default function SiteFooter() {
  const t = useTranslations();
  // Baked at build time on the static pages, which is what a deploy refreshes.
  const year = new Date().getFullYear();
  return (
    <footer className="sitefoot">
      <div className="sitefootin">
        <span>
          © {year} {t("app.name")}
        </span>
        {/* Untranslated on purpose: it is a name with two words in front of
            it, and "Fatih Genç tarafından yapıldı" is a sentence where a
            byline belongs. */}
        <span>
          Built by{" "}
          <a href="https://fatihgenc.dev" target="_blank" rel="noopener noreferrer">
            Fatih Genç
          </a>
        </span>
      </div>
    </footer>
  );
}
