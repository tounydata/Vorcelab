-- ── TABLES RENFO ─────────────────────────────────────────────────────────────

create table if not exists renfo_profile (
  user_id          uuid primary key references auth.users on delete cascade,
  objective_weight integer not null default 50,
  sessions_per_week integer not null default 3,
  equipment        jsonb not null default '{}',
  has_gym_access   boolean not null default false,
  location_pref    text not null default 'maison',
  onboarding_done  boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists renfo_program (
  user_id           uuid primary key references auth.users on delete cascade,
  week_schedule     jsonb not null default '{}',
  generated_at      timestamptz not null default now(),
  generation_inputs jsonb not null default '{}'
);

create table if not exists renfo_session_log (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users on delete cascade,
  session_date        date not null,
  focus               text not null,
  duration_min        integer,
  completed_exercises jsonb not null default '{}',
  created_at          timestamptz not null default now(),
  constraint renfo_session_log_unique unique (user_id, session_date, focus)
);

create table if not exists renfo_exercise_log (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users on delete cascade,
  session_date       date not null,
  exercise_id        text not null,
  variant_id         text,
  load_kg            numeric,
  reps_completed     integer,
  reps_target        integer,
  rpe                integer,
  e1rm               numeric,
  completed_all_reps boolean,
  created_at         timestamptz not null default now()
);
create index if not exists renfo_exercise_log_user_exo_idx
  on renfo_exercise_log (user_id, exercise_id, session_date desc);

create table if not exists renfo_max_lifts (
  user_id     uuid not null references auth.users on delete cascade,
  exercise_id text not null,
  one_rm      numeric not null,
  is_estimated boolean not null default true,
  recorded_at timestamptz not null default now(),
  primary key (user_id, exercise_id)
);

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table renfo_profile      enable row level security;
alter table renfo_program       enable row level security;
alter table renfo_session_log   enable row level security;
alter table renfo_exercise_log  enable row level security;
alter table renfo_max_lifts     enable row level security;

create policy "renfo_profile_own"      on renfo_profile      using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "renfo_program_own"      on renfo_program       using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "renfo_session_log_own"  on renfo_session_log   using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "renfo_exercise_log_own" on renfo_exercise_log  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "renfo_max_lifts_own"    on renfo_max_lifts     using (auth.uid() = user_id) with check (auth.uid() = user_id);
