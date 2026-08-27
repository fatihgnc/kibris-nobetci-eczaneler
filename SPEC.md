# SPEC — Northern Cyprus On-Duty Pharmacy Finder

**Version:** 1.1
**Stack:** Next.js (App Router) + TypeScript + Tailwind CSS + Supabase (Postgres)
**Scope:** Northern Cyprus (KKTC) only. The Republic of Cyprus is out of scope.
**Locales:** Turkish (`tr`, default) and English (`en`).

> **Language convention used in this document and in the codebase:** all
> technical terms, identifiers, table names, enum values, and code comments are
> in English. Proper nouns — region names, pharmacy names, street addresses, the
> source organisation's name — remain in Turkish and are never translated.

---

## 1. Goal

Show the user the on-duty ("nöbetçi") pharmacies nearest to their location, on a
map and in a list, with one-tap calling and directions.

Primary scenario: night-time, mobile, hurried, one-handed use.

Success criterion: within **10 seconds** of opening the app, the user has seen
the nearest on-duty pharmacy and can call it.

---

## 2. Data source and discovery findings

Single source: **Kıbrıs Türk Eczacılar Birliği (KTEB)** — `https://www.kteb.org`

The site is ASP.NET WebForms (`__doPostBack`, ViewState). There is no official
API, so HTML must be parsed. The findings below were verified manually.

### 2.1. Duty list page

`GET https://www.kteb.org/dp/?lang=tr`

- Returns today's on-duty pharmacies, grouped under region headings.
- Heading format: `LEFKOŞA BÖLGESİ`, `GİRNE BÖLGESİ`, `MAĞUSA BÖLGESİ`,
  `GÜZELYURT BÖLGESİ`, `LEFKE BÖLGESİ`, `ÜST MESARYA BÖLGESİ`,
  `ALT MESARYA BÖLGESİ`, `İSKELE BÖLGESİ`, `KARPAZ BÖLGESİ`.
  **Note the inconsistency:** the heading says `MAĞUSA` while the pharmacy list
  page (§2.3) says `GAZİMAĞUSA`. These must be normalised to one value.
- Each pharmacy card contains:
  - Pharmacy name (e.g. `BUSE AVCI ECZANESİ`)
  - Date: `23.08.2026 (Pazar)` — `dd.MM.yyyy (DayName)`
  - Hours: `08:00 - 00:00`
  - Alternate hours format: `08:00 - 22:00 (22:00 - 00:00 On-Call)`
  - Phone: `(0392) 227 46 87`. **Some cards carry two numbers** separated by
    `-`: `(0392) 371 35 02  -  (0533) 868 43 72`
  - Address (free text, often contains landmark directions)
  - Detail link: `PharmacyDetail.aspx?lang=tr&pdp=398`

The `pdp` value is a **stable pharmacy identifier**. It is the primary key for
this system.

The page also exists at `?lang=en`, but only the site chrome is translated —
pharmacy names and addresses are Turkish either way. **Scrape the `tr` version
only.**

### 2.2. Pharmacy detail page — COORDINATES ARE HERE

`GET https://www.kteb.org/PharmacyDetail.aspx?lang=tr&pdp={id}`

Contains:

- Pharmacy name (heading)
- Address, phone, email, responsible pharmacist (table)
- **Coordinates, embedded in a Google Maps iframe URL:**
  `https://maps.google.com/maps?q=35.192755095975556,33.36720351774912&hl=tr&z=16&output=embed`

**Therefore no geocoding service is required.** Extract with
`maps\.google\.com/maps\?q=(-?\d+\.\d+),(-?\d+\.\d+)`.

The detail page does **not** contain the region.

### 2.3. Full pharmacy directory

`GET https://www.kteb.org/lists/pharmacylist/?lang=tr`

- All ~400 pharmacies on a single page as a table. No pagination.
- Columns: `S/N | ECZANE ADI | BÖLGE | ADRES | TELEFON NO | YETKİLİ KİŞİ`
- **No `pdp` link.** The region must be taken from here and joined to the detail
  data by normalised name (see §4.2).
- The region filter requires `__doPostBack`; since the unfiltered page already
  returns everything, no POST is needed.

### 2.4. Future-dated duty roster (to investigate)

`https://www.kteb.org/lists/dplist/?lang=tr` may expose the duty roster for
future dates. Investigate during development. If future dates are retrievable,
write them into `duty_shifts` ahead of time — the app then survives a broken
scraper for days rather than hours, which is a large resilience win. If not
retrievable, this is out of v1 scope.

---

## 3. Database schema (Supabase / Postgres)

```sql
create table pharmacies (
  id            integer primary key,           -- KTEB pdp value
  name          text not null,                 -- Turkish, as published
  name_norm     text not null,                 -- normalised, for name matching
  region        text,                          -- normalised region code, §4.1
  address       text,                          -- Turkish, as published
  phone         text,
  phone_alt     text,
  email         text,
  lat           double precision,
  lng           double precision,
  coords_manual boolean not null default false, -- if true, scraper must not overwrite
  is_active     boolean not null default true,
  updated_at    timestamptz not null default now()
);

create table duty_shifts (
  id          bigserial primary key,
  duty_date   date not null,
  pharmacy_id integer not null references pharmacies(id),
  region      text not null,
  hours_raw   text not null,                   -- verbatim source text
  opens_at    time,
  closes_at   time,
  oncall_from time,                            -- set when "(22:00 - 00:00 On-Call)" present
  oncall_to   time,
  created_at  timestamptz not null default now(),
  unique (duty_date, pharmacy_id)
);

create index on duty_shifts (duty_date);

create table sync_runs (
  id           bigserial primary key,
  kind         text not null,                  -- 'seed' | 'duty'
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       text not null,                  -- 'ok' | 'partial' | 'failed'
  rows_written integer default 0,
  error        text
);
```

**RLS:** grant the anon role `select` only, on `pharmacies` and `duty_shifts`.
All writes go through the service role (scraper).

**Proximity query:** PostGIS is unnecessary for ~400 rows; haversine in SQL is
plenty.

```sql
create or replace function on_duty_nearby(
  p_date date,
  p_lat  double precision default null,
  p_lng  double precision default null
) returns table (
  pharmacy_id integer, name text, region text, address text,
  phone text, phone_alt text, lat double precision, lng double precision,
  hours_raw text, opens_at time, closes_at time,
  oncall_from time, oncall_to time, distance_km double precision
) language sql stable as $$
  select p.id, p.name, d.region, p.address, p.phone, p.phone_alt, p.lat, p.lng,
         d.hours_raw, d.opens_at, d.closes_at, d.oncall_from, d.oncall_to,
         case when p_lat is null or p.lat is null then null else
           6371 * acos(least(1,
             cos(radians(p_lat)) * cos(radians(p.lat)) *
             cos(radians(p.lng) - radians(p_lng)) +
             sin(radians(p_lat)) * sin(radians(p.lat))))
         end as distance_km
  from duty_shifts d
  join pharmacies p on p.id = d.pharmacy_id
  where d.duty_date = p_date
  order by distance_km nulls last, d.region, p.name;
$$;
```

---

## 4. Scrapers

Libraries: `cheerio` + `fetch`. Run with `tsx`.

### 4.1. Region normalisation

Keep a single source of truth. Enum codes are ASCII; **display labels stay in
Turkish in both locales**, because region names are proper nouns.

```ts
type RegionCode =
  | 'LEFKOSA'
  | 'GIRNE'
  | 'GAZIMAGUSA'
  | 'GUZELYURT'
  | 'LEFKE'
  | 'UST_MESARYA'
  | 'ALT_MESARYA'
  | 'ISKELE'
  | 'KARPAZ';

const REGION_LABEL: Record<RegionCode, string> = {
  LEFKOSA: 'Lefkoşa',
  GIRNE: 'Girne',
  GAZIMAGUSA: 'Gazimağusa',
  GUZELYURT: 'Güzelyurt',
  LEFKE: 'Lefke',
  UST_MESARYA: 'Üst Mesarya',
  ALT_MESARYA: 'Alt Mesarya',
  ISKELE: 'İskele',
  KARPAZ: 'Karpaz',
};
```

The alias map must absorb the Turkish variants (`MAĞUSA`, `GAZİMAĞUSA`, case
differences, the trailing `BÖLGESİ`). When normalising Turkish text use
`toLocaleLowerCase('tr-TR')` — beware the dotted/dotless `I/ı/İ/i` trap, which
silently breaks naive matching.

### 4.2. Seed script — `scripts/seed-pharmacies.ts`

One-off, but re-runnable monthly.

1. Walk detail pages for `pdp = 1 .. N` (N ≈ 600, leave headroom).
   - Concurrency **max 3**, with a ≥300 ms delay between requests. Do not
     hammer the KTEB server.
   - Treat 404 / empty page as skip, not error.
   - Set a `User-Agent` that includes contact info
     (e.g. `KKTCEczaneApp/1.0 (+mailto:...)`) — polite scraping.
2. Extract per page: name, address, phone(s), email, lat, lng.
3. Fetch the directory page and build a `name_norm → region` dictionary.
4. Join by normalised name. **Log every unmatched name to the console** and
   store it with `region = null`; the app still shows such pharmacies.
   Watch for parenthesised variants like
   `YUSUF TANDOĞAN ECZANESİ (LEFKOŞA)` — strip the parenthetical before matching.
5. Upsert into `pharmacies`. **Rows with `coords_manual = true` must never have
   their `lat`/`lng` overwritten.**

### 4.3. Duty sync script — `scripts/sync-duty.ts`

Runs three times a day (§6).

1. Fetch `/dp/?lang=tr`.
2. For every `<a>` whose href contains `PharmacyDetail.aspx`:
   - Read `pdp` from the href → `pharmacy_id`.
   - From the enclosing card's text, extract:
     - date: `/(\d{2})\.(\d{2})\.(\d{4})/`
     - hours: `/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/`
     - on-call: `/\((\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})\s*On-?Call\)/i`
   - Region: from the nearest preceding `... BÖLGESİ` heading.
     **Fallback:** if the heading cannot be parsed, use `pharmacies.region`.
3. If an unknown `pdp` appears, fetch that detail page on the spot, insert into
   `pharmacies`, then continue. This covers newly opened pharmacies.
4. Upsert into `duty_shifts` on `(duty_date, pharmacy_id)`.
5. Record the outcome in `sync_runs`.

**Sanity check:** if fewer than **7** records parse, mark the run `failed` and
**do not delete existing data**. Northern Cyprus has at least nine regions
covered every day; a count below seven is almost certainly a parsing failure,
not a real roster.

---

## 5. Duty-day logic — CRITICAL

Shifts cross midnight. Get this wrong and the app shows an empty list at 01:00,
losing all of its value at exactly the moment it matters most.

- Fixed timezone: **`Europe/Nicosia`**. The server may run in UTC — never trust
  the local `new Date()`.
- Rule: if the local Nicosia time is **before 08:00, the duty day is yesterday**;
  otherwise it is today.
- This logic lives in exactly one place, `lib/duty-date.ts`, and **must have unit
  tests** covering the boundaries: 07:59, 08:00, 23:59, 00:01.

### Status derivation (drives the UI badge)

Evaluated against the current Nicosia time:

| Status         | Condition                           |
| -------------- | ----------------------------------- |
| `OPEN`         | `opens_at ≤ now < closes_at`        |
| `CLOSING_SOON` | less than 60 minutes to `closes_at` |
| `ON_CALL`      | `oncall_from ≤ now < oncall_to`     |
| `CLOSED`       | anything else                       |

A `closes_at` of `00:00` means **midnight at the end of the duty day**; treat it
as 24:00 when comparing.

---

## 6. API and scheduling

### Endpoints

**`GET /api/on-duty`**

- Query: `lat`, `lng` (optional), `region` (optional), `date` (optional,
  defaults to the duty day computed per §5)
- Response:

```json
{
  "dutyDate": "2026-08-23",
  "lastSyncedAt": "2026-08-23T06:00:00Z",
  "stale": false,
  "pharmacies": [
    {
      "id": 398,
      "name": "BUSE AVCI ECZANESİ",
      "region": "LEFKOSA",
      "address": "...",
      "phone": "(0392) 227 46 87",
      "phoneAlt": null,
      "lat": 35.192755,
      "lng": 33.367203,
      "hoursRaw": "08:00 - 00:00",
      "opensAt": "08:00",
      "closesAt": "00:00",
      "onCall": null,
      "status": "OPEN",
      "distanceKm": 2.4
    }
  ]
}
```

- The API returns **data and status codes only, never display strings** —
  all user-facing text is resolved client-side from the locale bundles (§8).
- `stale`: `true` when the last successful sync is more than 12 hours old.
- Cache: `s-maxage=300, stale-while-revalidate=3600`.

**`GET /api/cron/sync-duty`**

- Protected by a `CRON_SECRET` header. Invokes the `scripts/sync-duty.ts` logic.

### Scheduling (`.github/workflows/sync-duty.yml`)

`03:00`, `09:00`, `17:00` UTC — roughly 06:00 / 12:00 / 20:00 in Nicosia. The
morning run guarantees the day's roster is in place before pharmacies open.

Scheduled from GitHub Actions rather than Vercel Cron: the Vercel Hobby plan
caps a project at a couple of jobs running about once a day, which cannot cover
three runs. GitHub also emails the owner when a run fails, which serves as the
alerting for a scraper that otherwise fails silently.

---

## 7. Frontend

- Map: **MapLibre GL JS** or **Leaflet with OpenStreetMap tiles**. Do not use
  the Google Maps JS API — it adds cost and key management for no benefit here.
  Load with `dynamic(..., { ssr: false })`.
- Location: `navigator.geolocation`. **Render a full page before requesting
  permission** — without coordinates the app still works via region selection.
  Permission denial is a normal path, not an error state.
- Actions:
  - Call → `tel:` link, with parentheses and spaces stripped from the number
  - Directions → `https://www.google.com/maps/dir/?api=1&destination={lat},{lng}`
- Sorting: by distance when coordinates are available, otherwise region then name.
- URL state: `?region=GIRNE` must be shareable. Locale lives in the path (§8).
- PWA: manifest plus a service worker caching the last successful response, so
  the last known roster is still visible with no connectivity.

---

## 8. Internationalisation

Two locales: **`tr` (default)** and **`en`**.

- Library: `next-intl` with App Router locale segments — `/tr/...`, `/en/...`.
- Initial locale from `Accept-Language`, then persisted in a cookie. The user can
  switch it from the header; the choice must survive navigation and reload.
- Message bundles: `messages/tr.json`, `messages/en.json`. **No hardcoded
  user-facing strings anywhere in components.**
- `<html lang>` must reflect the active locale.

### What is translated, and what is not

| Content                                                   | Behaviour                                                                                                             |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| UI chrome, buttons, status badges, empty and error states | Translated                                                                                                            |
| Region labels                                             | **Always Turkish** — proper nouns (`Lefkoşa`, `Gazimağusa`)                                                           |
| Pharmacy names                                            | **Always Turkish**, verbatim from the source                                                                          |
| Addresses                                                 | **Always Turkish**, verbatim — they contain landmark directions that would become useless or misleading if translated |
| Attribution, "Kıbrıs Türk Eczacılar Birliği"              | **Always Turkish** — organisation name                                                                                |
| Dates, times, distances                                   | Formatted per locale via `Intl`                                                                                       |

The English locale exists mainly for tourists, students, and expatriate
residents, who are a substantial share of the night-time audience. They need to
navigate the interface, but they will show the Turkish address to a taxi driver —
so keep source data untouched.

### Locale-sensitive formatting

- Dates: `Intl.DateTimeFormat` with `Europe/Nicosia`.
- Distances: `2,4 km` in `tr`, `2.4 km` in `en` — use `Intl.NumberFormat`, do not
  hand-roll separators.
- Duty day heading, e.g. `tr`: "23 Ağustos Pazar gecesi nöbeti" /
  `en`: "Night duty, Sunday 23 August".
- Turkish text must never be lowercased or uppercased with the invariant locale;
  always pass `'tr-TR'`.

---

## 9. Non-functional requirements

- The app **never** requests kteb.org directly; it reads only from its own
  database.
- If the scraper fails, the app keeps serving the last known data with the
  `stale` flag raised. It must never show a blank screen.
- Scale is small: ~400 pharmacies, ~15 duty rows per day. Do not optimise.
- Accessibility: the map is for sighted users, so **the list must be fully
  functional on its own** and usable with a keyboard and a screen reader.

---

## 10. Legal and ethical

- Visible attribution on every page: **"Kıbrıs Türk Eczacılar Birliği"**,
  linked to `https://kteb.org/dp/?lang=tr`. Present in both locales.
- Visible warning, translated:
  `tr`: "Bilgiler değişebilir; gitmeden önce eczaneyi telefonla arayarak teyit ediniz."
  `en`: "Details can change — call the pharmacy to confirm before travelling."
- No medical advice and no medicine information.
- Emailing KTEB before launch is recommended. They publish an official app of
  their own, so a good-faith notice costs nothing and keeps the door open for
  cooperation on data access later.
- The user's location **never leaves the device**. Distances are computed
  client-side over the day's ~15 pharmacies, so `lat`/`lng` are not sent to the
  API at all — a hosting platform logs request URLs including the query string,
  which would put coordinates in the logs by construction. The API still accepts
  the parameters (§6) but the app does not use them.

---

## 11. Build order

1. Schema, RLS, and the `on_duty_nearby` function
2. `lib/duty-date.ts` with unit tests (§5) — **first, because everything else
   depends on it**
3. `seed-pharmacies.ts`; run it fully and hand-correct unmatched regions
4. `sync-duty.ts` with the sanity check
5. `/api/on-duty`
6. i18n scaffolding and message bundles — **before building the UI**, since
   retrofitting translations into finished components is far more work
7. List UI (no map, fully functional)
8. Map layer
9. Cron, `stale` banner, PWA

---

## 12. Acceptance criteria

All verified on 2026-08-27 against the live database and the running app.
Timing-dependent criteria were checked by evaluating the pure functions at the
relevant instant rather than by waiting for it; UI criteria were measured in
the DOM.

- [x] Opened at 01:30, the app shows the previous day's roster
      — `dutyDateFor()` at 01:30 local returns the previous date (unit tests
      cover both DST offsets), and the roster for that date comes back with
      the expected shifts
- [x] With location granted, the list sorts by distance, nearest first
      — with the position fixed at Gazimağusa the list ordered 0.0 / 2.4 / 18 /
      28 / 43 km and the heading switched to "Size en yakın"
- [x] With location denied, the app is fully usable via region selection
      — selecting Girne narrowed the list to that region, put it in the URL,
      and left the other pharmacies on the map dimmed
- [x] "Call" opens the dialler with the correct number
      — every phone number in a real duty roster produces a well-formed `tel:`
      href; none is missing
- [x] "Directions" resolves to the correct coordinates
      — every pharmacy on a real roster has coordinates and its Maps URL
      carries them unchanged
- [x] A pharmacy in its on-call window is not labelled as open
      — a shift open 08:00–22:00 with the pharmacist on call to midnight reads
      OPEN at 21:00, CLOSING_SOON at 21:30, ON_CALL at 22:30 and 23:30, CLOSED
      at 01:30
- [x] With the scraper deliberately broken, the app serves the last known data
      behind a `stale` notice
      — `runDutySync` against an unparseable page and against a failing fetch
      writes nothing to `duty_shifts` and marks the run failed
      (`scrape/__tests__/sync-duty.test.ts`); the banner renders in both
      locales
- [x] Every region has at least one listed pharmacy (data integrity check)
      — 432 pharmacies, all nine regions populated (Lefkoşa 168 … Karpaz 8),
      no NULL region
- [x] Attribution and the confirmation warning are visible in both locales
- [x] Switching to English translates the interface while pharmacy names,
      addresses, and region labels remain in Turkish
      — "On duty tonight / 13 pharmacies / Call / Directions" alongside
      "Gönyeli Yıldız Eczanesi, Lefkoşa, Atatürk Cd."
- [x] The locale choice survives reload and is reflected in `<html lang>`
      — `NEXT_LOCALE=en` persists, `/` resolves to `/en`, `<html lang="en">`

The run also surfaced a failure mode none of the criteria named: the duty day
rolls over at 08:00 while the sync runs on its own schedule, so the app can
ask for a date nothing has written yet. It then reported an empty roster as a
quiet night, with no notice, because the stale flag only measured the age of
the last sync. An empty roster now counts as stale (§6), and the sync runs
again just after the rollover.
