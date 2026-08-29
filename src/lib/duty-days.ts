// Which days the roster covers — shared by /api/duty-days and the sitemap.
//
// KTEB publishes about a month ahead and the horizon slides as the month is
// entered, so the covered range is never a constant anything may assume.
import { addDutyDays, dutyDateFor } from "./duty-date";
import { supabaseAnon } from "./supabase";

/** Ceiling on the lookahead, so a stray far-future row cannot stretch the range. */
export const MAX_LOOKAHEAD_DAYS = 30;

/**
 * Covered days from today forward, ascending, today first.
 *
 * Returns just today when the query fails: both callers describe the site to
 * someone else — a strip of days, a sitemap — and neither is worth a 500 or a
 * broken build over a database blip.
 */
export async function coveredDutyDays(): Promise<{ today: string; days: string[] }> {
  const today = dutyDateFor();
  try {
    const { data, error } = await supabaseAnon()
      .from("duty_shifts")
      .select("duty_date")
      .gte("duty_date", today)
      .lte("duty_date", addDutyDays(today, MAX_LOOKAHEAD_DAYS))
      .order("duty_date");
    if (error) throw new Error(error.message);
    // One row per pharmacy per day comes back; the callers want the days.
    const days = [...new Set((data ?? []).map((r) => r.duty_date as string))];
    return { today, days: days.length ? days : [today] };
  } catch (err) {
    console.error(`covered duty days query failed: ${err instanceof Error ? err.message : String(err)}`);
    return { today, days: [today] };
  }
}
