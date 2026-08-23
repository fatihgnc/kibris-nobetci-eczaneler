-- Northern Cyprus On-Duty Pharmacy Finder — Supabase schema (SPEC §3)
-- Run in the Supabase SQL editor (or psql) once per environment.

create table if not exists pharmacies (
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

create table if not exists duty_shifts (
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

create index if not exists duty_shifts_duty_date_idx on duty_shifts (duty_date);

create table if not exists sync_runs (
  id           bigserial primary key,
  kind         text not null,                  -- 'seed' | 'duty'
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       text not null,                  -- 'ok' | 'partial' | 'failed'
  rows_written integer default 0,
  error        text
);

-- RLS: anon may only read pharmacies and duty_shifts. All writes go through
-- the service role (scraper), which bypasses RLS.
alter table pharmacies enable row level security;
alter table duty_shifts enable row level security;
alter table sync_runs enable row level security;

drop policy if exists "anon read pharmacies" on pharmacies;
create policy "anon read pharmacies" on pharmacies
  for select to anon using (true);

drop policy if exists "anon read duty_shifts" on duty_shifts;
create policy "anon read duty_shifts" on duty_shifts
  for select to anon using (true);

drop policy if exists "anon read sync_runs" on sync_runs;
create policy "anon read sync_runs" on sync_runs
  for select to anon using (true);

-- Table privileges. RLS decides *which rows* a role may see, but a role still
-- needs a GRANT to touch the table at all — the two are separate layers and
-- both are required. Without these every query fails with 42501.
grant usage on schema public to anon, service_role;

grant select on public.pharmacies  to anon;
grant select on public.duty_shifts to anon;

-- sync_runs is granted per column: the API only needs the last successful run
-- timestamp, and sync_runs.error can contain internal messages that should not
-- be publicly readable.
grant select (finished_at, kind, status) on public.sync_runs to anon;

-- The scrapers and the cron route run as service_role and need full access,
-- including the sequences behind the bigserial primary keys.
grant all on public.pharmacies, public.duty_shifts, public.sync_runs to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Proximity query. PostGIS is unnecessary for ~400 rows; haversine is plenty.
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

grant execute on function on_duty_nearby(date, double precision, double precision) to anon;
