// Duty sync (SPEC §4.3) — shared by scripts/sync-duty.ts and the cron route.
import type { SupabaseClient } from "@supabase/supabase-js";
import { dutyDateFor } from "../duty-date";
import { normalizePharmacyName } from "../regions";
import { fetchHtml, KTEB_BASE, sleep } from "./http";
import { parseDetailPage, parseDutyPage } from "./parse";

/** Fewer parsed records than this marks the run failed (SPEC §4.3 sanity check). */
export const MIN_SANE_RECORDS = 7;

export interface SyncResult {
  status: "ok" | "failed";
  rowsWritten: number;
  dutyDate: string | null;
  error?: string;
}

export async function runDutySync(db: SupabaseClient): Promise<SyncResult> {
  const { data: run, error: runErr } = await db
    .from("sync_runs")
    .insert({ kind: "duty", status: "failed" })
    .select("id")
    .single();
  if (runErr) throw new Error(`sync_runs insert failed: ${runErr.message}`);
  const runId = run.id as number;

  const finish = async (patch: Record<string, unknown>) => {
    await db.from("sync_runs").update({ finished_at: new Date().toISOString(), ...patch }).eq("id", runId);
  };

  try {
    const html = await fetchHtml(`${KTEB_BASE}/dp/?lang=tr`);
    const entries = parseDutyPage(html);

    if (entries.length < MIN_SANE_RECORDS) {
      const error = `Sanity check failed: only ${entries.length} records parsed (< ${MIN_SANE_RECORDS}). Existing data left untouched.`;
      await finish({ status: "failed", rows_written: 0, error });
      return { status: "failed", rowsWritten: 0, dutyDate: null, error };
    }

    // Newly opened pharmacies: fetch their detail pages on the spot.
    const ids = entries.map((e) => e.pharmacyId);
    const { data: existing, error: exErr } = await db.from("pharmacies").select("id, region").in("id", ids);
    if (exErr) throw new Error(exErr.message);
    const known = new Map((existing ?? []).map((r) => [r.id as number, r.region as string | null]));

    for (const e of entries) {
      if (known.has(e.pharmacyId)) continue;
      try {
        const detail = parseDetailPage(await fetchHtml(`${KTEB_BASE}/PharmacyDetail.aspx?lang=tr&pdp=${e.pharmacyId}`));
        if (detail) {
          await db.from("pharmacies").upsert(
            {
              id: e.pharmacyId,
              name: detail.name,
              name_norm: normalizePharmacyName(detail.name),
              region: e.region,
              address: detail.address,
              phone: detail.phone,
              phone_alt: detail.phoneAlt,
              email: detail.email,
              lat: detail.lat,
              lng: detail.lng,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "id" }
          );
          known.set(e.pharmacyId, e.region);
        }
      } catch (err) {
        console.warn(`Detail fetch failed for new pdp=${e.pharmacyId}:`, err);
      }
      await sleep(300);
    }

    const fallbackDate = dutyDateFor();
    const rows = entries
      .filter((e) => known.has(e.pharmacyId))
      .map((e) => ({
        duty_date: e.dutyDate ?? fallbackDate,
        pharmacy_id: e.pharmacyId,
        // Fallback: pharmacies.region when the heading could not be parsed.
        region: e.region ?? known.get(e.pharmacyId) ?? "LEFKOSA",
        hours_raw: e.hoursRaw,
        opens_at: e.opensAt,
        closes_at: e.closesAt,
        oncall_from: e.oncallFrom,
        oncall_to: e.oncallTo,
      }));

    const { error: upErr } = await db.from("duty_shifts").upsert(rows, { onConflict: "duty_date,pharmacy_id" });
    if (upErr) throw new Error(upErr.message);

    await finish({ status: "ok", rows_written: rows.length });
    return { status: "ok", rowsWritten: rows.length, dutyDate: rows[0]?.duty_date ?? fallbackDate };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await finish({ status: "failed", error });
    return { status: "failed", rowsWritten: 0, dutyDate: null, error };
  }
}
