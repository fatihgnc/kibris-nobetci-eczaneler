// A plain document page: a header, a heading, a lead, and titled sections.
//
// The About and Privacy pages exist because a health listing that names no
// publisher and explains no data handling is asking to be treated as one more
// scraped directory. They are documents rather than app screens, so they opt
// out of the fixed full-viewport shell and simply scroll.
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import type { AppPathname } from "@/i18n/routing";
import type { NavLabels } from "@/lib/nav";

export interface DocSection {
  heading: string;
  body: string;
}

export default function DocPage({
  h1,
  lead,
  sections,
  brand,
  navLabels,
  current,
  children,
}: {
  h1: string;
  lead: string;
  sections: DocSection[];
  brand: string;
  navLabels: NavLabels;
  current: AppPathname;
  /** Rendered between the lead and the sections, for anything that is not a
      paragraph of prose — the contact page's address, for instance. */
  children?: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader brand={brand} labels={navLabels} current={current} />
      <main className="doc">
        <article className="prose">
          <h1>{h1}</h1>
          <p className="lede">{lead}</p>
          {children}
          {sections.map((s) => (
            <section key={s.heading}>
              <h2>{s.heading}</h2>
              <p>{s.body}</p>
            </section>
          ))}
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
