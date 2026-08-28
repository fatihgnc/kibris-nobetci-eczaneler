// The horizon walk (SPEC §4.3): KTEB publishes weeks ahead behind the duty
// page's date picker, and the sync pulls those days through its postback.
//
// The risk this covers is not a missing day — it is a wrong one. A postback
// the site declines still answers 200 with today's roster, so without the
// date check the app would show today's pharmacies as if they were next
// Tuesday's, to someone planning around them.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const FIXTURE = readFileSync(join(__dirname, "fixtures/duty-list.html"), "utf8");
const FIXTURE_DATE = "23.08.2026"; // the day every card in the fixture carries

/** The fixture re-dated, standing in for the page KTEB returns for that day. */
const pageFor = (ktebDate: string) => FIXTURE.replaceAll(FIXTURE_DATE, ktebDate);

/** Dates the postback was asked for, in order. */
let posted: string[] = [];
/** What a plain GET of the duty page returns. */
let dutyPage = FIXTURE;
/** Given a requested DD.MM.YYYY, the page to answer with (null → throw). */
let answer: (date: string) => string | null = (d) => pageFor(d);

vi.mock("../http", async (orig) => ({
  ...(await orig<typeof import("../http")>()),
  // The politeness delay is real time; a 14-day walk would spend it all
  // waiting on nothing.
  sleep: async () => {},
  fetchHtml: async () => dutyPage,
  postForm: async (_url: string, form: Record<string, string>) => {
    const date = Object.entries(form).find(([k]) => k.endsWith("txtDutyDate"))?.[1] ?? "";
    posted.push(date);
    const html = answer(date);
    if (html === null) throw new Error(`boom for ${date}`);
    return html;
  },
}));

import { runDutySync } from "../sync-duty";

const FIXTURE_IDS = [74, 130, 131, 173, 214, 225, 280, 293, 306, 323, 335, 339, 344, 371, 398];

type Row = { duty_date: string; pharmacy_id: number };

/** Supabase stand-in where every fixture pharmacy is already known. */
function fakeDb() {
  const upserts: Row[] = [];
  const db = {
    upserts,
    from(table: string) {
      return {
        insert() {
          return { select: () => ({ single: async () => ({ data: { id: 1 }, error: null }) }) };
        },
        update() {
          return { eq: async () => ({ error: null }) };
        },
        upsert(payload: unknown) {
          if (table === "duty_shifts") upserts.push(...(payload as Row[]));
          return Promise.resolve({ error: null });
        },
        select() {
          return {
            in: async () => ({
              data: FIXTURE_IDS.map((id) => ({ id, region: "LEFKOSA" })),
              error: null,
            }),
          };
        },
      };
    },
  };
  return db;
}

const daysIn = (rows: Row[]) => [...new Set(rows.map((r) => r.duty_date))].sort();

describe("runDutySync — the coming days", () => {
  beforeEach(() => {
    posted = [];
    dutyPage = FIXTURE;
    answer = (d) => pageFor(d);
  });

  it("walks forward from today and writes each published day", async () => {
    const db = fakeDb();

    const result = await runDutySync(db as never);

    expect(result.status).toBe("ok");
    expect(result.dutyDate).toBe("2026-08-23");
    expect(result.daysCovered).toBe(15); // today + the 14-day cap
    expect(result.horizonEnd).toBe("2026-09-06");
    expect(daysIn(db.upserts)).toEqual([
      "2026-08-23", "2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27",
      "2026-08-28", "2026-08-29", "2026-08-30", "2026-08-31", "2026-09-01",
      "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06",
    ]);
    expect(posted[0]).toBe("24.08.2026");
  });

  it("stops at the first unpublished day instead of asking for the rest", async () => {
    // KTEB answers an unpublished day with the shell of the page and no cards.
    answer = (d) => (d === "26.08.2026" ? "<html><body>Nöbetçi eczane bulunamadı</body></html>" : pageFor(d));
    const db = fakeDb();

    const result = await runDutySync(db as never);

    expect(result.status).toBe("ok");
    expect(daysIn(db.upserts)).toEqual(["2026-08-23", "2026-08-24", "2026-08-25"]);
    expect(posted).toEqual(["24.08.2026", "25.08.2026", "26.08.2026"]);
  });

  it("never stores a day under a date the returned page does not carry", async () => {
    // The postback is ignored: a 200, but still today's roster.
    answer = () => FIXTURE;
    const db = fakeDb();

    const result = await runDutySync(db as never);

    expect(result.status).toBe("ok");
    expect(daysIn(db.upserts)).toEqual(["2026-08-23"]);
    expect(result.daysCovered).toBe(1);
    expect(result.horizonEnd).toBeNull();
  });

  it("keeps walking when one day's request fails", async () => {
    answer = (d) => (d === "25.08.2026" ? null : pageFor(d));
    const db = fakeDb();

    const result = await runDutySync(db as never);

    const days = daysIn(db.upserts);
    expect(days).toContain("2026-08-26");
    expect(days).not.toContain("2026-08-25");
    expect(result.daysCovered).toBe(14); // the horizon minus the failed day
  });

  it("still syncs today when the date picker is gone from the page", async () => {
    dutyPage = FIXTURE.replace(/<input[^>]*txtDutyDate[^>]*>/, "");
    const db = fakeDb();

    const result = await runDutySync(db as never);

    expect(result.status).toBe("ok");
    expect(daysIn(db.upserts)).toEqual(["2026-08-23"]);
    expect(posted).toEqual([]);
  });
});
