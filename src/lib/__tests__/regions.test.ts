import { describe, expect, it } from "vitest";
import { normalizePharmacyName, normalizeRegion, normalizeTr, toRegionCode } from "../regions";

describe("normalizeRegion", () => {
  it("absorbs the MAĞUSA / GAZİMAĞUSA inconsistency", () => {
    expect(normalizeRegion("MAĞUSA BÖLGESİ")).toBe("GAZIMAGUSA");
    expect(normalizeRegion("GAZİMAĞUSA")).toBe("GAZIMAGUSA");
  });

  it("strips the trailing BÖLGESİ", () => {
    expect(normalizeRegion("LEFKOŞA BÖLGESİ")).toBe("LEFKOSA");
    expect(normalizeRegion("ÜST MESARYA BÖLGESİ")).toBe("MESARYA");
    expect(normalizeRegion("ALT MESARYA BÖLGESİ")).toBe("MESARYA");
  });

  it("survives the dotted/dotless I trap", () => {
    // 'İSKELE'.toLowerCase() with the invariant locale gives 'i̇skele' (combining dot)
    expect(normalizeRegion("İSKELE BÖLGESİ")).toBe("ISKELE");
    expect(normalizeRegion("GİRNE BÖLGESİ")).toBe("GIRNE");
  });

  it("folds both Mesarya headings into one region", () => {
    expect(normalizeRegion("ÜST MESARYA")).toBe("MESARYA");
    expect(normalizeRegion("ALT MESARYA")).toBe("MESARYA");
    expect(normalizeRegion("MESARYA BÖLGESİ")).toBe("MESARYA");
  });

  it("returns null for unknown regions", () => {
    expect(normalizeRegion("LARNAKA")).toBeNull();
    expect(normalizeRegion(null)).toBeNull();
  });
});

describe("toRegionCode", () => {
  it("translates the codes stored before Mesarya was folded", () => {
    expect(toRegionCode("UST_MESARYA")).toBe("MESARYA");
    expect(toRegionCode("ALT_MESARYA")).toBe("MESARYA");
  });

  it("passes current codes through and drops the rest", () => {
    expect(toRegionCode("KARPAZ")).toBe("KARPAZ");
    expect(toRegionCode("LARNAKA")).toBeNull();
    expect(toRegionCode(null)).toBeNull();
  });
});

describe("normalizeTr", () => {
  it("uses tr-TR casing", () => {
    expect(normalizeTr("İSKELE")).toBe("iskele");
    expect(normalizeTr("KIBRIS")).toBe("kıbrıs");
  });
});

describe("normalizePharmacyName", () => {
  it("strips parenthesised variants", () => {
    expect(normalizePharmacyName("YUSUF TANDOĞAN ECZANESİ (LEFKOŞA)")).toBe(
      normalizePharmacyName("YUSUF TANDOĞAN ECZANESİ")
    );
  });
});
