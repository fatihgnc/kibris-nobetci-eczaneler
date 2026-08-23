// Duty-day logic (SPEC §5) — the single source of truth.
//
// Shifts cross midnight. Fixed timezone Europe/Nicosia; the server may run in
// UTC, so wall-clock time is always derived through Intl, never from the local
// Date fields.

export const NICOSIA_TZ = "Europe/Nicosia";

/** The duty day rolls over at 08:00 local time. Before 08:00 the duty day is yesterday. */
export const DUTY_ROLLOVER_HOUR = 8;

export interface NicosiaParts {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number; // 0–23
  minute: number;
}

const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: NICOSIA_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Wall-clock parts of `now` in Europe/Nicosia. */
export function nicosiaParts(now: Date): NicosiaParts {
  const map: Record<string, string> = {};
  for (const p of partsFormatter.formatToParts(now)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour) % 24, // h23 may still yield "24" on some ICU builds
    minute: Number(map.minute),
  };
}

/**
 * The duty date (YYYY-MM-DD) that is in effect at `now`.
 * Before 08:00 Nicosia time the duty day is still yesterday's.
 */
export function dutyDateFor(now: Date = new Date()): string {
  const p = nicosiaParts(now);
  // Anchor at UTC noon so the calendar-day subtraction can never be skewed
  // by a timezone offset.
  const anchor = new Date(Date.UTC(p.year, p.month - 1, p.day, 12));
  if (p.hour < DUTY_ROLLOVER_HOUR) {
    anchor.setUTCDate(anchor.getUTCDate() - 1);
  }
  return anchor.toISOString().slice(0, 10);
}

/**
 * Minutes elapsed since midnight of the *duty day* at `now`, in Nicosia time.
 * After midnight (00:00–07:59) this keeps counting past 1440, so a shift with
 * `oncall_to = 00:00` (normalised to 1440) compares correctly.
 */
export function dutyMinutesFor(now: Date = new Date()): number {
  const p = nicosiaParts(now);
  const minutes = p.hour * 60 + p.minute;
  return p.hour < DUTY_ROLLOVER_HOUR ? minutes + 24 * 60 : minutes;
}
