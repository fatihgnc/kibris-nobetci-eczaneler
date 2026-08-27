// When the roster must be served behind the stale notice (SPEC §6).
//
// Kept out of the route so it can be tested directly: the rule decides whether
// a person in the middle of the night is warned that what they are looking at
// may not be the truth.

/** How old the last successful sync may be before the roster is flagged stale. */
export const STALE_AFTER_MS = 12 * 60 * 60 * 1000;

/**
 * `rosterSize` is the count for the duty day *before* the region filter — a
 * region with no pharmacy on duty tonight is a normal night, not a data
 * problem.
 *
 * An empty roster counts as stale even when the last sync is recent. The duty
 * day rolls over at 08:00 while the sync runs on its own schedule, so between
 * the two the day's list can simply be missing: the app then said "no pharmacy
 * on duty tonight" in a calm voice, with no notice, while the roster was in
 * fact published and simply not fetched yet. That is the one thing this app
 * must never do.
 */
export function isStale(
  lastSyncedAt: string | null,
  rosterSize: number,
  now: number = Date.now()
): boolean {
  if (rosterSize === 0) return true;
  if (!lastSyncedAt) return true;
  const age = now - new Date(lastSyncedAt).getTime();
  return Number.isNaN(age) || age > STALE_AFTER_MS;
}
