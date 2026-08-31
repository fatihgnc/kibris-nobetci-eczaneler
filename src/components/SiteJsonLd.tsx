// Who this site is, said once per page.
//
// Constant, unlike the roster: it describes the publisher rather than the day,
// so it belongs in the layout and never needs a query. The KTEB attribution is
// the load-bearing part — a health listing whose source is machine-readable is
// a different kind of claim from one whose source is a line of small print.
import { getPathname } from "@/i18n/navigation";
import { SITE_URL } from "@/lib/site";

export default function SiteJsonLd({ locale, name }: { locale: string; name: string }) {
  const id = `${SITE_URL}/#site`;
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": id,
        url: `${SITE_URL}${getPathname({ locale: locale as "tr" | "en", href: "/" })}`,
        name,
        inLanguage: locale,
        publisher: { "@id": `${SITE_URL}/#publisher` },
      },
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#publisher`,
        name,
        url: SITE_URL,
        logo: `${SITE_URL}/icon-512.png`,
        areaServed: { "@type": "Country", name: "Cyprus" },
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\u003c") }}
    />
  );
}
