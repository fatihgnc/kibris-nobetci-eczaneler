// Duty sync (SPEC §4.3) — shared by scripts/sync-duty.ts and the cron route.
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDutyDays, dutyDateFor, toKtebDate } from "../duty-date";
import { normalizePharmacyName } from "../regions";
import { fetchHtml, KTEB_BASE, postForm, sleep } from "./http";
import { type DutyEntry, parseDetailPage, parseDutyForm, parseDutyPage } from "./parse";

/** Fewer parsed records than this marks the run failed (SPEC §4.3 sanity check). */
export const MIN_SANE_RECORDS = 7;

/**
 * How many days past today to pull.
 *
 * KTEB publishes roughly a month ahead and the horizon slides as the month is
 * entered, so there is no fixed number of days to expect — the walk simply
 * stops at the first day that comes back empty. Fourteen is the cap because it
 * is more future than the app has any use for, and each day is another request
 * to a server that owes us nothing.
 */
export const DUTY_HORIZON_DAYS = 14;

/** Pause between requests to kteb.org (SPEC §4.2). */
const REQUEST_DELAY_MS = 400;

const DUTY_URL = `${KTEB_BASE}/dp/?lang=tr`;

export interface SyncResult {
  status: "ok" | "failed";
  rowsWritten: number;
  /** Today's duty date — what the app serves by default. */
  dutyDate: string | null;
  /** How many distinct days landed, today included. */
  daysCovered: number;
  /** The furthest day written, or null when only today was. */
  horizonEnd: string | null;
  error?: string;
}

/**
 * Fetch one future day through the date picker's postback.
 *
 * Returns null when the day is not published yet — and, importantly, also when
 * the site answers with a page for some *other* date. A postback KTEB decides
 * to ignore comes back as a normal 200 carrying today's roster, and writing
 * that under a future date would have the app confidently show the wrong
 * pharmacies for a day the user is planning around. So the returned cards must
 * carry the date that was asked for; anything else is discarded.
 */
async function fetchDay(form: ReturnType<typeof parseDutyForm>, date: string): Promise<DutyEntry[] | null> {
  if (!form) return null;
  const body: Record<string, string> = {
    ...form.hidden,
    __EVENTTARGET: form.dateField,
    __EVENTARGUMENT: "",
    [form.dateField]: toKtebDate(date),
  };
  // "- TÜM BÖLGELER -": the roster is wanted whole, and an unset dropdown
  // would post as empty rather than as the all-regions default.
  if (form.regionField) body[form.regionField] = "-1";

  const entries = parseDutyPage(await postForm(DUTY_URL, body));
  const matching = entries.filter((e) => e.dutyDate === date);
  if (matching.length === 0) return null;
  return matching;
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

  const failed = (error: string): SyncResult => ({
    status: "failed",
    rowsWritten: 0,
    dutyDate: null,
    daysCovered: 0,
    horizonEnd: null,
    error,
  });

  try {
    const html = await fetchHtml(DUTY_URL);
    const entries = parseDutyPage(html);

    if (entries.length < MIN_SANE_RECORDS) {
      const error = `Sanity check failed: only ${entries.length} records parsed (< ${MIN_SANE_RECORDS}). Existing data left untouched.`;
      await finish({ status: "failed", rows_written: 0, error });
      return failed(error);
    }

    // Today is the day the sanity check guards and the day the app serves by
    // default; the future days that follow are a bonus and never fail the run.
    // The cards name their own day; the clock is the fallback for a page that
    // has stopped printing dates.
    const today = entries.find((e) => e.dutyDate)?.dutyDate ?? dutyDateFor();
    const byDay: { date: string; entries: DutyEntry[] }[] = [{ date: today, entries }];

    const form = parseDutyForm(html);
    if (!form) {
      console.warn("Duty date picker not found; only today was synced.");
    }
    for (let i = 1; i <= DUTY_HORIZON_DAYS && form; i++) {
      const date = addDutyDays(today, i);
      await sleep(REQUEST_DELAY_MS);
      let day: DutyEntry[] | null;
      try {
        day = await fetchDay(form, date);
      } catch (err) {
        // A blip on one day should not truncate the rest of the horizon, so
        // this keeps walking — unlike an empty day, which really is the end.
        console.warn(`Duty fetch failed for ${date}:`, err);
        continue;
      }
      // The published range is contiguous: the first empty day is where KTEB
      // has stopped, and every day after it would be empty too.
      if (!day) break;
      byDay.push({ date, entries: day });
    }

    // Newly opened pharmacies: fetch their detail pages on the spot. A future
    // day can introduce one just as today can, so this runs over the union.
    const all = byDay.flatMap((d) => d.entries);
    const ids = [...new Set(all.map((e) => e.pharmacyId))];
    const { data: existing, error: exErr } = await db.from("pharmacies").select("id, region").in("id", ids);
    if (exErr) throw new Error(exErr.message);
    const known = new Map((existing ?? []).map((r) => [r.id as number, r.region as string | null]));

    for (const e of all) {
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

    const rows = byDay.flatMap((d) =>
      d.entries
        .filter((e) => known.has(e.pharmacyId))
        .map((e) => ({
          duty_date: d.date,
          pharmacy_id: e.pharmacyId,
          // Fallback: pharmacies.region when the heading could not be parsed.
          region: e.region ?? known.get(e.pharmacyId) ?? "LEFKOSA",
          hours_raw: e.hoursRaw,
          opens_at: e.opensAt,
          closes_at: e.closesAt,
          oncall_from: e.oncallFrom,
          oncall_to: e.oncallTo,
        }))
    );

    const { error: upErr } = await db.from("duty_shifts").upsert(rows, { onConflict: "duty_date,pharmacy_id" });
    if (upErr) throw new Error(upErr.message);

    await finish({ status: "ok", rows_written: rows.length });
    return {
      status: "ok",
      rowsWritten: rows.length,
      dutyDate: today,
      daysCovered: byDay.length,
      horizonEnd: byDay.length > 1 ? byDay[byDay.length - 1].date : null,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await finish({ status: "failed", error });
    return failed(error);
  }
}
