import { describe, expect, it } from "vitest";
import { pharmacyIdFromSlug, pharmacySlug, slugify } from "../slug";

describe("slugify", () => {
  it("transliterates Turkish letters rather than dropping them", () => {
    expect(slugify("GÖKÇEN İLKTAÇ ECZANESİ")).toBe("gokcen-ilktac-eczanesi");
    expect(slugify("ŞAHİN ECZANESİ")).toBe("sahin-eczanesi");
    expect(slugify("GÜZELYURT")).toBe("guzelyurt");
  });

  // The dotted/dotless I is the trap the whole normalizeTr helper exists for:
  // a naive toLowerCase turns "I" into "i" and "İ" into "i̇" (i + combining dot).
  it("handles the dotted and dotless I", () => {
    expect(slugify("IŞIK ECZANESİ")).toBe("isik-eczanesi");
    expect(slugify("İSKELE")).toBe("iskele");
  });

  it("turns punctuation into separators instead of deleting it", () => {
    expect(slugify("A.B ECZANESİ")).toBe("a-b-eczanesi");
    expect(slugify("YUSUF TANDOĞAN ECZANESİ (LEFKOŞA)")).toBe("yusuf-tandogan-eczanesi-lefkosa");
  });

  it("leaves no leading or trailing dashes", () => {
    expect(slugify("  ...MERKEZ...  ")).toBe("merkez");
  });

  it("is empty when nothing survives", () => {
    expect(slugify("!!!")).toBe("");
  });
});

describe("pharmacySlug", () => {
  it("ends in the id, so two pharmacies of one name cannot collide", () => {
    const a = pharmacySlug({ id: 12, name: "MERKEZ ECZANESİ" });
    const b = pharmacySlug({ id: 340, name: "MERKEZ ECZANESİ" });
    expect(a).toBe("merkez-eczanesi-12");
    expect(b).toBe("merkez-eczanesi-340");
    expect(a).not.toBe(b);
  });

  it("falls back to the bare id when the name slugifies to nothing", () => {
    expect(pharmacySlug({ id: 7, name: "???" })).toBe("7");
  });
});

describe("pharmacyIdFromSlug", () => {
  it("reads the id back out", () => {
    expect(pharmacyIdFromSlug("merkez-eczanesi-340")).toBe(340);
    expect(pharmacyIdFromSlug("7")).toBe(7);
  });

  // The point of trusting only the id: a renamed pharmacy still resolves from
  // a link shared under its old name.
  it("resolves a stale name, so old links keep working", () => {
    expect(pharmacyIdFromSlug("eski-isim-104")).toBe(pharmacyIdFromSlug("yeni-isim-104"));
  });

  it("rejects slugs with no id", () => {
    expect(pharmacyIdFromSlug("merkez-eczanesi")).toBeNull();
    expect(pharmacyIdFromSlug("")).toBeNull();
    expect(pharmacyIdFromSlug(null)).toBeNull();
  });

  it("rejects a zero id", () => {
    expect(pharmacyIdFromSlug("x-0")).toBeNull();
  });

  // There is no such thing as a negative id in a slug: the dash is the
  // separator, so a name ending in one simply leaves an empty segment.
  it("reads through an empty segment left by a trailing dash in the name", () => {
    expect(pharmacySlug({ id: 5, name: "x-" })).toBe("x-5");
    expect(pharmacyIdFromSlug("x--5")).toBe(5);
  });
});
