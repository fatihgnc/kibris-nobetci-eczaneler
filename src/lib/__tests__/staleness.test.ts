import { describe, expect, it } from "vitest";
import { isStale, STALE_AFTER_MS } from "../staleness";

const now = new Date("2026-08-27T08:30:00+03:00").getTime();
const agoMs = (ms: number) => new Date(now - ms).toISOString();

describe("isStale", () => {
  it("is not stale with a recent sync and a roster to show", () => {
    expect(isStale(agoMs(2 * 3600_000), 13, now)).toBe(false);
  });

  it("is stale once the last successful sync is over twelve hours old", () => {
    expect(isStale(agoMs(STALE_AFTER_MS + 60_000), 13, now)).toBe(true);
    expect(isStale(agoMs(STALE_AFTER_MS - 60_000), 13, now)).toBe(false);
  });

  it("is stale when nothing has ever synced", () => {
    expect(isStale(null, 13, now)).toBe(true);
  });

  it("is stale on an empty roster even when the sync just ran", () => {
    // The morning gap: the duty day rolled over at 08:00, the sync that would
    // fill it has not run, and the last one still looks fresh. Without this the
    // app tells people there is no pharmacy on duty tonight and means it.
    expect(isStale(agoMs(90 * 60_000), 0, now)).toBe(true);
  });

  it("is stale on an empty roster with no sync at all", () => {
    expect(isStale(null, 0, now)).toBe(true);
  });

  it("survives an unparseable timestamp rather than reading it as fresh", () => {
    expect(isStale("not a date", 13, now)).toBe(true);
  });
});
