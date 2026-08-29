// What every page that shows the roster needs from the server, in one place.
//
// The homepage, the region pages and their dated variants all render the same
// shell, and all of them have to hand it the same three things. Gathering that
// here keeps the routes to what actually differs between them: the heading, the
// canonical, and which pharmacies the structured data names.
import { dutyDateFor, dutyMinutesFor } from "./duty-date";
import { coveredDutyDays } from "./duty-days";
import { getOnDuty } from "./on-duty";
import type { DutyDaysResponse, OnDutyResponse } from "./types";

export interface RosterPageData {
  /** The day's roster, unfiltered, or null if the query failed. */
  data: OnDutyResponse | null;
  days: DutyDaysResponse | null;
  /** The server's position in the duty day, so hydration agrees on it. */
  nowMinutes: number;
  /** The duty day this page is for. */
  date: string;
}

/**
 * Never throws.
 *
 * A database outage must not take the page with it: the shell still renders,
 * and the client's own fetch retries and shows the error state the app already
 * has. Losing the crawler's copy of the roster for one request is a bad day;
 * a 500 is a worse one.
 *
 * The roster comes back unfiltered even on a region page. The shell filters it
 * itself — it draws the pharmacies outside the filter on the map too, dimmed,
 * so the filter never looks like the island has emptied out — and handing it a
 * pre-filtered list would quietly take that away.
 */
export async function loadRosterPage(date?: string | null): Promise<RosterPageData> {
  const [data, days] = await Promise.all([
    getOnDuty({ date }).catch((err: unknown) => {
      console.error(`roster page query failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }),
    coveredDutyDays().catch(() => null),
  ]);

  return {
    data,
    days,
    nowMinutes: dutyMinutesFor(),
    date: data?.dutyDate ?? date ?? dutyDateFor(),
  };
}
