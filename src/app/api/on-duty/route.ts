// GET /api/on-duty (SPEC §6) — data and status codes only, never display strings.
import { NextRequest, NextResponse } from "next/server";
import { dutyDateFor, dutyMinutesFor } from "@/lib/duty-date";
import { isRegionCode } from "@/lib/regions";
import { deriveStatus } from "@/lib/status";
import { supabaseAnon } from "@/lib/supabase";
import type { OnDutyPharmacy, OnDutyResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

const STALE_AFTER_MS = 12 * 60 * 60 * 1000;

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
  if (process.env.MOCK_DATA === "1") {
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
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  const lastSyncedAt: string | null = sync.data?.finished_at ?? null;
  const stale = !lastSyncedAt || Date.now() - new Date(lastSyncedAt).getTime() > STALE_AFTER_MS;

  const nowMinutes = dutyMinutesFor();
  const short = (t: string | null) => (t ? t.slice(0, 5) : null);

  type Row = {
    pharmacy_id: number; name: string; region: string | null; address: string | null;
    phone: string | null; phone_alt: string | null; lat: number | null; lng: number | null;
    hours_raw: string; opens_at: string | null; closes_at: string | null;
    oncall_from: string | null; oncall_to: string | null; distance_km: number | null;
  };

  const pharmacies: OnDutyPharmacy[] = ((rpc.data ?? []) as Row[])
    .filter((r) => !region || r.region === region)
    .map((r) => {
      const opensAt = short(r.opens_at);
      const closesAt = short(r.closes_at);
      const oncallFrom = short(r.oncall_from);
      const oncallTo = short(r.oncall_to);
      return {
        id: r.pharmacy_id,
        name: r.name,
        region: isRegionCode(r.region) ? r.region : null,
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
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" },
  });
}
