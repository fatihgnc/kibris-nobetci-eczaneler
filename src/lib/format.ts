// Locale-sensitive formatting helpers (SPEC §8).
import { NICOSIA_TZ } from "./duty-date";

/** "2,4 km" in tr, "2.4 km" in en — via Intl, no hand-rolled separators. */
export function formatDistanceKm(km: number, locale: string): string {
  const digits = km < 10 ? 1 : 0;
  const n = new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(km);
  return `${n} km`;
}

/** Duty heading date: tr "23 Ağustos Pazar", en "Sunday 23 August". */
export function formatDutyDate(dutyDate: string, locale: string): string {
  const d = new Date(`${dutyDate}T12:00:00Z`);
  const day = new Intl.DateTimeFormat(locale, { day: "numeric", timeZone: "UTC" }).format(d);
  const month = new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(d);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(d);
  return locale === "tr" ? `${day} ${month} ${weekday}` : `${weekday} ${day} ${month}`;
}

/**
 * Duty heading split into parts, so the design's emphasis (bold day+month,
 * plain weekday) can be applied without markup in the message bundle.
 */
export function formatDutyDateParts(
  dutyDate: string,
  locale: string,
  style: "long" | "short" = "long"
): { dayMonth: string; weekday: string } {
  const d = new Date(`${dutyDate}T12:00:00Z`);
  const day = new Intl.DateTimeFormat(locale, { day: "numeric", timeZone: "UTC" }).format(d);
  const month = new Intl.DateTimeFormat(locale, { month: style, timeZone: "UTC" }).format(d);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: style, timeZone: "UTC" }).format(d);
  return { dayMonth: `${day} ${month}`, weekday };
}

/** Clock time of an ISO timestamp in Nicosia, e.g. "15:10". */
export function formatClock(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: NICOSIA_TZ,
  }).format(new Date(iso));
}

/** Relative "6 saat önce" / "6 hours ago" for the stale banner. */
export function formatAgo(iso: string, locale: string, now: Date = new Date()): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "always" });
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 60) return rtf.format(-Math.max(minutes, 1), "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 48) return rtf.format(-hours, "hour");
  return rtf.format(-Math.round(hours / 24), "day");
}

/** "HH:MM:SS" | "HH:MM" → "HH:MM" for display. */
export function shortTime(t: string | null): string | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : t;
}

/** tel: href — parentheses and spaces stripped. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

/** Google Maps directions URL (SPEC §7). */
export function directionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

/**
 * Drive estimate: under an hour stays "43 dk" / "43 min", above it splits into
 * hours + minutes so a long haul does not read as a three-digit minute count.
 */
export function formatDriveTime(minutes: number, locale: string): string {
  const tr = locale === "tr";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return tr ? `${m} dk` : `${m} min`;
  const hours = tr ? `${h} sa` : `${h} hr`;
  if (m === 0) return hours;
  return tr ? `${hours} ${m} dk` : `${hours} ${m} min`;
}
