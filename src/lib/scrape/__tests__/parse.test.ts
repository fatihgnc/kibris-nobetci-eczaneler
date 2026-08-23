import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseDetailPage, parseDirectory, parseDutyPage } from "../parse";

// Fixtures are unmodified KTEB responses (the directory one is trimmed to a
// row per region, markup untouched). They exist because these parsers are the
// most fragile part of the system: the site has no API, so a markup change is
// what will break production, and only real HTML catches that.
const fixture = (name: string) =>
  fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");

describe("parseDetailPage", () => {
  const single = parseDetailPage(fixture("detail-single-phone.html"));

  it("reads the pharmacy name", () => {
    expect(single?.name).toBe("ABBASOĞLU ECZANESİ");
  });

  it("reads the address, which the page renders with an icon and no label", () => {
    expect(single?.address).toBe(
      "Şht. Mustafa Ruso Cad. No: 112/D (Yarim Gelinlik yanı), Küçük Kaymaklı, Lefkoşa"
    );
  });

  it("reads the phone in the published format", () => {
    expect(single?.phone).toBe("(0392) 227 16 64");
    expect(single?.phoneAlt).toBeNull();
  });

  it("does not mistake the site header switchboard for the pharmacy number", () => {
    // The page chrome carries KTEB's own number, +90 (392) 228 06 22.
    expect(single?.phone).not.toContain("228 06 22");
  });

  it("reads the email", () => {
    expect(single?.email).toBe("ecz_ismet11@yahoo.com");
  });

  it("extracts coordinates from the maps iframe, so no geocoder is needed", () => {
    expect(single?.lat).toBeCloseTo(35.202975, 5);
    expect(single?.lng).toBeCloseTo(33.367566, 5);
  });

  it("splits a second phone number into phoneAlt", () => {
    const two = parseDetailPage(fixture("detail-two-phones.html"));
    expect(two?.name).toBe("CEVHER ECZANESİ");
    expect(two?.phone).toBe("(0392) 227 72 51");
    expect(two?.phoneAlt).toBe("(0533) 864 98 98");
  });

  it("returns null for a page with no pharmacy on it", () => {
    expect(parseDetailPage("<html><body>Not found</body></html>")).toBeNull();
  });

  it("falls back to icon lookup when the ASP.NET ids change", () => {
    const html = fixture("detail-single-phone.html").replace(/id="[^"]*lbl(Address|PharmacyName)"/g, "");
    const p = parseDetailPage(html);
    expect(p?.name).toBe("ABBASOĞLU ECZANESİ"); // via <h3>
    expect(p?.address).toContain("Küçük Kaymaklı");
  });
});

describe("parseDirectory", () => {
  const map = parseDirectory(fixture("directory-sample.html"));

  it("maps every region the site publishes", () => {
    expect(new Set(map.values())).toEqual(
      new Set([
        "LEFKOSA", "GIRNE", "GAZIMAGUSA", "GUZELYURT", "LEFKE",
        "UST_MESARYA", "ALT_MESARYA", "ISKELE", "KARPAZ",
      ])
    );
  });

  it("skips the header row", () => {
    expect(map.has("eczane adi")).toBe(false);
    expect(map.has("bölge")).toBe(false);
  });

  it("strips the parenthesised suffix so the name joins to the detail page", () => {
    // Published as "YUSUF TANDOĞAN ECZANESİ (LEFKOŞA)" (SPEC §4.2).
    expect(map.get("yusuf tandoğan eczanesi")).toBe("LEFKOSA");
  });
});

describe("parseDutyPage", () => {
  const entries = parseDutyPage(fixture("duty-list.html"));

  it("finds every pharmacy on the roster", () => {
    expect(entries.length).toBe(15);
  });

  it("clears the sanity threshold that guards against silent parser breakage", () => {
    expect(entries.length).toBeGreaterThanOrEqual(7);
  });

  it("resolves date, region and hours for every entry", () => {
    expect(entries.filter((e) => !e.dutyDate)).toHaveLength(0);
    expect(entries.filter((e) => !e.region)).toHaveLength(0);
    expect(entries.filter((e) => !e.opensAt || !e.closesAt)).toHaveLength(0);
  });

  it("covers all nine regions", () => {
    expect(new Set(entries.map((e) => e.region)).size).toBe(9);
  });

  it("parses the date as YYYY-MM-DD", () => {
    expect(entries[0]?.dutyDate).toBe("2026-08-23");
  });

  it("separates the on-call window from the base hours", () => {
    const onCall = entries.find((e) => e.oncallFrom);
    expect(onCall).toMatchObject({
      pharmacyId: 293,
      region: "LEFKE",
      opensAt: "08:00",
      closesAt: "22:00",
      oncallFrom: "22:00",
      oncallTo: "00:00",
      hoursRaw: "08:00 - 22:00 (22:00 - 00:00 On-Call)",
    });
  });

  it("keeps closing times that are not midnight", () => {
    const early = entries.filter((e) => e.closesAt === "19:00");
    expect(early.length).toBeGreaterThan(0);
    expect(early.every((e) => e.opensAt === "08:00")).toBe(true);
  });

  it("does not emit the same pharmacy twice", () => {
    const ids = entries.map((e) => e.pharmacyId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
