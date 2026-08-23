// GET /api/cron/sync-duty — protected by CRON_SECRET (SPEC §6).
import { NextRequest, NextResponse } from "next/server";
import { runDutySync } from "@/lib/scrape/sync-duty";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const headerSecret = req.headers.get("x-cron-secret");
  if (!secret || (auth !== `Bearer ${secret}` && headerSecret !== secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runDutySync(supabaseAdmin());
  return NextResponse.json(result, { status: result.status === "ok" ? 200 : 500 });
}
