// The date strip's chip labels. A day is identified here by two or three
// characters, so the parts have to be right in both locales — and the day
// number must never drift by one, which is the failure a UTC-midnight Date
// would produce for a timezone east of Greenwich.
import { describe, expect, it } from "vitest";
import { formatDayChipParts } from "../format";

describe("formatDayChipParts", () => {
  it("splits a day into weekday, day and month", () => {
    expect(formatDayChipParts("2026-08-31", "tr")).toEqual({
      weekday: "Pzt",
      day: "31",
      month: "Ağu",
    });
  });

  it("names the same calendar day in English", () => {
    const { weekday, day } = formatDayChipParts("2026-08-31", "en");
    expect(weekday).toBe("Mon");
    expect(day).toBe("31");
  });

  it("does not shift the day at a month boundary", () => {
    // Nicosia is UTC+3, so a date parsed at UTC midnight and rendered locally
    // would still read "1 September" — but one parsed at local midnight and
    // rendered in UTC would fall back to 31 August. Noon anchoring avoids both.
    expect(formatDayChipParts("2026-09-01", "tr")).toMatchObject({ day: "1", month: "Eyl" });
    expect(formatDayChipParts("2026-01-01", "tr")).toMatchObject({ day: "1", month: "Oca" });
    expect(formatDayChipParts("2026-12-31", "tr")).toMatchObject({ day: "31", month: "Ara" });
  });

  it("holds across the autumn DST change", () => {
    // Nicosia leaves EEST on the last Sunday of October.
    expect(formatDayChipParts("2026-10-25", "tr").day).toBe("25");
    expect(formatDayChipParts("2026-10-26", "tr").day).toBe("26");
  });
});
