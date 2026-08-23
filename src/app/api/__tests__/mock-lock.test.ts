import { afterEach, describe, expect, it, vi } from "vitest";

// The mock fixture must never be reachable in production: this endpoint decides
// which pharmacy someone is told to call at night.
describe("mock data production lock", () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
    vi.resetModules();
  });

  // Mirrors the guard in src/app/api/on-duty/route.ts
  const shouldServeMock = () =>
    process.env.MOCK_DATA === "1" && process.env.NODE_ENV !== "production";

  it("serves the fixture in development when the flag is on", () => {
    process.env.MOCK_DATA = "1";
    (process.env as Record<string, string>).NODE_ENV = "development";
    expect(shouldServeMock()).toBe(true);
  });

  it("refuses the fixture in production even with the flag on", () => {
    process.env.MOCK_DATA = "1";
    (process.env as Record<string, string>).NODE_ENV = "production";
    expect(shouldServeMock()).toBe(false);
  });

  it("stays off when the flag is absent", () => {
    delete process.env.MOCK_DATA;
    (process.env as Record<string, string>).NODE_ENV = "development";
    expect(shouldServeMock()).toBe(false);
  });
});

describe("fixture phone numbers", () => {
  it("are unreachable placeholders, never realistic numbers", async () => {
    const { mockOnDuty } = await import("@/lib/mock");
    const { pharmacies } = mockOnDuty(null, null);
    expect(pharmacies.length).toBeGreaterThan(0);
    for (const p of pharmacies) {
      expect(p.phone).toMatch(/^\(0392\) 000 00 \d{2}$/);
    }
  });
});
