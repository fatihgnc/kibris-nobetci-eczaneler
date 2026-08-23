// Seed script (SPEC §4.2). One-off, but re-runnable monthly: `npm run seed`
//
// 1. Walk detail pages pdp=1..N (concurrency 3, ≥300ms delay per worker).
// 2. Join regions from the directory page by normalised name.
// 3. Upsert into pharmacies; rows with coords_manual=true keep their coords.
import "dotenv/config";
import { supabaseAdmin } from "../src/lib/supabase";
import { fetchHtml, HttpError, KTEB_BASE, mapLimit } from "../src/lib/scrape/http";
import { parseDetailPage, parseDirectory, type DetailPage } from "../src/lib/scrape/parse";
import { normalizePharmacyName } from "../src/lib/regions";

const MAX_PDP = Number(process.env.SEED_MAX_PDP ?? 600); // ~400 pharmacies, leave headroom

async function main() {
  const db = supabaseAdmin();
  const { data: run } = await db.from("sync_runs").insert({ kind: "seed", status: "failed" }).select("id").single();
  const runId = run?.id as number | undefined;

  console.log(`Fetching directory…`);
  const directory = parseDirectory(await fetchHtml(`${KTEB_BASE}/lists/pharmacylist/?lang=tr`));
  console.log(`Directory: ${directory.size} name → region entries`);

  console.log(`Walking detail pages 1..${MAX_PDP} (concurrency 3, 300ms delay)…`);
  const ids = Array.from({ length: MAX_PDP }, (_, i) => i + 1);
  const found: { id: number; detail: DetailPage }[] = [];
  let done = 0;

  await mapLimit(ids, 3, 300, async (id) => {
    try {
      const html = await fetchHtml(`${KTEB_BASE}/PharmacyDetail.aspx?lang=tr&pdp=${id}`);
      const detail = parseDetailPage(html);
      if (detail) found.push({ id, detail });
    } catch (err) {
      // 404 / empty page is a skip, not an error.
      if (!(err instanceof HttpError && (err.status === 404 || err.status === 500))) {
        console.warn(`pdp=${id}: ${err instanceof Error ? err.message : err}`);
      }
    }
    if (++done % 50 === 0) console.log(`  …${done}/${MAX_PDP} (${found.length} pharmacies so far)`);
  });

  console.log(`Parsed ${found.length} pharmacies. Joining regions…`);
  let unmatched = 0;
  const rows = found.map(({ id, detail }) => {
    const nameNorm = normalizePharmacyName(detail.name);
    const region = directory.get(nameNorm) ?? null;
    if (!region) {
      unmatched++;
      console.log(`UNMATCHED REGION: pdp=${id} "${detail.name}" (norm: "${nameNorm}")`);
    }
    return {
      id,
      name: detail.name,
      name_norm: nameNorm,
      region,
      address: detail.address,
      phone: detail.phone,
      phone_alt: detail.phoneAlt,
      email: detail.email,
      lat: detail.lat,
      lng: detail.lng,
      is_active: true,
      updated_at: new Date().toISOString(),
    };
  });

  // coords_manual rows must never have lat/lng overwritten — carry the
  // existing values through the upsert.
  const { data: manual } = await db.from("pharmacies").select("id, lat, lng").eq("coords_manual", true);
  const manualCoords = new Map((manual ?? []).map((r) => [r.id as number, { lat: r.lat, lng: r.lng }]));
  for (const row of rows) {
    const kept = manualCoords.get(row.id);
    if (kept) {
      row.lat = kept.lat as number | null;
      row.lng = kept.lng as number | null;
    }
  }

  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const { error } = await db.from("pharmacies").upsert(chunk, { onConflict: "id" });
    if (error) throw new Error(error.message);
  }

  if (runId) {
    await db
      .from("sync_runs")
      .update({ finished_at: new Date().toISOString(), status: unmatched > 0 ? "partial" : "ok", rows_written: rows.length })
      .eq("id", runId);
  }
  console.log(`Done: ${rows.length} pharmacies upserted, ${unmatched} without a region (stored with region = null).`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
