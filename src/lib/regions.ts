// Region normalisation (SPEC §4.1) — single source of truth.
// Enum codes are ASCII; display labels stay in Turkish in both locales,
// because region names are proper nouns.

export type RegionCode =
  | "LEFKOSA"
  | "GIRNE"
  | "GAZIMAGUSA"
  | "GUZELYURT"
  | "LEFKE"
  | "UST_MESARYA"
  | "ALT_MESARYA"
  | "ISKELE"
  | "KARPAZ";

export const REGION_LABEL: Record<RegionCode, string> = {
  LEFKOSA: "Lefkoşa",
  GIRNE: "Girne",
  GAZIMAGUSA: "Gazimağusa",
  GUZELYURT: "Güzelyurt",
  LEFKE: "Lefke",
  UST_MESARYA: "Üst Mesarya",
  ALT_MESARYA: "Alt Mesarya",
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
  "UST_MESARYA",
  "ALT_MESARYA",
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
  "üst mesarya": "UST_MESARYA",
  "alt mesarya": "ALT_MESARYA",
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
 * Normalise a pharmacy name for matching between the directory and detail
 * pages. Strips parenthesised variants like "YUSUF TANDOĞAN ECZANESİ (LEFKOŞA)".
 */
export function normalizePharmacyName(raw: string): string {
  return normalizeTr(raw.replace(/\([^)]*\)/g, " ")).replace(/[.’']/g, "").trim();
}
