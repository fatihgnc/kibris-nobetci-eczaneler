// The pharmacy directory: the roster's other half.
//
// /api/on-duty answers "who is on duty tonight". These answer "what is this
// pharmacy, and when does it take a turn" — the questions a permanent page has
// to answer, and the ones no competing site currently answers at all.
import { cache } from "react";
import { dutyDateFor } from "./duty-date";
import { type RegionCode, toRegionCode } from "./regions";
import { supabaseAnon } from "./supabase";

export interface DirectoryPharmacy {
  id: number;
  name: string;
  region: RegionCode | null;
  address: string | null;
  phone: string | null;
  phoneAlt: string | null;
  lat: number | null;
  lng: number | null;
  /** When the scrapers last wrote this row — the sitemap's lastmod. */
  updatedAt: string | null;
}

type Row = {
  id: number; name: string; region: string | null; address: string | null;
  phone: string | null; phone_alt: string | null; lat: number | null; lng: number | null;
  updated_at: string | null;
};

const toDirectory = (r: Row): DirectoryPharmacy => ({
  id: r.id,
  name: r.name,
  region: toRegionCode(r.region),
  address: r.address,
  phone: r.phone,
  phoneAlt: r.phone_alt,
  lat: r.lat,
  lng: r.lng,
  updatedAt: r.updated_at,
});

const COLUMNS = "id, name, region, address, phone, phone_alt, lat, lng, updated_at";

/**
 * Every pharmacy in the directory, on duty or not.
 *
 * Returns an empty list rather than throwing: each caller renders this beside
 * something else that still stands on its own, and a directory that failed to
 * load is a thinner page, not a broken one.
 */
export const listPharmacies = cache(async function listPharmacies(): Promise<DirectoryPharmacy[]> {
  try {
    const { data, error } = await supabaseAnon()
      .from("pharmacies")
      .select(COLUMNS)
      .order("name");
    if (error) throw new Error(error.message);
    return ((data ?? []) as Row[]).map(toDirectory);
  } catch (err) {
    console.error(`pharmacy directory query failed: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
});

/**
 * The pharmacies of one region.
 *
 * Filtered in JS rather than in the query because the stored value may still be
 * a folded-away code — UST_MESARYA for what is now MESARYA — and a `where
 * region = 'MESARYA'` would silently drop those rows. `toRegionCode` is the one
 * place that knows the translation.
 */
export async function listPharmaciesIn(region: RegionCode): Promise<DirectoryPharmacy[]> {
  const all = await listPharmacies();
  return all.filter((p) => p.region === region);
}

/** One pharmacy by its id, or null if there is no such row. */
export const getPharmacy = cache(async function getPharmacy(id: number): Promise<DirectoryPharmacy | null> {
  try {
    const { data, error } = await supabaseAnon()
      .from("pharmacies")
      .select(COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toDirectory(data as Row) : null;
  } catch (err) {
    console.error(`pharmacy query failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
});

export interface DutyHistory {
  /** Today and the published days after it, ascending. */
  upcoming: string[];
  /** The most recent past duty days, newest first. */
  past: string[];
}

/** How far back a pharmacy's page looks. Beyond this the dates stop being news. */
export const DUTY_HISTORY_DAYS = 120;
const MAX_PAST_SHOWN = 12;

/**
 * The duty dates on record for one pharmacy.
 *
 * This is what makes a pharmacy page worth publishing. Name, address and phone
 * number are three lines any directory has; the turns this pharmacy actually
 * takes are the part only a site that has been watching the roster can write.
 */
export const getDutyHistory = cache(async function getDutyHistory(id: number): Promise<DutyHistory> {
  const today = dutyDateFor();
  const since = new Date(Date.UTC(...dateParts(today)));
  since.setUTCDate(since.getUTCDate() - DUTY_HISTORY_DAYS);
  const from = since.toISOString().slice(0, 10);

  try {
    const { data, error } = await supabaseAnon()
      .from("duty_shifts")
      .select("duty_date")
      .eq("pharmacy_id", id)
      .gte("duty_date", from)
      .order("duty_date");
    if (error) throw new Error(error.message);
    const dates = [...new Set(((data ?? []) as { duty_date: string }[]).map((r) => r.duty_date))];
    return {
      upcoming: dates.filter((d) => d >= today),
      past: dates.filter((d) => d < today).reverse().slice(0, MAX_PAST_SHOWN),
    };
  } catch (err) {
    console.error(`duty history query failed: ${err instanceof Error ? err.message : String(err)}`);
    return { upcoming: [], past: [] };
  }
});

/** "YYYY-MM-DD" as the UTC triple Date.UTC wants. */
function dateParts(d: string): [number, number, number] {
  const [y, m, day] = d.split("-").map(Number);
  return [y, m - 1, day];
}

/**
 * Publishable only if the page would have something to say.
 *
 * There are a few hundred pharmacies on record and the source does not know
 * them equally well: some arrived through the duty scraper as little more than
 * a name. A page with no phone number, no coordinates and no duty history is
 * three lines of text, and a few hundred of those is exactly the thin-content
 * mass that drags a whole site's standing down. Those stay reachable and stay
 * out of both the index and the sitemap — better three hundred real pages than
 * four hundred with a hundred empty ones among them.
 */
export function isIndexable(p: DirectoryPharmacy, duty: DutyHistory): boolean {
  const hasContact = Boolean(p.phone ?? p.phoneAlt) || (p.lat !== null && p.lng !== null);
  return hasContact || duty.upcoming.length + duty.past.length > 0;
}

/**
 * Every pharmacy that has a page worth listing, with the date to stamp it.
 *
 * Done in two queries rather than four hundred: `isIndexable` needs to know
 * whether a pharmacy has ever been on duty, and asking that per pharmacy would
 * turn one sitemap into a few hundred round trips. The duty side comes back
 * once, as a set of ids.
 */
export async function listIndexablePharmacies(): Promise<DirectoryPharmacy[]> {
  const [all, everOnDuty] = await Promise.all([listPharmacies(), pharmacyIdsWithDuty()]);
  return all.filter((p) =>
    isIndexable(p, everOnDuty.has(p.id) ? { upcoming: ["seen"], past: [] } : { upcoming: [], past: [] })
  );
}

/** The ids that appear anywhere in the duty history we keep. */
async function pharmacyIdsWithDuty(): Promise<Set<number>> {
  try {
    const { data, error } = await supabaseAnon().from("duty_shifts").select("pharmacy_id");
    if (error) throw new Error(error.message);
    return new Set(((data ?? []) as { pharmacy_id: number }[]).map((r) => r.pharmacy_id));
  } catch (err) {
    console.error(`duty id query failed: ${err instanceof Error ? err.message : String(err)}`);
    return new Set();
  }
}
