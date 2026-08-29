// Structured data for a day's roster.
//
// A crawler that does not run our JavaScript used to see an empty shell here;
// now it sees the rendered list, and this says the same thing again in the
// vocabulary Google reads for local results: names, addresses, phone numbers
// and the hours each pharmacy is on duty.
//
// The roster is handed in rather than queried. The page has already fetched it
// to render, and a component that went back to the database would double every
// request's query count to repeat what is on screen.
import { REGION_LABEL } from "@/lib/regions";
import type { OnDutyPharmacy } from "@/lib/types";

export default function DutyJsonLd({
  date,
  title,
  pharmacies,
}: {
  date: string;
  title: string;
  pharmacies: OnDutyPharmacy[];
}) {
  if (pharmacies.length === 0) return null;

  const data = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: title,
    numberOfItems: pharmacies.length,
    itemListElement: pharmacies.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "Pharmacy",
        name: p.name,
        ...(p.address || p.region
          ? {
              address: {
                "@type": "PostalAddress",
                ...(p.address ? { streetAddress: p.address } : {}),
                ...(p.region ? { addressRegion: REGION_LABEL[p.region] } : {}),
                addressCountry: "CY",
              },
            }
          : {}),
        ...(p.phone ? { telephone: p.phone } : {}),
        ...(p.lat !== null && p.lng !== null
          ? { geo: { "@type": "GeoCoordinates", latitude: p.lat, longitude: p.lng } }
          : {}),
        ...(p.opensAt && p.closesAt
          ? {
              openingHoursSpecification: [
                {
                  "@type": "OpeningHoursSpecification",
                  opens: p.opensAt,
                  // A shift running to midnight is stored as 00:00, which as a
                  // closing time would read as "shuts the moment it opens".
                  closes: p.closesAt === "00:00" ? "23:59" : p.closesAt,
                  validFrom: date,
                  validThrough: date,
                },
              ],
            }
          : {}),
      },
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
