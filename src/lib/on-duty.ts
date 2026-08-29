// The duty roster for one day, as both the API route and the pages read it.
//
// This used to live inside /api/on-duty, which was fine while the browser was
// the only reader. It is not any more: the pages render the list into the HTML
// so a crawler can see it, and a server component cannot call its own route
// without paying for a second HTTP round trip to itself.
import { dutyDateFor, dutyMinutesFor } from "./duty-date";
import { type RegionCode, toRegionCode } from "./regions";
import { deriveStatus } from "./status";
import { isStale } from "./staleness";
import { supabaseAnon } from "./supabase";
import type { OnDutyPharmacy, OnDutyResponse } from "./types";

/** One row as on_duty_nearby returns it. */
type Row = {
  pharmacy_id: number; name: string; region: string | null; address: string | null;
  phone: string | null; phone_alt: string | null; lat: number | null; lng: number | null;
  hours_raw: string; opens_at: string | null; closes_at: string | null;
  oncall_from: string | null; oncall_to: string | null; distance_km: number | null;
};

export interface OnDutyQuery {
  /** Duty day, YYYY-MM-DD. Defaults to today's. */
  date?: string | null;
  /** Keep only this region. Null is every region. */
  region?: RegionCode | null;
  /** Caller's position, used to sort by distance. Never stored, never logged. */
  lat?: number | null;
  lng?: number | null;
}

const short = (t: string | null) => (t ? t.slice(0, 5) : null);

/**
 * Throws when the roster query fails.
 *
 * The callers disagree about what to do with that — the route answers 500, a
 * page still has a shell worth serving — so the decision is left to them
 * rather than folded into an empty list here, which would read as "no pharmacy
 * is on duty tonight": the one lie this app must never tell.
 */
export async function getOnDuty(q: OnDutyQuery = {}): Promise<OnDutyResponse> {
  const dutyDate = q.date && /^\d{4}-\d{2}-\d{2}$/.test(q.date) ? q.date : dutyDateFor();
  const region = q.region ?? null;
  const lat = q.lat ?? null;
  const lng = q.lng ?? null;

  // Local development without a Supabase project: MOCK_DATA=1 serves a fixture.
  //
  // Hard-locked out of production. This decides which pharmacy a person is told
  // to call in the middle of the night; serving invented names and phone
  // numbers as if they were real is the worst failure this app can have, so the
  // flag must never be able to switch it on outside development.
  if (process.env.MOCK_DATA === "1" && process.env.NODE_ENV !== "production") {
    const { mockOnDuty } = await import("./mock");
    const mock = mockOnDuty(lat, lng);
    mock.pharmacies = mock.pharmacies.filter((p) => !region || p.region === region);
    return mock;
  }

  const db = supabaseAnon();

  const [rpc, sync] = await Promise.all([
    db.rpc("on_duty_nearby", { p_date: dutyDate, p_lat: lat, p_lng: lng }),
    db
      .from("sync_runs")
      .select("finished_at")
      .eq("kind", "duty")
      .eq("status", "ok")
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (rpc.error) {
    throw new Error(`${rpc.error.message}${rpc.error.code ? ` [${rpc.error.code}]` : ""}`);
  }

  // Not fatal: without it the roster is still served, just flagged stale.
  if (sync.error) {
    console.warn(`on-duty could not read the last sync time: ${sync.error.message}`);
  }

  const lastSyncedAt: string | null = sync.data?.finished_at ?? null;
  const rows = (rpc.data ?? []) as Row[];
  // Counted before the region filter: an empty region is a normal night.
  const stale = isStale(lastSyncedAt, rows.length);

  const nowMinutes = dutyMinutesFor();

  const pharmacies: OnDutyPharmacy[] = rows
    // Through toRegionCode, so a row still stored under a folded-away code
    // (UST_MESARYA / ALT_MESARYA) is matched by the chip that replaced it.
    .filter((r) => !region || toRegionCode(r.region) === region)
    .map((r) => {
      const opensAt = short(r.opens_at);
      const closesAt = short(r.closes_at);
      const oncallFrom = short(r.oncall_from);
      const oncallTo = short(r.oncall_to);
      return {
        id: r.pharmacy_id,
        name: r.name,
        region: toRegionCode(r.region),
        address: r.address,
        phone: r.phone,
        phoneAlt: r.phone_alt,
        lat: r.lat,
        lng: r.lng,
        hoursRaw: r.hours_raw,
        opensAt,
        closesAt,
        onCall: oncallFrom && oncallTo ? { from: oncallFrom, to: oncallTo } : null,
        status: deriveStatus({ opensAt, closesAt, oncallFrom, oncallTo }, nowMinutes),
        distanceKm: r.distance_km === null ? null : Math.round(r.distance_km * 10) / 10,
      };
    });

  return { dutyDate, lastSyncedAt, stale, pharmacies };
}
