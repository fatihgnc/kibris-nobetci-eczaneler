// FAQPage structured data.
//
// Every question and answer here is also printed on the page. That is not
// politeness, it is the rule: Google drops — and can penalise — an FAQPage
// whose answers the reader cannot see, so the two are built from one list.
export interface FaqEntry {
  q: string;
  a: string;
}

export default function FaqJsonLd({ entries }: { entries: FaqEntry[] }) {
  if (entries.length === 0) return null;
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entries.map((e) => ({
      "@type": "Question",
      name: e.q,
      acceptedAnswer: { "@type": "Answer", text: e.a },
    })),
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\u003c") }}
    />
  );
}
