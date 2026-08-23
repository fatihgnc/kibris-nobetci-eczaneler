import { describe, expect, it } from "vitest";
import { deriveStatus, timeToMinutes } from "../status";

const shift = (opensAt: string | null, closesAt: string | null, oncallFrom: string | null = null, oncallTo: string | null = null) => ({
  opensAt,
  closesAt,
  oncallFrom,
  oncallTo,
});

const min = (h: number, m = 0) => h * 60 + m;

describe("deriveStatus", () => {
  it("OPEN inside the window", () => {
    expect(deriveStatus(shift("08:00", "00:00"), min(21, 10))).toBe("OPEN");
  });

  it("closes_at 00:00 means 24:00 — still OPEN at 22:59", () => {
    expect(deriveStatus(shift("08:00", "00:00"), min(22, 59))).toBe("OPEN");
  });

  it("CLOSING_SOON under 60 minutes to close", () => {
    expect(deriveStatus(shift("08:00", "22:00"), min(21, 10))).toBe("CLOSING_SOON");
    expect(deriveStatus(shift("08:00", "00:00"), min(23, 30))).toBe("CLOSING_SOON");
  });

  it("exactly 60 minutes left is still OPEN", () => {
    expect(deriveStatus(shift("08:00", "22:00"), min(21, 0))).toBe("OPEN");
  });

  it("ON_CALL in the on-call window — never labelled open", () => {
    const s = shift("08:00", "22:00", "22:00", "00:00");
    expect(deriveStatus(s, min(22, 30))).toBe("ON_CALL");
    expect(deriveStatus(s, min(23, 59))).toBe("ON_CALL");
  });

  it("on-call window ends at 24:00 when oncall_to is 00:00", () => {
    const s = shift("08:00", "22:00", "22:00", "00:00");
    expect(deriveStatus(s, min(24, 0))).toBe("CLOSED"); // 00:00 next day
  });

  it("CLOSED before opening", () => {
    expect(deriveStatus(shift("08:00", "22:00"), min(7, 30))).toBe("CLOSED");
  });

  it("CLOSED after close with no on-call window", () => {
    expect(deriveStatus(shift("08:00", "19:00"), min(21, 0))).toBe("CLOSED");
  });

  it("CLOSED at 01:30 (25.5h) for a shift ending midnight", () => {
    expect(deriveStatus(shift("08:00", "00:00"), min(25, 30))).toBe("CLOSED");
  });

  it("handles missing times", () => {
    expect(deriveStatus(shift(null, null), min(12, 0))).toBe("CLOSED");
  });
});

describe("timeToMinutes", () => {
  it("parses HH:MM and HH:MM:SS", () => {
    expect(timeToMinutes("08:00")).toBe(480);
    expect(timeToMinutes("22:30:00")).toBe(1350);
    expect(timeToMinutes(null)).toBeNull();
  });
});
