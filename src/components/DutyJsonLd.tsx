// Structured data for a dated roster page (server component).
//
// A crawler that does not run our JavaScript sees an empty shell, so the day's
// pharmacies reach it here instead: names, addresses, phone numbers and the
// hours they are on duty, in the vocabulary Google reads for local results.
//
// Only dated pages get this. The bare /{locale} is prerendered at build time,
// so structured data baked into it would name whichever pharmacies happened to
// be on duty the day of the deploy and keep saying so until the next one — the
// staleness this whole app exists to prevent, published as a machine claim.
import { REGION_LABEL, toRegionCode } from "@/lib/regions";
import { supabaseAnon } from "@/lib/supabase";

/** The subset of on_duty_nearby this needs. */
type Row = {
  pharmacy_id: number;
  name: string;
  region: string | null;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  opens_at: string | null;
  closes_at: string | null;
};

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

export default async function DutyJsonLd({ date, title }: { date: string; title: string }) {
  let rows: Row[] = [];
  try {
    const { data, error } = await supabaseAnon().rpc("on_duty_nearby", {
      p_date: date,
      p_lat: null,
      p_lng: null,
    });
    if (error) throw new Error(error.message);
    rows = (data ?? []) as Row[];
  } catch (err) {
    // Structured data is a bonus; the page must not fail over it.
    console.error(`duty JSON-LD query failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
  if (rows.length === 0) return null;

  const data = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: title,
    numberOfItems: rows.length,
    itemListElement: rows.map((r, i) => {
      const opens = hhmm(r.opens_at);
      const closes = hhmm(r.closes_at);
      const region = toRegionCode(r.region);
      return {
        "@type": "ListItem",
        position: i + 1,
        item: {
          "@type": "Pharmacy",
          name: r.name,
          ...(r.address || region
            ? {
                address: {
                  "@type": "PostalAddress",
                  ...(r.address ? { streetAddress: r.address } : {}),
                  ...(region ? { addressRegion: REGION_LABEL[region] } : {}),
                  addressCountry: "CY",
                },
              }
            : {}),
          ...(r.phone ? { telephone: r.phone } : {}),
          ...(r.lat !== null && r.lng !== null
            ? { geo: { "@type": "GeoCoordinates", latitude: r.lat, longitude: r.lng } }
            : {}),
          ...(opens && closes
            ? {
                openingHoursSpecification: [
                  {
                    "@type": "OpeningHoursSpecification",
                    opens,
                    // A shift running to midnight is stored as 00:00, which as
                    // a closing time would read as "shuts the moment it opens".
                    closes: closes === "00:00" ? "23:59" : closes,
                    validFrom: date,
                    validThrough: date,
                  },
                ],
              }
            : {}),
        },
      };
    }),
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
