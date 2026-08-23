# Nöbetçi — Northern Cyprus On-Duty Pharmacy Finder

Shows the on-duty ("nöbetçi") pharmacies nearest to the user, on a map and in a
list, with one-tap calling and directions. Mobile-first; built per [SPEC.md](SPEC.md)
and the approved Claude Design prototype.

**Stack:** Next.js (App Router) + TypeScript + Tailwind CSS + Supabase (Postgres) ·
Leaflet + OpenStreetMap · next-intl (`tr` default, `en`).

## Local development (no Supabase needed)

```bash
npm install
npm run dev
```

`.env.local` ships with `MOCK_DATA=1`, which makes `GET /api/on-duty` serve a
fixture roster (`src/lib/mock.ts`) so the full UI — map, bottom sheet, all
states — works without a database. Open `http://localhost:3000/tr`.

```bash
npm test          # unit tests: duty-date boundaries, status derivation, region aliases
```

## Production setup

1. **Supabase:** create a project, run [supabase/schema.sql](supabase/schema.sql)
   in the SQL editor (tables, RLS, `on_duty_nearby`).
2. **Env:** copy `.env.example` → `.env.local` (and to Vercel project settings),
   fill in the Supabase URL/keys and a random `CRON_SECRET`. Remove/ignore
   `MOCK_DATA` in production.
3. **Seed the pharmacy directory** (one-off, re-runnable monthly):
   ```bash
   npm run seed
   ```
   Walks KTEB detail pages `pdp=1..600` politely (concurrency 3, ≥300 ms delay),
   joins regions from the directory page, logs every unmatched name. Hand-correct
   `region` for unmatched rows afterwards; set `coords_manual = true` on any row
   whose coordinates you fix by hand — the scraper will never overwrite them.
4. **Duty roster sync:**
   ```bash
   npm run sync-duty
   ```
   On Vercel, `vercel.json` schedules `GET /api/cron/sync-duty` at 03:00, 09:00
   and 17:00 UTC (≈ 06:00 / 12:00 / 20:00 Nicosia). If fewer than 7 records
   parse, the run is marked `failed` and existing data is left untouched; the
   app then serves the last known roster behind the `stale` banner.

## Key decisions (see SPEC.md for the full rationale)

- **Duty day** rolls over at 08:00 Europe/Nicosia — before 08:00 the app shows
  yesterday's roster. Logic lives only in `src/lib/duty-date.ts` (unit-tested at
  07:59 / 08:00 / 23:59 / 00:01).
- Status badges (`OPEN`, `CLOSING_SOON` <60 min, `ON_CALL`, `CLOSED`) are derived
  client- and server-side from the same `src/lib/status.ts`; `closes_at = 00:00`
  is treated as 24:00.
- The API returns data and status codes only; every display string comes from
  `messages/{tr,en}.json`. Pharmacy names, addresses and region labels stay
  Turkish in both locales (proper nouns / landmark directions).
- The app never talks to kteb.org from the browser; it reads only its own
  database. The user's location is sent as query params for sorting and is
  never stored or logged.
- A service worker caches the last successful `/api/on-duty` response, so the
  last known roster stays visible offline.

## Data source & attribution

Duty data: **Kıbrıs Türk Eczacılar Birliği** — <https://kteb.org/dp/?lang=tr>,
attributed in the footer of every page. Details can change; users are told to
call the pharmacy to confirm before travelling.
