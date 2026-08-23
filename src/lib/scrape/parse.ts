// HTML parsers for the three KTEB pages (SPEC §2, §4).
import * as cheerio from "cheerio";
import { normalizePharmacyName, normalizeRegion, type RegionCode } from "../regions";

export interface DetailPage {
  name: string;
  address: string | null;
  phone: string | null;
  phoneAlt: string | null;
  email: string | null;
  lat: number | null;
  lng: number | null;
}

export interface DutyEntry {
  pharmacyId: number;
  dutyDate: string | null; // YYYY-MM-DD from the card, if parseable
  region: RegionCode | null;
  hoursRaw: string;
  opensAt: string | null;
  closesAt: string | null;
  oncallFrom: string | null;
  oncallTo: string | null;
}

const COORDS_RE = /maps\.google\.com\/maps\?q=(-?\d+\.\d+),(-?\d+\.\d+)/;
const DATE_RE = /(\d{2})\.(\d{2})\.(\d{4})/;
const HOURS_RE = /(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/;
const ONCALL_RE = /\((\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})\s*On-?Call\)/i;
const PHONE_RE = /\(?0\d{3}\)?[\s.]*\d{3}[\s.]*\d{2}[\s.]*\d{2}/g;

function splitPhones(raw: string | null): { phone: string | null; phoneAlt: string | null } {
  if (!raw) return { phone: null, phoneAlt: null };
  const found: string[] = raw.match(PHONE_RE) ?? [];
  const clean = (s: string) => s.replace(/\s+/g, " ").trim();
  const [first, second] = found;
  if (first && second) return { phone: clean(first), phoneAlt: clean(second) };
  if (first) return { phone: clean(first), phoneAlt: null };
  const t = clean(raw);
  return { phone: t.length ? t : null, phoneAlt: null };
}

/** Parse PharmacyDetail.aspx — coordinates live in the maps iframe URL. */
export function parseDetailPage(html: string): DetailPage | null {
  const $ = cheerio.load(html);

  const coords = COORDS_RE.exec(html);
  const lat = coords ? Number(coords[1]) : null;
  const lng = coords ? Number(coords[2]) : null;

  // Name: try common heading elements, largest first.
  let name = "";
  for (const sel of ["h1", "h2", "h3", ".pharmacy-name", "#ctl00_ContentPlaceHolder1_lblName"]) {
    const t = $(sel).first().text().replace(/\s+/g, " ").trim();
    if (t && /ECZANES/i.test(t.toLocaleUpperCase("tr-TR"))) {
      name = t;
      break;
    }
    if (t && !name) name = t;
  }
  if (!name) {
    const title = $("title").text().replace(/\s+/g, " ").trim();
    if (title) name = title.split(/[-|—]/)[0].trim();
  }
  if (!name) return null;

  // Key/value table: label cell → value cell.
  let address: string | null = null;
  let phoneRaw: string | null = null;
  let email: string | null = null;
  $("tr").each((_, tr) => {
    const cells = $(tr).find("td,th");
    if (cells.length < 2) return;
    const label = $(cells[0]).text().toLocaleLowerCase("tr-TR");
    const value = $(cells[cells.length - 1]).text().replace(/\s+/g, " ").trim();
    if (!value) return;
    if (label.includes("adres")) address = value;
    else if (label.includes("telefon") || label.includes("tel")) phoneRaw = value;
    else if (label.includes("posta") || label.includes("mail")) email = value;
  });
  if (!email) {
    const m = /[\w.+-]+@[\w-]+\.[\w.]+/.exec($("body").text());
    email = m ? m[0] : null;
  }

  const { phone, phoneAlt } = splitPhones(phoneRaw);
  return { name, address, phone, phoneAlt, email, lat, lng };
}

/** Parse the full directory table → normalised name → region. */
export function parseDirectory(html: string): Map<string, RegionCode> {
  const $ = cheerio.load(html);
  const map = new Map<string, RegionCode>();
  $("tr").each((_, tr) => {
    const cells = $(tr).find("td");
    if (cells.length < 3) return;
    // Columns: S/N | ECZANE ADI | BÖLGE | ADRES | TELEFON NO | YETKİLİ KİŞİ
    const name = $(cells[1]).text().replace(/\s+/g, " ").trim();
    const region = normalizeRegion($(cells[2]).text());
    if (!name || !region) return;
    map.set(normalizePharmacyName(name), region);
  });
  return map;
}

/** Parse the duty list page /dp/?lang=tr into per-pharmacy entries. */
export function parseDutyPage(html: string): DutyEntry[] {
  const $ = cheerio.load(html);
  const all = $("body *").toArray();

  // Document-order positions of region headings ("... BÖLGESİ").
  const headings: { index: number; region: RegionCode | null }[] = [];
  all.forEach((el, i) => {
    const $el = $(el);
    if ($el.children().length > 0) return; // leaf nodes only
    const text = $el.text().replace(/\s+/g, " ").trim();
    if (text.length > 0 && text.length < 48 && /BÖLGESİ/i.test(text.toLocaleUpperCase("tr-TR"))) {
      headings.push({ index: i, region: normalizeRegion(text) });
    }
  });

  const entries: DutyEntry[] = [];
  const seen = new Set<number>();

  $('a[href*="PharmacyDetail.aspx"]').each((_, a) => {
    const href = $(a).attr("href") ?? "";
    const pdp = /[?&]pdp=(\d+)/.exec(href);
    if (!pdp) return;
    const pharmacyId = Number(pdp[1]);
    if (seen.has(pharmacyId)) return;
    seen.add(pharmacyId);

    // Card: climb ancestors until the surrounding text carries a date + hours.
    let card: cheerio.Cheerio<never> | null = null;
    let node = $(a).parent();
    for (let depth = 0; depth < 7 && node.length; depth++) {
      const text = node.text();
      if (DATE_RE.test(text) && HOURS_RE.test(text)) {
        card = node as never;
        break;
      }
      node = node.parent();
    }
    const cardText = (card ? $(card).text() : $(a).parent().text()).replace(/\s+/g, " ").trim();

    const dm = DATE_RE.exec(cardText);
    const dutyDate = dm ? `${dm[3]}-${dm[2]}-${dm[1]}` : null;

    // The on-call window is parenthesised; strip it before reading base hours
    // so "08:00 - 22:00 (22:00 - 00:00 On-Call)" yields the right pair.
    const om = ONCALL_RE.exec(cardText);
    const baseText = cardText.replace(ONCALL_RE, " ");
    const hm = HOURS_RE.exec(baseText);
    const hoursRaw = (om ? `${hm ? `${hm[1]} - ${hm[2]} ` : ""}(${om[1]} - ${om[2]} On-Call)` : hm ? `${hm[1]} - ${hm[2]}` : "")
      .trim();

    // Region: nearest preceding heading in document order.
    const anchorIndex = all.indexOf(a as never);
    let region: RegionCode | null = null;
    for (const h of headings) {
      if (h.index < anchorIndex) region = h.region ?? region;
      else break;
    }

    entries.push({
      pharmacyId,
      dutyDate,
      region,
      hoursRaw: hoursRaw || "08:00 - 00:00",
      opensAt: hm ? hm[1] : null,
      closesAt: hm ? hm[2] : null,
      oncallFrom: om ? om[1] : null,
      oncallTo: om ? om[2] : null,
    });
  });

  return entries;
}
