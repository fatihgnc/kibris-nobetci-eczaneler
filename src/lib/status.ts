// Status derivation (SPEC §5) — drives the UI badge.

export type DutyStatus = "OPEN" | "CLOSING_SOON" | "ON_CALL" | "CLOSED";

export interface ShiftTimes {
  opensAt: string | null; // "HH:MM" or "HH:MM:SS"
  closesAt: string | null;
  oncallFrom: string | null;
  oncallTo: string | null;
}

export const CLOSING_SOON_MINUTES = 60;

/** "HH:MM[:SS]" → minutes since midnight, or null. */
export function timeToMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * An end time of 00:00 means midnight at the *end* of the duty day —
 * treat it as 24:00 when comparing.
 */
function endToMinutes(t: string | null | undefined): number | null {
  const v = timeToMinutes(t);
  if (v === null) return null;
  return v === 0 ? 24 * 60 : v;
}

/**
 * Status of one shift at `nowMinutes` (minutes since duty-day midnight,
 * see dutyMinutesFor()).
 *
 * | OPEN         | opens_at ≤ now < closes_at            |
 * | CLOSING_SOON | open and < 60 minutes to closes_at    |
 * | ON_CALL      | oncall_from ≤ now < oncall_to         |
 * | CLOSED       | anything else                         |
 */
export function deriveStatus(shift: ShiftTimes, nowMinutes: number): DutyStatus {
  const opens = timeToMinutes(shift.opensAt);
  const closes = endToMinutes(shift.closesAt);
  if (opens !== null && closes !== null && nowMinutes >= opens && nowMinutes < closes) {
    return closes - nowMinutes < CLOSING_SOON_MINUTES ? "CLOSING_SOON" : "OPEN";
  }
  const from = timeToMinutes(shift.oncallFrom);
  const to = endToMinutes(shift.oncallTo);
  if (from !== null && to !== null && nowMinutes >= from && nowMinutes < to) {
    return "ON_CALL";
  }
  return "CLOSED";
}
