create table if not exists public.model_evaluations (
  id uuid primary key default gen_random_uuid(),
  model_version text not null references public.model_artifacts(version) on delete cascade,
  summary jsonb not null default '{}'::jsonb,
  by_horizon jsonb not null default '[]'::jsonb,
  by_station jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.model_evaluations enable row level security;

create index if not exists model_evaluations_model_version_idx
  on public.model_evaluations (model_version, created_at desc);

alter table public.model_artifacts
  add column if not exists evaluation_summary jsonb not null default '{}'::jsonb,
  add column if not exists training_window_start timestamptz,
  add column if not exists training_window_end timestamptz,
  add column if not exists predecessor_version text,
  add column if not exists promotion_status text not null default 'shadow',
  add column if not exists promotion_reason text;

do $$
begin
  alter table public.model_artifacts
    add constraint model_artifacts_promotion_status_check
    check (promotion_status in ('active', 'shadow'));
exception
  when duplicate_object then null;
end
$$;

create index if not exists model_artifacts_promotion_status_idx
  on public.model_artifacts (promotion_status, trained_at desc);
