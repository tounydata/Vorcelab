-- ══════════════════════════════════════════════════════════════
-- Strava multi-user migration
-- ══════════════════════════════════════════════════════════════

-- 1. strava_tokens: one row per Supabase user
-- Drop & recreate cleanly (was previously incomplete)
drop table if exists strava_tokens cascade;

create table strava_tokens (
  user_id              uuid        not null primary key references auth.users(id) on delete cascade,
  strava_athlete_id    bigint      not null unique,
  access_token         text        not null,
  refresh_token        text        not null,
  expires_at           bigint      not null,
  scope                text,
  athlete_firstname    text,
  athlete_lastname     text,
  athlete_avatar       text,
  last_sync_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index idx_strava_tokens_athlete on strava_tokens(strava_athlete_id);

alter table strava_tokens enable row level security;

-- Users can see their own connection status (not the tokens)
create policy "strava_tokens: user reads own row"
  on strava_tokens for select
  using (auth.uid() = user_id);

-- All writes go through service role (Edge Functions) only
-- No insert/update/delete policies for authenticated role

-- 2. strava_activities: one row per activity per user
create table if not exists strava_activities (
  id                    uuid        not null default gen_random_uuid() primary key,
  user_id               uuid        not null references auth.users(id) on delete cascade,
  strava_activity_id    bigint      not null,
  strava_athlete_id     bigint,
  name                  text,
  type                  text,
  sport_type            text,
  start_date            timestamptz,
  start_date_local      timestamptz,
  timezone              text,
  distance              numeric,
  moving_time           integer,
  elapsed_time          integer,
  total_elevation_gain  numeric,
  average_speed         numeric,
  max_speed             numeric,
  average_heartrate     numeric,
  max_heartrate         numeric,
  average_cadence       numeric,
  calories              numeric,
  suffer_score          numeric,
  raw_data              jsonb       not null default '{}',
  deleted_at            timestamptz,
  synced_at             timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint uq_strava_activities unique (user_id, strava_activity_id)
);

create index idx_strava_activities_user_date
  on strava_activities(user_id, start_date desc)
  where deleted_at is null;

create index idx_strava_activities_strava_id
  on strava_activities(strava_activity_id);

create index idx_strava_activities_athlete_id
  on strava_activities(strava_athlete_id);

alter table strava_activities enable row level security;

create policy "strava_activities: user reads own"
  on strava_activities for select
  using (auth.uid() = user_id and deleted_at is null);

-- 3. strava_webhook_events: fast write, async process
create table if not exists strava_webhook_events (
  id               uuid        not null default gen_random_uuid() primary key,
  object_type      text        not null,
  object_id        bigint      not null,
  aspect_type      text        not null,
  owner_id         bigint      not null,
  subscription_id  bigint,
  event_time       bigint,
  payload          jsonb       not null default '{}',
  processed_at     timestamptz,
  error            text,
  created_at       timestamptz not null default now()
);

create index idx_strava_webhook_events_unprocessed
  on strava_webhook_events(created_at)
  where processed_at is null;

alter table strava_webhook_events enable row level security;
-- webhook events are written/read only by service role; no user policies needed
