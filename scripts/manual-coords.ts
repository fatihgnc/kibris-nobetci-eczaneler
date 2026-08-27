// Manual coordinates for the pharmacies KTEB publishes without a map.
//
// KTEB's detail page carries coordinates only inside an embedded Google Maps
// iframe, and for a growing share of newer pharmacies that iframe is simply
// absent — so they arrive with lat/lng null, get no pin, and cannot be focused
// on the map. Geocoding does not rescue them: Nominatim found nothing usable
// for 20 of 35 and put KAPTAN CAN on a football stadium, and OSM's own
// pharmacy layer does not have these shops yet. A wrong pin at 3am is worse
// than no pin, so the coordinates are entered by hand instead.
//
//   npm run coords          list what is still missing, with a Maps link each
//   npm run coords -- write push the table below to Supabase
//
// To fill one in: open its link, right-click the shop on Google Maps, click
// the "35.1781, 33.3611" line to copy, paste it here as [lat, lng].
//
// Rows written from here get coords_manual = true, which both the seed and the
// duty sync honour — KTEB can never overwrite them, including when it finally
// publishes a map of its own.
import './load-env';
import { supabaseAdmin } from '../src/lib/supabase';
import { REGION_LABEL, type RegionCode } from '../src/lib/regions';

/** pharmacy id → [lat, lng], read off Google Maps. */
export const MANUAL_COORDS: Record<number, [number, number]> = {
  // 375: [35.1781, 33.3611], // KAPTAN CAN ECZANESİ — Ortaköy, Lefkoşa
  388: [35.04041169469439, 33.70722572487044],
  362: [35.13170536216546, 33.916870986507895],
  387: [35.13277011118989, 33.93091404417983],
  396: [35.12426145178101, 33.92990451135535], // MELİKE DEMİRSÖZ — Dumlupınar, Gazimağusa
  407: [35.11996105648971, 33.93769612883596],
  422: [35.230449219730545, 33.89337295767193],
  427: [35.1320187896431, 33.92314979814826],
  296: [35.33527129073325, 33.307659513492105],
  365: [35.342843741084366, 33.2705015],
  391: [35.27343750448856, 33.28259941534385],
  416: [35.21066042430415, 33.37868138252176], // TULİS — Mimar Mehmet Vahip Cad., K.Kaymaklı, Lefkoşa
  406: [35.33410330808436, 33.3215912],
  386: [35.199309640632684, 32.99349301349211],
  409: [35.24638940227983, 33.03571462883596],
  418: [35.1914447948391, 32.99269041349211],
  374: [35.28465260485178, 33.894189086507886],
  397: [35.18794816647222, 33.354908386507894],
  415: [35.187593272356494, 33.35843947116404],
  425: [35.21590817022995, 33.293527960338956],
  426: [35.2193995815483, 33.37754779915784],
  429: [35.1889721349744, 33.36651565682435],
};

/** The island, generously boxed — a typo lands in the sea, not in Ankara. */
const BOUNDS = { lat: [34.9, 35.75], lng: [32.2, 34.65] } as const;

function badCoord(lat: number, lng: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return 'not a number';
  if (lat < BOUNDS.lat[0] || lat > BOUNDS.lat[1])
    return `lat ${lat} outside Cyprus`;
  if (lng < BOUNDS.lng[0] || lng > BOUNDS.lng[1])
    return `lng ${lng} outside Cyprus`;
  // Google Maps hands out lat,lng; a swapped pair is the one mistake the
  // bounds check above cannot catch on its own, since 33 is a valid latitude.
  if (lat > 34.9 && lat < 35.75 && lng > 34.9 && lng < 35.75)
    return 'lat/lng look swapped';
  return null;
}

const mapsLink = (
  name: string,
  address: string | null,
  region: RegionCode | null,
) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    [name, address ?? (region ? REGION_LABEL[region] : null), 'KKTC']
      .filter(Boolean)
      .join(', '),
  )}`;

async function main() {
  const write = process.argv.includes('write');
  const db = supabaseAdmin();

  const { data, error } = await db
    .from('pharmacies')
    .select('id, name, region, address, lat, lng, coords_manual')
    .or('lat.is.null,lng.is.null')
    .order('region')
    .order('id');
  if (error) throw new Error(error.message);
  const missing = data ?? [];

  const entries = Object.entries(MANUAL_COORDS).map(([id, c]) => ({
    id: Number(id),
    coords: c,
  }));
  const problems = entries
    .map(({ id, coords }) => ({ id, why: badCoord(coords[0], coords[1]) }))
    .filter((p): p is { id: number; why: string } => p.why !== null);
  if (problems.length) {
    for (const p of problems) console.error(`✗ ${p.id}: ${p.why}`);
    throw new Error(
      `${problems.length} coordinate(s) rejected; nothing written.`,
    );
  }

  const still = missing.filter((p) => !(p.id in MANUAL_COORDS));
  console.log(
    `${missing.length} pharmacies without coordinates; ${entries.length} filled in here.\n`,
  );
  for (const p of still) {
    console.log(
      `${p.id}\t${p.name} [${p.region ? REGION_LABEL[p.region as RegionCode] : '—'}]`,
    );
    console.log(`\t${p.address ?? '(no address)'}`);
    console.log(
      `\t${mapsLink(p.name, p.address, p.region as RegionCode | null)}\n`,
    );
  }

  if (!entries.length) return;
  if (!write) {
    console.log(
      `Dry run. Re-run with \`npm run coords -- write\` to save ${entries.length} row(s).`,
    );
    return;
  }

  for (const { id, coords } of entries) {
    const { error: upErr } = await db
      .from('pharmacies')
      .update({
        lat: coords[0],
        lng: coords[1],
        coords_manual: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (upErr) throw new Error(`id ${id}: ${upErr.message}`);
    console.log(`✓ ${id} → ${coords[0]}, ${coords[1]}`);
  }
  console.log(`\nWrote ${entries.length} row(s) with coords_manual = true.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
