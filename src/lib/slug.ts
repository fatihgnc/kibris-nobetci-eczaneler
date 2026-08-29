// URL slugs for pharmacies.
//
// Derived, not stored. A pharmacy's id is KTEB's `pdp` — the primary key of
// this whole system and the one thing about a pharmacy that never changes — so
// hanging the slug off it buys three things a `slug` column would have had to
// work for: uniqueness by construction (two MERKEZ ECZANESİ in different towns
// cannot collide), permanence (a name corrected at the source does not break a
// URL someone shared), and no migration to keep in step with the scrapers.
//
// The name still leads, because that is the part a person reads in a link and
// the part a search engine weighs. When it changes, the page answers on both
// spellings and redirects the old one to the new.
import { normalizeTr } from "./regions";

/** Turkish letters have no business in a URL; these are their ASCII stand-ins. */
const TR_ASCII: Record<string, string> = {
  ç: "c", ğ: "g", ı: "i", i: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u",
};

/** Lowercase ASCII, dash-separated. Empty when nothing survives. */
export function slugify(raw: string): string {
  return normalizeTr(raw)
    .replace(/[çğıiöşüâîû]/g, (c) => TR_ASCII[c] ?? c)
    // Anything still outside the alphabet becomes a separator rather than
    // vanishing, so "A.B ECZANESİ" does not turn into "abeczanesi".
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The canonical path segment for a pharmacy.
 *
 * A name that slugifies to nothing — punctuation only, or a character set we
 * do not map — still gets a usable URL out of the id alone.
 */
export function pharmacySlug(p: { id: number; name: string }): string {
  const base = slugify(p.name);
  return base ? `${base}-${p.id}` : String(p.id);
}

/**
 * The pharmacy a slug refers to, read from its trailing id.
 *
 * Only the id is trusted. The name in front of it is decoration that may be a
 * spelling behind the current one, which is exactly why the lookup does not
 * depend on it: the page finds the pharmacy either way and then redirects to
 * the spelling it is published under now.
 */
export function pharmacyIdFromSlug(slug: string | null | undefined): number | null {
  if (!slug) return null;
  const m = /(?:^|-)(\d+)$/.exec(slug.trim());
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
