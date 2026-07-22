-- Tests SQL — quota PRO décidé côté serveur (audit 22/07, P0.4).
-- La règle client (1 stratégie GPX en gratuit) est appliquée par la base via
-- trg_race_calendar_gpx_quota, avec journalisation des accords dans user_events.
\set ON_ERROR_STOP on
set client_min_messages = notice;

create schema if not exists auth;
do $$ begin
  if not exists (select from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create table if not exists auth.users (id uuid primary key default gen_random_uuid());
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json->>'sub','')::uuid $$;
grant usage on schema auth, public to anon, authenticated, service_role;

insert into auth.users (id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),  -- free
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),  -- pro (entitlement actif)
  ('cccccccc-cccc-cccc-cccc-cccccccccccc');  -- pro expiré (repli profiles)

-- Tables minimales (colonnes utilisées par la migration).
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  plan_tier text not null default 'free',
  plan_expires_at timestamptz,
  is_admin boolean not null default false
);
create table public.user_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null,
  current_period_end timestamptz
);
create table public.user_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table public.race_calendar (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text,
  gpx_data jsonb
);
alter table public.race_calendar enable row level security;
create policy own_races on public.race_calendar
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.race_calendar to authenticated;
grant select, insert on public.user_events to authenticated;
grant select on public.profiles, public.user_entitlements to authenticated;
grant all on public.race_calendar, public.user_events, public.profiles, public.user_entitlements to service_role;

insert into public.profiles (id) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
insert into public.profiles (id) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into public.profiles (id, plan_tier, plan_expires_at)
  values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'pro', now() - interval '1 day');
insert into public.user_entitlements (user_id, status, current_period_end)
  values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'active', now() + interval '30 days');

\i supabase/migrations/20260722010000_gpx_quota_server.sql

create or replace function public._login(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, true); end $$;

-- Courses sans GPX pour A (free), B (pro), C (pro expiré).
insert into public.race_calendar (id, user_id, name) values
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','A course 1'),
  ('22222222-2222-2222-2222-222222222222','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','A course 2'),
  ('33333333-3333-3333-3333-333333333333','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','B course 1'),
  ('44444444-4444-4444-4444-444444444444','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','B course 2'),
  ('55555555-5555-5555-5555-555555555555','cccccccc-cccc-cccc-cccc-cccccccccccc','C course 1'),
  ('66666666-6666-6666-6666-666666666666','cccccccc-cccc-cccc-cccc-cccccccccccc','C course 2');

-- 1. Free : la PREMIÈRE stratégie GPX passe, et l'accord est journalisé.
do $$
begin
  set local role authenticated; perform public._login('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  update public.race_calendar set gpx_data = '[{"lat":45}]'::jsonb
    where id = '11111111-1111-1111-1111-111111111111';
  reset role;
  if (select gpx_data from public.race_calendar where id='11111111-1111-1111-1111-111111111111') is null then
    raise exception 'ÉCHEC: 1re stratégie GPX gratuite refusée';
  end if;
  if not exists (select from public.user_events
                 where user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and event='gpx_quota_granted') then
    raise exception 'ÉCHEC: accord non journalisé';
  end if;
  raise notice 'OK  free : 1re stratégie GPX acceptée + accord journalisé';
end $$;

-- 2. Free : la DEUXIÈME course avec GPX est refusée PAR LA BASE.
do $$
declare blocked boolean := false;
begin
  set local role authenticated; perform public._login('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  begin
    update public.race_calendar set gpx_data = '[{"lat":46}]'::jsonb
      where id = '22222222-2222-2222-2222-222222222222';
  exception when insufficient_privilege then blocked := true; end;
  reset role;
  if not blocked then raise exception 'ÉCHEC: quota gratuit non appliqué par la base'; end if;
  raise notice 'OK  free : 2e stratégie GPX refusée côté serveur';
end $$;

-- 3. Free : REMPLACER le GPX de sa course existante reste permis.
do $$
begin
  set local role authenticated; perform public._login('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  update public.race_calendar set gpx_data = '[{"lat":47}]'::jsonb
    where id = '11111111-1111-1111-1111-111111111111';
  reset role;
  raise notice 'OK  free : remplacement du GPX existant permis';
end $$;

-- 4. PRO (entitlement actif) : plusieurs stratégies GPX.
do $$
begin
  set local role authenticated; perform public._login('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  update public.race_calendar set gpx_data='[{"lat":1}]'::jsonb where id='33333333-3333-3333-3333-333333333333';
  update public.race_calendar set gpx_data='[{"lat":2}]'::jsonb where id='44444444-4444-4444-4444-444444444444';
  reset role;
  if (select count(*) from public.race_calendar
      where user_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' and gpx_data is not null) <> 2 then
    raise exception 'ÉCHEC: PRO limité à tort';
  end if;
  raise notice 'OK  pro : stratégies GPX illimitées';
end $$;

-- 5. PRO expiré (repli profiles périmé) : traité comme free.
do $$
declare blocked boolean := false;
begin
  set local role authenticated; perform public._login('cccccccc-cccc-cccc-cccc-cccccccccccc');
  update public.race_calendar set gpx_data='[{"lat":3}]'::jsonb where id='55555555-5555-5555-5555-555555555555';
  begin
    update public.race_calendar set gpx_data='[{"lat":4}]'::jsonb where id='66666666-6666-6666-6666-666666666666';
  exception when insufficient_privilege then blocked := true; end;
  reset role;
  if not blocked then raise exception 'ÉCHEC: plan pro expiré non rétrogradé'; end if;
  raise notice 'OK  pro expiré : quota gratuit appliqué';
end $$;

-- 6. service_role (serveur) : jamais limité par le quota.
do $$
begin
  set local role service_role;
  update public.race_calendar set gpx_data='[{"lat":5}]'::jsonb where id='66666666-6666-6666-6666-666666666666';
  reset role;
  raise notice 'OK  service_role non limité';
end $$;

\echo '== TESTS GPX QUOTA SERVEUR : PASSÉS =='
