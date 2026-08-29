// Where a page sits in the site, said in the one structured-data vocabulary
// that actually changes how the result looks.
//
// Pharmacy and ItemList tell Google what the page is about; neither produces a
// visible enhancement. A breadcrumb does: the result line becomes
// "acikeczanevarmi.com › Girne › Erdoğan Özikiz Eczanesi" instead of a URL.
// It only became possible once the site had a real hierarchy to describe.
import { SITE_URL } from "@/lib/site";

export interface Crumb {
  name: string;
  /** Path with its locale prefix, as getPathname returns it. */
  path: string;
}

export default function BreadcrumbJsonLd({ trail }: { trail: Crumb[] }) {
  if (trail.length < 2) return null;

  const data = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name,
      item: `${SITE_URL}${crumb.path}`,
    })),
  };

  return (
    <script
      type="application/ld+json"
      // A pharmacy name is source data, and source data must never be able to
      // close this tag.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\u003c") }}
    />
  );
}
