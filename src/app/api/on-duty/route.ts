// GET /api/on-duty (SPEC §6) — data and status codes only, never display strings.
//
// The query itself lives in @/lib/on-duty, shared with the pages that render
// the roster into their HTML. What stays here is the HTTP contract: parsing the
// query string, the cache header, and what an outage looks like to the client.
import { NextRequest, NextResponse } from "next/server";
import { getOnDuty } from "@/lib/on-duty";
import { isRegionCode } from "@/lib/regions";

export const dynamic = "force-dynamic";

function num(v: string | null): number | null {
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const regionParam = params.get("region");

  try {
    const body = await getOnDuty({
      date: params.get("date"),
      region: isRegionCode(regionParam) ? regionParam : null,
      // The user's location is used for this query only — never stored, never logged.
      lat: num(params.get("lat")),
      lng: num(params.get("lng")),
    });
    return NextResponse.json(body, {
      headers: {
        // max-age=0 keeps the browser revalidating; without it the CDN strips the
        // s-maxage directives it consumes and the browser is left with a bare
        // "public", which it may then cache heuristically. The edge still serves
        // this for 300s (SPEC §6).
        "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=3600",
      },
    });
  } catch (err) {
    // Logged server-side only — the client gets a stable, opaque message.
    // Swallowing it entirely made a real outage undiagnosable: the endpoint
    // returned 500 with no signal anywhere, and the cause (a bad
    // SUPABASE_ANON_KEY in the deployment) had to be found by elimination.
    console.error(`on-duty query failed: ${err instanceof Error ? err.message : String(err)}`);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
}
