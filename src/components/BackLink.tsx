"use client";
// The back control on a detail page, pointed at wherever you came from.
//
// A pharmacy sits under two lists — its region's roster and the directory — and
// which one you should be sent back to is not a property of the pharmacy. The
// linking page says so with `?from`, and this reads it.
//
// It reads it from `location.search` in an effect rather than through
// `useSearchParams`. That hook is a Next dynamic API: touching it anywhere in
// the tree opts the whole route out of caching, which for these four hundred
// pages meant a database round trip on every view to decide the wording of one
// link. Reading the URL after mount costs a frame and keeps the page cached.
import Link from "next/link";
import { useEffect, useState } from "react";

export default function BackLink({
  href,
  label,
  from,
}: {
  /** Where back goes by default — and what the server renders, so a crawler
      follows the pharmacy → region edge whatever the visitor's URL says. */
  href: string;
  label: string;
  /** The alternative, chosen when `?from` names it. */
  from?: { key: string; href: string; label: string };
}) {
  const [alt, setAlt] = useState(false);

  useEffect(() => {
    if (!from) return;
    setAlt(new URLSearchParams(window.location.search).get("from") === from.key);
  }, [from]);

  const target = alt && from ? from : { href, label };
  return (
    <Link className="docback" href={target.href}>
      {target.label}
    </Link>
  );
}
