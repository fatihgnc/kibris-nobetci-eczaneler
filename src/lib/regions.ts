// Region normalisation (SPEC §4.1) — single source of truth.
// Enum codes are ASCII; display labels stay in Turkish in both locales,
// because region names are proper nouns.

export type RegionCode =
  | "LEFKOSA"
  | "GIRNE"
  | "GAZIMAGUSA"
  | "GUZELYURT"
  | "LEFKE"
  | "MESARYA"
  | "ISKELE"
  | "KARPAZ";

export const REGION_LABEL: Record<RegionCode, string> = {
  LEFKOSA: "Lefkoşa",
  GIRNE: "Girne",
  GAZIMAGUSA: "Gazimağusa",
  GUZELYURT: "Güzelyurt",
  LEFKE: "Lefke",
  MESARYA: "Mesarya",
  ISKELE: "İskele",
  KARPAZ: "Karpaz",
};

/** Display order used by the region filter (matches the design). */
export const REGION_ORDER: RegionCode[] = [
  "LEFKOSA",
  "GIRNE",
  "GAZIMAGUSA",
  "GUZELYURT",
  "LEFKE",
  "ISKELE",
  "KARPAZ",
  "MESARYA",
];

/**
 * Lowercase Turkish text safely. Always 'tr-TR' — the dotted/dotless
 * I/ı/İ/i trap silently breaks naive matching otherwise.
 */
export function normalizeTr(s: string): string {
  return s.toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();
}

// Alias map absorbing the source's Turkish variants (MAĞUSA vs GAZİMAĞUSA,
// case differences, the trailing BÖLGESİ). Keys are normalizeTr() output.
const REGION_ALIASES: Record<string, RegionCode> = {
  "lefkoşa": "LEFKOSA",
  "girne": "GIRNE",
  "mağusa": "GAZIMAGUSA",
  "gazimağusa": "GAZIMAGUSA",
  "güzelyurt": "GUZELYURT",
  "lefke": "LEFKE",
  // The source splits Mesarya in two, but a duty night there is rare enough
  // that two filter chips mostly sit empty. Both headings fold into one region.
  "mesarya": "MESARYA",
  "üst mesarya": "MESARYA",
  "alt mesarya": "MESARYA",
  "iskele": "ISKELE",
  "karpaz": "KARPAZ",
};

/**
 * Normalise a region string from the source — a heading like
 * "MAĞUSA BÖLGESİ" or a directory cell like "GAZİMAĞUSA".
 */
export function normalizeRegion(raw: string | null | undefined): RegionCode | null {
  if (!raw) return null;
  const cleaned = normalizeTr(raw).replace(/\bbölgesi\b/g, "").replace(/\s+/g, " ").trim();
  return REGION_ALIASES[cleaned] ?? null;
}

export function isRegionCode(v: string | null | undefined): v is RegionCode {
  return typeof v === "string" && v in REGION_LABEL;
}

/**
 * Codes that were written to the database before Üst/Alt Mesarya were folded
 * into one. Rows synced earlier still carry them, so reads translate rather
 * than dropping a pharmacy's region on the floor.
 */
const LEGACY_CODES: Record<string, RegionCode> = {
  UST_MESARYA: "MESARYA",
  ALT_MESARYA: "MESARYA",
};

/** A stored region value as a current code — legacy values included. */
export function toRegionCode(v: string | null | undefined): RegionCode | null {
  if (!v) return null;
  if (isRegionCode(v)) return v;
  return LEGACY_CODES[v] ?? null;
}

/**
 * Normalise a pharmacy name for matching between the directory and detail
 * pages. Strips parenthesised variants like "YUSUF TANDOĞAN ECZANESİ (LEFKOŞA)".
 */
export function normalizePharmacyName(raw: string): string {
  return normalizeTr(raw.replace(/\([^)]*\)/g, " ")).replace(/[.’']/g, "").trim();
}

/**
 * URL segment for each region, shared by both locales.
 *
 * The codes are already ASCII, so the slug is just the lowercase of the code
 * and the pair can never drift apart. Turkish in an English URL is deliberate:
 * one slug per region means one page per region, and "Kyrenia" earns its
 * keyword in the heading and the copy instead of splitting the page in two.
 */
export const REGION_SLUG: Record<RegionCode, string> = Object.fromEntries(
  REGION_ORDER.map((code) => [code, code.toLowerCase()])
) as Record<RegionCode, string>;

const SLUG_TO_REGION: Record<string, RegionCode> = Object.fromEntries(
  REGION_ORDER.map((code) => [REGION_SLUG[code], code])
);

/** A URL segment back to its region, or null if it names no region. */
export function regionFromSlug(slug: string | null | undefined): RegionCode | null {
  if (!slug) return null;
  return SLUG_TO_REGION[slug.toLowerCase()] ?? null;
}

/**
 * English exonyms, used only where an English page names a region in prose.
 *
 * The URL keeps the Turkish slug in both locales, so this is what carries
 * "Kyrenia" and "Famagusta" — the words an English speaker actually searches —
 * onto the page instead of into a second address competing with the first.
 * Where the two names agree the label is printed once, not twice.
 */
const REGION_LABEL_EN: Record<RegionCode, string> = {
  LEFKOSA: "Nicosia",
  GIRNE: "Kyrenia",
  GAZIMAGUSA: "Famagusta",
  GUZELYURT: "Morphou",
  LEFKE: "Lefke",
  MESARYA: "Mesaoria",
  ISKELE: "Iskele",
  KARPAZ: "Karpaz",
};

/** How a region is named to a reader of `locale`. */
export function regionDisplay(code: RegionCode, locale: string): string {
  const tr = REGION_LABEL[code];
  if (locale !== "en") return tr;
  const en = REGION_LABEL_EN[code];
  return en === tr ? tr : `${en} (${tr})`;
}

/**
 * Is this fix on Cyprus at all?
 *
 * A bounding box around the whole island — west to the Akamas, east to Cape
 * Apostolos Andreas, south past Limassol, north to the Karpaz tip. Deliberately
 * the *whole* island rather than the north: someone in Limassol looking up a
 * northern roster is still a plausible visitor, whereas a fix in Istanbul or
 * London is not, and guessing a region for them would be pure noise.
 *
 * The box takes in some sea. That is fine for what it guards: the question is
 * "could this person be here", not "is this dry land".
 */
export function isOnCyprus(lat: number, lng: number): boolean {
  return lat >= 34.5 && lat <= 35.75 && lng >= 32.2 && lng <= 34.65;
}
