// The written half of a region page (server component).
//
// Eight regions times two languages is sixteen pages showing the same component
// over a filtered list. What keeps them from reading as sixteen copies of one
// page — to a reader and to a crawler alike — is this: the region's own
// paragraph, its own questions, and its own directory of pharmacies, which is
// also the only path by which the pharmacy pages get crawled at all.
import { Link } from "@/i18n/navigation";
import type { DirectoryPharmacy } from "@/lib/pharmacies";
import { REGION_ORDER, REGION_SLUG, regionDisplay, type RegionCode } from "@/lib/regions";
import { pharmacySlug } from "@/lib/slug";
import type { FaqEntry } from "./FaqJsonLd";

export default function RegionProse({
  region,
  locale,
  intro,
  faqTitle,
  faq,
  allTitle,
  allNote,
  otherRegionsTitle,
  pharmacies,
}: {
  region: RegionCode;
  locale: string;
  intro: string;
  faqTitle: string;
  faq: FaqEntry[];
  allTitle: string;
  allNote: string;
  otherRegionsTitle: string;
  pharmacies: DirectoryPharmacy[];
}) {
  return (
    <section className="prose">
      <p className="lede">{intro}</p>

      <h2>{faqTitle}</h2>
      {/* Printed, not just declared in JSON-LD — the structured data is built
          from this same list, and an answer only a crawler can see is the kind
          of thing that gets a page demoted rather than promoted. */}
      <dl className="faq">
        {faq.map((e) => (
          <div key={e.q}>
            <dt>{e.q}</dt>
            <dd>{e.a}</dd>
          </div>
        ))}
      </dl>

      {pharmacies.length > 0 && (
        <>
          <h2>{allTitle}</h2>
          <p className="note">{allNote}</p>
          <ul className="dirlist">
            {pharmacies.map((p) => (
              <li key={p.id}>
                <Link href={{ pathname: "/pharmacy/[slug]", params: { slug: pharmacySlug(p) } }}>
                  {p.name}
                </Link>
                {p.address && <span>{p.address}</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      <h2>{otherRegionsTitle}</h2>
      <ul className="regionlinks">
        {REGION_ORDER.filter((r) => r !== region).map((r) => (
          <li key={r}>
            <Link
              href={{ pathname: "/pharmacies-on-duty/[region]", params: { region: REGION_SLUG[r] } }}
            >
              {regionDisplay(r, locale)}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
