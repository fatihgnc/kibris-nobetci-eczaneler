// GET /api/duty-days — which days the roster actually covers.
//
// The date strip must offer only days there is data for. KTEB publishes about
// a month ahead and the horizon slides as the month is entered, so the range
// is not a constant the client could assume: it has to be asked for.
import { NextResponse } from "next/server";
import { addDutyDays, dutyDateFor } from "@/lib/duty-date";
import { supabaseAnon } from "@/lib/supabase";
import type { DutyDaysResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Ceiling on the lookahead, so a stray far-future row cannot stretch the strip. */
const MAX_LOOKAHEAD_DAYS = 30;

export async function GET() {
  const today = dutyDateFor();

  // The dev fixture answers with tonight's roster whatever date is asked for,
  // so offering future days here would let the UI show today's pharmacies
  // under tomorrow's heading. One day is the honest answer without a database.
  if (process.env.MOCK_DATA === "1" && process.env.NODE_ENV !== "production") {
    return NextResponse.json({ today, days: [today] } satisfies DutyDaysResponse);
  }

  const db = supabaseAnon();
  const { data, error } = await db
    .from("duty_shifts")
    .select("duty_date")
    .gte("duty_date", today)
    .lte("duty_date", addDutyDays(today, MAX_LOOKAHEAD_DAYS))
    .order("duty_date");

  if (error) {
    console.error(`duty-days query failed: ${error.message}${error.code ? ` [${error.code}]` : ""}`);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  // One row per pharmacy per day comes back; the strip wants the days.
  const days = [...new Set((data ?? []).map((r) => r.duty_date as string))];

  const body: DutyDaysResponse = { today, days };
  return NextResponse.json(body, {
    headers: {
      // Same edge window as /api/on-duty: the set of days changes once a sync,
      // not once a request.
      "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=3600",
    },
  });
}
