// GET /api/duty-days — which days the roster actually covers.
//
// The date strip must offer only days there is data for, and the covered range
// is not a constant the client could assume (see lib/duty-days).
import { NextResponse } from "next/server";
import { dutyDateFor } from "@/lib/duty-date";
import { coveredDutyDays } from "@/lib/duty-days";
import type { DutyDaysResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  // The dev fixture answers with tonight's roster whatever date is asked for,
  // so offering future days here would let the UI show today's pharmacies
  // under tomorrow's heading. One day is the honest answer without a database.
  if (process.env.MOCK_DATA === "1" && process.env.NODE_ENV !== "production") {
    const today = dutyDateFor();
    return NextResponse.json({ today, days: [today] } satisfies DutyDaysResponse);
  }

  const body: DutyDaysResponse = await coveredDutyDays();
  return NextResponse.json(body, {
    headers: {
      // Same edge window as /api/on-duty: the set of days changes once a sync,
      // not once a request.
      "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=3600",
    },
  });
}
