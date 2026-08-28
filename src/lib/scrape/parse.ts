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

/**
 * Parse PharmacyDetail.aspx.
 *
 * The page carries no field labels — each row is an icon plus a value — so
 * matching on label text finds nothing. What is stable is the ASP.NET control
 * id: the generated prefix (CpAll_PharmacyDetail_6_) can change, the suffix
 * does not, so ids are matched by suffix. Icon classes are the fallback.
 *
 * Coordinates come from the embedded Google Maps iframe, which is why this
 * project needs no geocoding service.
 */
export function parseDetailPage(html: string): DetailPage | null {
  const $ = cheerio.load(html);

  const clean = (t: string | undefined) => {
    const v = (t ?? "").replace(/\s+/g, " ").trim();
    return v.length ? v : null;
  };
  const byId = (suffix: string) => clean($(`[id$="${suffix}"]`).first().text());

  /** Value cell sitting next to a given icon, e.g. i.icon-map-marker. */
  const byIcon = (iconClass: string) =>
    clean($(`i.${iconClass}`).first().closest("td").next("td").text());

  const name =
    byId("lblPharmacyName") ??
    clean($("h3").first().text()) ??
    clean($("h1,h2").first().text());
  if (!name) return null;

  const address = byId("lblAddress") ?? byIcon("icon-map-marker");

  let phone = byId("lblPhoneNumber1");
  let phoneAlt = byId("lblPhoneNumber2");
  if (!phone) {
    // Fall back to tel: links, but only inside the detail table — the site
    // header carries KTEB's own switchboard number.
    const scope = $("i.icon-map-marker").first().closest("table");
    const nums = (scope.length ? scope : $("body"))
      .find('a[href^="tel:"]')
      .map((_, a) => clean($(a).text()))
      .get()
      .filter((v): v is string => Boolean(v));
    phone = nums[0] ?? null;
    phoneAlt = phoneAlt ?? nums[1] ?? null;
  }

  const email =
    byId("lblEmail") ??
    clean($('a[href^="mailto:"]').first().text()) ??
    (/[\w.+-]+@[\w-]+\.[\w.]+/.exec($("body").text())?.[0] ?? null);

  const coords = COORDS_RE.exec(html);

  return {
    name,
    address,
    phone,
    phoneAlt,
    email,
    lat: coords ? Number(coords[1]) : null,
    lng: coords ? Number(coords[2]) : null,
  };
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

/**
 * The postback form behind the duty page's date picker.
 *
 * `/dp/?lang=tr` serves today by default, but the page carries a datepicker
 * that posts back to itself for any other day — which is the only way to reach
 * the roster KTEB has already published for the coming weeks. There is no
 * button: the picker submits the form with the text input as the event target.
 *
 * Nothing here is hardcoded. The control names carry an ASP.NET-generated
 * prefix (`ctl00$ctl00$CpAll$DutyPharmacies_7$`) whose numeric suffix moves
 * when the page is edited, and the hidden state fields differ between ASP.NET
 * configurations — `__EVENTVALIDATION` is absent today but would have to be
 * echoed back if it ever appeared. So ids are matched by suffix and every
 * `__`-prefixed hidden input is carried over untouched.
 */
export interface DutyForm {
  /** Hidden state fields (__VIEWSTATE and friends) to echo back verbatim. */
  hidden: Record<string, string>;
  /** POST name of the date input; doubles as the __EVENTTARGET. */
  dateField: string;
  /** POST name of the region dropdown, if the page still has one. */
  regionField: string | null;
  /** The date the page is currently showing, as YYYY-MM-DD. */
  shownDate: string | null;
}

export function parseDutyForm(html: string): DutyForm | null {
  const $ = cheerio.load(html);

  const dateInput = $('input[id$="txtDutyDate"]').first();
  const dateField = dateInput.attr("name");
  if (!dateField) return null;

  const hidden: Record<string, string> = {};
  $('input[type="hidden"]').each((_, el) => {
    const name = $(el).attr("name");
    if (name?.startsWith("__")) hidden[name] = $(el).attr("value") ?? "";
  });
  if (!hidden.__VIEWSTATE) return null;

  const dm = DATE_RE.exec(dateInput.attr("value") ?? "");

  return {
    hidden,
    dateField,
    regionField: $('select[id$="ddlRegion"]').first().attr("name") ?? null,
    shownDate: dm ? `${dm[3]}-${dm[2]}-${dm[1]}` : null,
  };
}
