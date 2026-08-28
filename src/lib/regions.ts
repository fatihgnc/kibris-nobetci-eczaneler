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
