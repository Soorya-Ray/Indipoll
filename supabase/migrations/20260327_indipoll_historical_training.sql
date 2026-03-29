create table if not exists public.station_observations (
  station_id uuid not null references public.stations(id) on delete cascade,
  observed_at timestamptz not null,
  aqi integer not null check (aqi >= 0 and aqi <= 1000),
  pollutants jsonb not null default '{}'::jsonb,
  sources jsonb not null default '{}'::jsonb,
  weather jsonb not null default '{}'::jsonb,
  features jsonb not null default '{}'::jsonb,
  data_mode text not null default 'demo' check (data_mode in ('demo', 'waqi', 'hybrid')),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (station_id, observed_at)
);

alter table public.station_observations enable row level security;

create index if not exists station_observations_station_time_idx
  on public.station_observations (station_id, observed_at desc);

create index if not exists station_observations_time_idx
  on public.station_observations (observed_at desc);

create table if not exists public.model_artifacts (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  is_active boolean not null default false,
  trained_at timestamptz not null,
  data_source text not null,
  sample_count integer not null default 0,
  station_count integer not null default 0,
  lookback_steps smallint not null,
  horizon_steps smallint not null,
  metrics jsonb not null default '{}'::jsonb,
  artifact jsonb not null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.model_artifacts enable row level security;

create unique index if not exists model_artifacts_single_active_idx
  on public.model_artifacts ((is_active))
  where is_active = true;

alter table public.station_snapshots
  add column if not exists model_metadata jsonb not null default '{}'::jsonb;

with current_snapshot as (
  select
    ss.station_id,
    date_trunc('hour', timezone('utc', now())) as observed_at,
    ss.aqi,
    ss.pollutants,
    ss.sources,
    ss.weather,
    jsonb_build_object(
      'aqi', ss.aqi,
      'pm25', coalesce((ss.pollutants ->> 'PM2_5')::numeric, 0),
      'pm10', coalesce((ss.pollutants ->> 'PM10')::numeric, 0),
      'no2', coalesce((ss.pollutants ->> 'NO2')::numeric, 0),
      'o3', coalesce((ss.pollutants ->> 'O3')::numeric, 0),
      'humidity', regexp_replace(coalesce(ss.weather ->> 'Humidity', '0'), '[^0-9.-]', '', 'g')::numeric,
      'wind', regexp_replace(coalesce(ss.weather ->> 'Wind', '0'), '[^0-9.-]', '', 'g')::numeric,
      'vehicles', coalesce((ss.sources ->> 'Vehicles')::numeric, 0)
    ) as features,
    ss.data_mode
  from public.station_snapshots ss
)
insert into public.station_observations (
  station_id,
  observed_at,
  aqi,
  pollutants,
  sources,
  weather,
  features,
  data_mode
)
select
  station_id,
  observed_at,
  aqi,
  pollutants,
  sources,
  weather,
  features,
  data_mode
from current_snapshot
on conflict (station_id, observed_at) do nothing;

drop view if exists public.station_dashboard;

create view public.station_dashboard
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
  ss.model_metadata,
  ss.updated_at
from public.stations s
left join public.station_snapshots ss on ss.station_id = s.id
where s.enabled = true;
