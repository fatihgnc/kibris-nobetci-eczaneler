// The header for the document pages — directory, pharmacy, About, Privacy.
//
// The app screen carries its own topbar and gets none of this. These pages had
// nothing but a link back home buried at the foot of the article, which left
// every one of them a dead end: you could arrive from a search result and have
// no way to reach anything else without editing the URL.
import { Link } from "@/i18n/navigation";
import type { AppPathname } from "@/i18n/routing";
import type { NavKey, NavLabels } from "@/lib/nav";

/** Only the pathnames that take no parameters, so each is a href on its own. */
type StaticPathname = Extract<AppPathname, "/" | "/pharmacies" | "/about" | "/privacy" | "/contact">;

const NAV: { href: StaticPathname; key: NavKey }[] = [
  { href: "/", key: "home" },
  { href: "/pharmacies", key: "pharmacies" },
  { href: "/about", key: "about" },
  { href: "/privacy", key: "privacy" },
  { href: "/contact", key: "contact" },
];

export default function SiteHeader({
  brand,
  labels,
  current,
}: {
  brand: string;
  labels: NavLabels;
  /** The page being viewed, so its own entry is marked rather than linked back to itself. */
  current?: AppPathname;
}) {
  return (
    <header className="dochead">
      {/* The bar runs the full width so its rule reads as a rule; the row
          inside it is held to the same column as the article below, or the
          brand and the nav end up pinned to opposite edges of a wide screen
          with the text they belong to sitting centred far beneath them. */}
      <div className="docheadin">
        <Link className="docbrand" href="/">
          {brand}
        </Link>
        <nav className="docnav">
          {NAV.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              aria-current={item.href === current ? "page" : undefined}
            >
              {labels[item.key]}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
