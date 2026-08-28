// GET /api/on-duty (SPEC §6) — data and status codes only, never display strings.
import { NextRequest, NextResponse } from "next/server";
import { dutyDateFor, dutyMinutesFor } from "@/lib/duty-date";
import { isRegionCode, toRegionCode } from "@/lib/regions";
import { deriveStatus } from "@/lib/status";
import { isStale } from "@/lib/staleness";
import { supabaseAnon } from "@/lib/supabase";
import type { OnDutyPharmacy, OnDutyResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

/** One row as on_duty_nearby returns it. */
type Row = {
  pharmacy_id: number; name: string; region: string | null; address: string | null;
  phone: string | null; phone_alt: string | null; lat: number | null; lng: number | null;
  hours_raw: string; opens_at: string | null; closes_at: string | null;
  oncall_from: string | null; oncall_to: string | null; distance_km: number | null;
};

function num(v: string | null): number | null {
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  // The user's location is used for this query only — never stored, never logged.
  const lat = num(params.get("lat"));
  const lng = num(params.get("lng"));
  const regionParam = params.get("region");
  const region = isRegionCode(regionParam) ? regionParam : null;
  const dateParam = params.get("date");
  const dutyDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : dutyDateFor();

  // Local development without a Supabase project: MOCK_DATA=1 serves a fixture.
  //
  // Hard-locked out of production. This endpoint drives which pharmacy a person
  // is told to call in the middle of the night; serving invented names and phone
  // numbers as if they were real is the worst failure this app can have, so the
  // flag must never be able to switch it on outside development.
  if (process.env.MOCK_DATA === "1" && process.env.NODE_ENV !== "production") {
    const { mockOnDuty } = await import("@/lib/mock");
    const mock = mockOnDuty(lat, lng);
    mock.pharmacies = mock.pharmacies.filter((p) => !region || p.region === region);
    return NextResponse.json(mock);
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
    // Logged server-side only — the client gets a stable, opaque message.
    // Swallowing it entirely made a real outage undiagnosable: the endpoint
    // returned 500 with no signal anywhere, and the cause (a bad
    // SUPABASE_ANON_KEY in the deployment) had to be found by elimination.
    console.error(
      `on-duty query failed: ${rpc.error.message}${rpc.error.code ? ` [${rpc.error.code}]` : ""}`
    );
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
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
  const short = (t: string | null) => (t ? t.slice(0, 5) : null);

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

  const body: OnDutyResponse = { dutyDate, lastSyncedAt, stale, pharmacies };
  return NextResponse.json(body, {
    headers: {
      // max-age=0 keeps the browser revalidating; without it the CDN strips the
      // s-maxage directives it consumes and the browser is left with a bare
      // "public", which it may then cache heuristically. The edge still serves
      // this for 300s (SPEC §6).
      "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=3600",
    },
  });
}
