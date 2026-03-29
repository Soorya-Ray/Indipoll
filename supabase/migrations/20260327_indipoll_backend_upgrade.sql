create extension if not exists pgcrypto;

create table if not exists public.stations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  city text not null unique,
  station_name text not null,
  latitude double precision not null,
  longitude double precision not null,
  map_x numeric(5,2) not null check (map_x >= 0 and map_x <= 100),
  map_y numeric(5,2) not null check (map_y >= 0 and map_y <= 100),
  priority smallint not null default 0,
  enabled boolean not null default true,
  region text not null default 'India',
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.stations enable row level security;

create table if not exists public.station_snapshots (
  station_id uuid primary key references public.stations(id) on delete cascade,
  aqi integer not null check (aqi >= 0 and aqi <= 1000),
  pollutants jsonb not null default '{}'::jsonb,
  sources jsonb not null default '{}'::jsonb,
  weather jsonb not null default '{}'::jsonb,
  forecast jsonb not null default '{}'::jsonb,
  shap jsonb not null default '[]'::jsonb,
  data_mode text not null default 'demo' check (data_mode in ('demo', 'waqi', 'hybrid')),
  forecast_mode text not null default 'synthetic' check (forecast_mode in ('synthetic', 'live')),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.station_snapshots enable row level security;

create or replace function public.set_station_snapshot_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_station_snapshot_updated_at on public.station_snapshots;

create trigger set_station_snapshot_updated_at
before update on public.station_snapshots
for each row
execute function public.set_station_snapshot_updated_at();

alter table public.community_reports
  add column if not exists nearest_station_slug text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists source text not null default 'citizen',
  add column if not exists status text not null default 'submitted';

do $$
begin
  alter table public.community_reports
    add constraint community_reports_nearest_station_slug_fkey
    foreign key (nearest_station_slug)
    references public.stations(slug)
    on update cascade
    on delete set null;
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.community_reports
    add constraint community_reports_source_check
    check (source in ('citizen', 'field-team'));
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.community_reports
    add constraint community_reports_status_check
    check (status in ('submitted', 'verified', 'dismissed'));
exception
  when duplicate_object then null;
end
$$;

create index if not exists stations_slug_idx on public.stations(slug);
create index if not exists community_reports_created_at_idx on public.community_reports(created_at desc);
create index if not exists community_reports_nearest_station_slug_idx on public.community_reports(nearest_station_slug);

drop policy if exists stations_public_read on public.stations;
create policy stations_public_read
on public.stations
for select
to anon, authenticated
using (true);

drop policy if exists station_snapshots_public_read on public.station_snapshots;
create policy station_snapshots_public_read
on public.station_snapshots
for select
to anon, authenticated
using (true);

drop policy if exists community_reports_public_read on public.community_reports;
create policy community_reports_public_read
on public.community_reports
for select
to anon, authenticated
using (true);

drop policy if exists community_reports_public_insert on public.community_reports;
create policy community_reports_public_insert
on public.community_reports
for insert
to anon, authenticated
with check (
  status = 'submitted'
  and source in ('citizen', 'field-team')
  and char_length(trim(both from reporter_name)) between 2 and 80
  and char_length(trim(both from city)) > 0
  and char_length(trim(both from category)) > 0
  and char_length(trim(both from description)) between 10 and 400
  and severity between 1 and 5
);

do $$
begin
  alter publication supabase_realtime add table public.community_reports;
exception
  when duplicate_object then null;
  when undefined_object then null;
end
$$;

insert into public.stations (slug, city, station_name, latitude, longitude, map_x, map_y, priority)
values
  ('delhi', 'Delhi', 'Anand Vihar', 28.6469, 77.3153, 47.00, 24.00, 1),
  ('mumbai', 'Mumbai', 'Bandra Kurla Complex', 19.0675, 72.8656, 26.00, 56.00, 2),
  ('kolkata', 'Kolkata', 'Rabindra Bharati', 22.6273, 88.3806, 72.00, 44.00, 3),
  ('bengaluru', 'Bengaluru', 'Silk Board', 12.9176, 77.6238, 39.00, 73.00, 4),
  ('chennai', 'Chennai', 'Manali', 13.1668, 80.2717, 49.00, 84.00, 5),
  ('hyderabad', 'Hyderabad', 'Zoo Park', 17.3496, 78.4513, 41.00, 67.00, 6),
  ('pune', 'Pune', 'Shivajinagar', 18.5314, 73.8446, 29.00, 62.00, 7),
  ('lucknow', 'Lucknow', 'Lalbagh', 26.8467, 80.9462, 55.00, 31.00, 8),
  ('ahmedabad', 'Ahmedabad', 'Navrangpura', 23.0225, 72.5714, 23.00, 45.00, 9),
  ('jaipur', 'Jaipur', 'Adarsh Nagar', 26.9124, 75.7873, 35.00, 28.00, 10)
on conflict (slug) do update
set
  city = excluded.city,
  station_name = excluded.station_name,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  map_x = excluded.map_x,
  map_y = excluded.map_y,
  priority = excluded.priority,
  enabled = true;

with seeded as (
  select
    s.id,
    s.slug,
    s.city,
    case s.slug
      when 'delhi' then 312
      when 'mumbai' then 168
      when 'kolkata' then 204
      when 'bengaluru' then 118
      when 'chennai' then 136
      when 'hyderabad' then 152
      when 'pune' then 109
      when 'lucknow' then 264
      when 'ahmedabad' then 178
      when 'jaipur' then 196
    end as seeded_aqi,
    case s.slug
      when 'delhi' then '{"PM2_5":42,"PM10":24,"NO2":11,"O3":7,"SO2":6,"CO":10}'::jsonb
      when 'mumbai' then '{"PM2_5":33,"PM10":18,"NO2":17,"O3":13,"SO2":7,"CO":12}'::jsonb
      when 'kolkata' then '{"PM2_5":39,"PM10":19,"NO2":15,"O3":8,"SO2":8,"CO":11}'::jsonb
      when 'bengaluru' then '{"PM2_5":28,"PM10":16,"NO2":18,"O3":15,"SO2":7,"CO":16}'::jsonb
      when 'chennai' then '{"PM2_5":30,"PM10":17,"NO2":16,"O3":12,"SO2":11,"CO":14}'::jsonb
      when 'hyderabad' then '{"PM2_5":34,"PM10":19,"NO2":14,"O3":14,"SO2":7,"CO":12}'::jsonb
      when 'pune' then '{"PM2_5":27,"PM10":18,"NO2":16,"O3":16,"SO2":8,"CO":15}'::jsonb
      when 'lucknow' then '{"PM2_5":41,"PM10":22,"NO2":12,"O3":7,"SO2":6,"CO":12}'::jsonb
      when 'ahmedabad' then '{"PM2_5":35,"PM10":21,"NO2":14,"O3":11,"SO2":7,"CO":12}'::jsonb
      when 'jaipur' then '{"PM2_5":37,"PM10":24,"NO2":12,"O3":8,"SO2":6,"CO":13}'::jsonb
    end as seeded_pollutants,
    case s.slug
      when 'delhi' then '{"Vehicles":34,"Industry":26,"Stubble burning":22,"Dust":12,"Residential":6}'::jsonb
      when 'mumbai' then '{"Vehicles":39,"Industry":18,"Shipping":16,"Dust":14,"Residential":13}'::jsonb
      when 'kolkata' then '{"Vehicles":28,"Industry":24,"Stubble burning":19,"Dust":10,"Residential":19}'::jsonb
      when 'bengaluru' then '{"Vehicles":42,"Industry":14,"Dust":15,"DG sets":11,"Residential":18}'::jsonb
      when 'chennai' then '{"Vehicles":26,"Industry":29,"Shipping":18,"Dust":9,"Residential":18}'::jsonb
      when 'hyderabad' then '{"Vehicles":31,"Industry":23,"Dust":21,"Residential":15,"Waste burning":10}'::jsonb
      when 'pune' then '{"Vehicles":37,"Industry":15,"Dust":17,"Residential":17,"Construction":14}'::jsonb
      when 'lucknow' then '{"Vehicles":27,"Industry":21,"Stubble burning":25,"Dust":14,"Residential":13}'::jsonb
      when 'ahmedabad' then '{"Vehicles":29,"Industry":26,"Dust":20,"Residential":13,"Construction":12}'::jsonb
      when 'jaipur' then '{"Vehicles":25,"Industry":19,"Dust":28,"Residential":14,"Construction":14}'::jsonb
    end as seeded_sources
  from public.stations s
)
insert into public.station_snapshots (
  station_id,
  aqi,
  pollutants,
  sources,
  weather,
  forecast,
  shap,
  data_mode,
  forecast_mode
)
select
  seeded.id,
  seeded.seeded_aqi,
  seeded.seeded_pollutants,
  seeded.seeded_sources,
  jsonb_build_object(
    'Temperature', concat(24 + (seeded.seeded_aqi % 10), ' C'),
    'Humidity', concat(35 + (seeded.seeded_aqi % 30), '%'),
    'Wind', concat(6 + (seeded.seeded_aqi % 8), ' km/h'),
    'Rainfall', '0 mm',
    'Pressure', concat(1002 + (seeded.seeded_aqi % 8), ' hPa'),
    'Mixing', case when seeded.seeded_aqi >= 180 then 'Shallow' else 'Moderate' end
  ),
  jsonb_build_object(
    'values', jsonb_build_array(
      seeded.seeded_aqi,
      seeded.seeded_aqi + 6,
      seeded.seeded_aqi + 12,
      seeded.seeded_aqi + 16,
      seeded.seeded_aqi + 12,
      seeded.seeded_aqi + 4,
      seeded.seeded_aqi - 2,
      seeded.seeded_aqi - 8,
      seeded.seeded_aqi - 12,
      seeded.seeded_aqi - 16,
      seeded.seeded_aqi - 20,
      seeded.seeded_aqi - 24
    ),
    'upper', jsonb_build_array(
      seeded.seeded_aqi + 18,
      seeded.seeded_aqi + 24,
      seeded.seeded_aqi + 29,
      seeded.seeded_aqi + 34,
      seeded.seeded_aqi + 30,
      seeded.seeded_aqi + 22,
      seeded.seeded_aqi + 16,
      seeded.seeded_aqi + 10,
      seeded.seeded_aqi + 6,
      seeded.seeded_aqi + 2,
      seeded.seeded_aqi - 3,
      seeded.seeded_aqi - 7
    ),
    'lower', jsonb_build_array(
      greatest(20, seeded.seeded_aqi - 16),
      greatest(20, seeded.seeded_aqi - 12),
      greatest(20, seeded.seeded_aqi - 8),
      greatest(20, seeded.seeded_aqi - 4),
      greatest(20, seeded.seeded_aqi - 8),
      greatest(20, seeded.seeded_aqi - 16),
      greatest(20, seeded.seeded_aqi - 22),
      greatest(20, seeded.seeded_aqi - 28),
      greatest(20, seeded.seeded_aqi - 34),
      greatest(20, seeded.seeded_aqi - 38),
      greatest(20, seeded.seeded_aqi - 42),
      greatest(20, seeded.seeded_aqi - 46)
    )
  ),
  jsonb_build_array(
    jsonb_build_object('feature', 'PM2.5 load', 'impact', 'up', 'text', seeded.city || ' fine particle burden is setting the near-term baseline.'),
    jsonb_build_object('feature', 'Transport emissions', 'impact', 'up', 'text', 'Vehicular and corridor emissions remain a major contributor in this forecast window.'),
    jsonb_build_object('feature', 'Boundary-layer mixing', 'impact', case when seeded.seeded_aqi >= 180 then 'up' else 'down' end, 'text', case when seeded.seeded_aqi >= 180 then 'Shallow mixing is likely to trap pollution close to the surface.' else 'Moderate mixing should soften peak AQI through the afternoon.' end),
    jsonb_build_object('feature', 'Weather stability', 'impact', 'down', 'text', 'Forecast uncertainty narrows when wind conditions stay steady through the next 24 hours.')
  ),
  'demo',
  'synthetic'
from seeded
on conflict (station_id) do update
set
  aqi = excluded.aqi,
  pollutants = excluded.pollutants,
  sources = excluded.sources,
  weather = excluded.weather,
  forecast = excluded.forecast,
  shap = excluded.shap,
  data_mode = excluded.data_mode,
  forecast_mode = excluded.forecast_mode,
  updated_at = timezone('utc', now());

create or replace view public.station_dashboard
with (security_invoker = true)
as
select
  s.slug,
  s.city,
  s.station_name,
  s.latitude,
  s.longitude,
  s.map_x,
  s.map_y,
  s.priority,
  s.enabled,
  ss.aqi,
  ss.pollutants,
  ss.sources,
  ss.weather,
  ss.forecast,
  ss.shap,
  ss.data_mode,
  ss.forecast_mode,
  ss.updated_at
from public.stations s
left join public.station_snapshots ss on ss.station_id = s.id
where s.enabled = true;
