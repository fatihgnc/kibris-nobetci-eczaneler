// The stale stamp on the embed. It is read on someone else's page by someone
// deciding whether to trust the list, so the shape must never vary.
import { describe, expect, it } from "vitest";
import { formatStamp } from "../format";

describe("formatStamp", () => {
  it("prints DD.MM.YYYY HH:MM in Nicosia time", () => {
    // 11:05 UTC is 14:05 in Nicosia in September (UTC+3).
    expect(formatStamp("2026-09-02T11:05:00Z")).toBe("02.09.2026 14:05");
  });

  it("zero-pads and crosses the day boundary correctly", () => {
    // 22:30 UTC on the 1st is 00:30 on the 2nd in Nicosia (UTC+2 in winter).
    expect(formatStamp("2026-01-01T22:30:00Z")).toBe("02.01.2026 00:30");
  });

  it("never prints 24 for midnight", () => {
    expect(formatStamp("2026-06-30T21:00:00Z")).toBe("01.07.2026 00:00");
  });
});
