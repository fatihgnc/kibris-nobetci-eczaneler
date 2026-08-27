// SPEC §12: with the scraper deliberately broken, the existing roster must be
// left untouched so the app can keep serving the last known data behind the
// stale flag. Nothing exercised that branch before — the sanity check was only
// verified from the healthy side (a good page clears the threshold).
import { describe, expect, it, vi } from "vitest";

// The stubbed page, or an error to throw instead. Held in a plain variable
// rather than a vi.fn: a spy records the rejected promise it hands back, and
// vitest then reports that recorded rejection as a test failure of its own.
let response: string | Error = "";
vi.mock("../http", async (orig) => ({
  ...(await orig<typeof import("../http")>()),
  fetchHtml: async () => {
    if (response instanceof Error) throw response;
    return response;
  },
}));

import { HttpError, KTEB_BASE } from "../http";
import { MIN_SANE_RECORDS, runDutySync } from "../sync-duty";

/** Minimal Supabase stand-in recording every table operation. */
function fakeDb() {
  const ops: { table: string; op: string; payload?: unknown }[] = [];
  const db = {
    ops,
    from(table: string) {
      return {
        insert(payload: unknown) {
          ops.push({ table, op: "insert", payload });
          return { select: () => ({ single: async () => ({ data: { id: 1 }, error: null }) }) };
        },
        update(payload: unknown) {
          ops.push({ table, op: "update", payload });
          return { eq: async () => ({ error: null }) };
        },
        upsert(payload: unknown) {
          ops.push({ table, op: "upsert", payload });
          return Promise.resolve({ error: null });
        },
        select() {
          ops.push({ table, op: "select" });
          return { in: async () => ({ data: [], error: null }) };
        },
      };
    },
  };
  return db;
}

describe("runDutySync — the scraper is broken (SPEC §12)", () => {
  it("leaves duty_shifts untouched when the page no longer parses", async () => {
    response = "<html><body>Site under maintenance</body></html>";
    const db = fakeDb();

    const result = await runDutySync(db as never);

    expect(result.status).toBe("failed");
    expect(result.rowsWritten).toBe(0);
    expect(result.error).toMatch(/Sanity check failed/);
    // The whole point: no write reaches the roster.
    expect(db.ops.filter((o) => o.table === "duty_shifts")).toHaveLength(0);
    expect(db.ops.filter((o) => o.table === "pharmacies")).toHaveLength(0);
  });

  it("records the failure on the run so the stale flag and alerting can see it", async () => {
    response = "<html><body></body></html>";
    const db = fakeDb();

    await runDutySync(db as never);

    const finish = db.ops.find((o) => o.table === "sync_runs" && o.op === "update");
    expect(finish?.payload).toMatchObject({ status: "failed", rows_written: 0 });
    // No successful run is written, so /api/on-duty keeps ageing the last one.
    expect(db.ops.filter((o) => o.op === "update" && (o.payload as { status: string }).status === "ok")).toHaveLength(0);
  });

  it("fails the same way when the fetch itself throws", async () => {
    response = new HttpError(503, `${KTEB_BASE}/dp/?lang=tr`);
    const db = fakeDb();

    const result = await runDutySync(db as never);

    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/503/);
    expect(db.ops.filter((o) => o.table === "duty_shifts")).toHaveLength(0);
  });

  it("guards at fewer than seven records", () => {
    expect(MIN_SANE_RECORDS).toBe(7);
  });
});
