import { describe, expect, it } from "vitest";
import { dutyDateFor, dutyMinutesFor, nicosiaParts } from "../duty-date";

// Europe/Nicosia is UTC+3 in August (EEST) and UTC+2 in winter (EET).
const utc = (s: string) => new Date(s);

describe("dutyDateFor — rollover boundaries (SPEC §5)", () => {
  it("07:59 local → duty day is yesterday", () => {
    // 2026-08-23 07:59 Nicosia == 04:59 UTC
    expect(dutyDateFor(utc("2026-08-23T04:59:00Z"))).toBe("2026-08-22");
  });

  it("08:00 local → duty day is today", () => {
    expect(dutyDateFor(utc("2026-08-23T05:00:00Z"))).toBe("2026-08-23");
  });

  it("23:59 local → duty day is today", () => {
    // 2026-08-23 23:59 Nicosia == 20:59 UTC
    expect(dutyDateFor(utc("2026-08-23T20:59:00Z"))).toBe("2026-08-23");
  });

  it("00:01 local → duty day is still yesterday", () => {
    // 2026-08-24 00:01 Nicosia == 2026-08-23 21:01 UTC
    expect(dutyDateFor(utc("2026-08-23T21:01:00Z"))).toBe("2026-08-23");
  });

  it("handles the winter offset (UTC+2)", () => {
    // 2026-01-10 07:59 Nicosia == 05:59 UTC
    expect(dutyDateFor(utc("2026-01-10T05:59:00Z"))).toBe("2026-01-09");
    expect(dutyDateFor(utc("2026-01-10T06:00:00Z"))).toBe("2026-01-10");
  });

  it("crosses month boundaries correctly", () => {
    // 2026-09-01 01:30 Nicosia == 2026-08-31 22:30 UTC
    expect(dutyDateFor(utc("2026-08-31T22:30:00Z"))).toBe("2026-08-31");
  });
});

describe("dutyMinutesFor", () => {
  it("counts past midnight relative to the duty day", () => {
    // 01:30 local → 25.5h since duty-day midnight
    expect(dutyMinutesFor(utc("2026-08-23T22:30:00Z"))).toBe(25 * 60 + 30);
  });

  it("is plain minutes during the day", () => {
    // 21:10 local
    expect(dutyMinutesFor(utc("2026-08-23T18:10:00Z"))).toBe(21 * 60 + 10);
  });
});

describe("nicosiaParts", () => {
  it("converts UTC to Nicosia wall clock", () => {
    const p = nicosiaParts(utc("2026-08-23T21:01:00Z"));
    expect(p).toMatchObject({ year: 2026, month: 8, day: 24, hour: 0, minute: 1 });
  });
});
