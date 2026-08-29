// One pharmacy, described for machines.
//
// Unlike the roster's ItemList this is not about a day — it is the permanent
// record for a place: what it is called, where it is, and how to ring it.
import { REGION_LABEL } from "@/lib/regions";
import type { DirectoryPharmacy } from "@/lib/pharmacies";

export default function PharmacyJsonLd({
  pharmacy,
  url,
}: {
  pharmacy: DirectoryPharmacy;
  url: string;
}) {
  const p = pharmacy;
  const data = {
    "@context": "https://schema.org",
    "@type": "Pharmacy",
    "@id": url,
    url,
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
