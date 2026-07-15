-- ─────────────────────────────────────────────────────────────────────────────
-- Test d'intégration RGPD — suppression de compte complète par CASCADE.
-- Crée un utilisateur avec des données dans TOUTES les catégories, applique la
-- migration de cascade, supprime l'utilisateur Auth, puis vérifie qu'il ne reste
-- AUCUNE donnée — et que le grant fait à un AUTRE utilisateur est préservé
-- (granted_by mis à NULL, pas supprimé). Exécuté par scripts/test-rls.sh.
-- ─────────────────────────────────────────────────────────────────────────────
\set ON_ERROR_STOP on
set client_min_messages = notice;

create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid());

-- Schéma minimal reproduisant les FK réelles (NO ACTION pour les 4 à corriger +
-- granted_by ; CASCADE pour les autres, comme en prod).
create table public.profiles (id uuid primary key constraint profiles_id_fkey references auth.users(id));
create table public.user_events (id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade);
create table public.activities_history (id uuid primary key default gen_random_uuid(),
  user_id uuid constraint activities_history_user_id_fkey references auth.users(id));
create table public.race_calendar (id uuid primary key default gen_random_uuid(),
  user_id uuid constraint race_calendar_user_id_fkey references auth.users(id));
create table public.strava_tokens (user_id uuid primary key constraint strava_tokens_user_id_fkey references auth.users(id),
  strava_athlete_id bigint);
create table public.plan_grants (id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  granted_by uuid not null constraint plan_grants_granted_by_fkey references auth.users(id));

-- Tables déjà en CASCADE sur auth.users.
create table public.activity_streams   (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade);
create table public.activity_weather   (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade);
create table public.session_log        (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade);
create table public.renfo_exercise_log (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade);
create table public.renfo_focus_log    (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade);
create table public.renfo_max_lifts    (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade);
create table public.renfo_profile      (user_id uuid primary key references auth.users(id) on delete cascade);
create table public.renfo_program      (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade);
create table public.renfo_session_log  (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade);
create table public.strava_activities  (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade);
create table public.user_entitlements  (user_id uuid primary key references auth.users(id) on delete cascade);

-- Deux utilisateurs : la cible (supprimée) et un tiers (dont on préserve le grant).
insert into auth.users (id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into public.profiles (id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

\echo '== application de la migration de cascade =='
\i supabase/migrations/20260712000000_rgpd_cascade_fks.sql

-- Données de la cible dans TOUTES les catégories.
\set uid '''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'''
insert into public.user_events (user_id) values (:uid);
insert into public.activities_history (user_id) values (:uid);
insert into public.race_calendar (user_id) values (:uid);
insert into public.strava_tokens (user_id, strava_athlete_id) values (:uid, 42);
insert into public.activity_streams (user_id) values (:uid);
insert into public.activity_weather (user_id) values (:uid);
insert into public.session_log (user_id) values (:uid);
insert into public.renfo_exercise_log (user_id) values (:uid);
insert into public.renfo_focus_log (user_id) values (:uid);
insert into public.renfo_max_lifts (user_id) values (:uid);
insert into public.renfo_profile (user_id) values (:uid);
insert into public.renfo_program (user_id) values (:uid);
insert into public.renfo_session_log (user_id) values (:uid);
insert into public.strava_activities (user_id) values (:uid);
insert into public.user_entitlements (user_id) values (:uid);
-- La cible a accordé un grant à ELLE-MÊME (doit disparaître) et à un TIERS (doit rester).
insert into public.plan_grants (user_id, granted_by) values (:uid, :uid);
insert into public.plan_grants (user_id, granted_by) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', :uid);

\echo '== suppression de l''utilisateur Auth (déclenche la cascade) =='
delete from auth.users where id = :uid;

-- Vérifie qu'il ne reste AUCUNE donnée de la cible.
do $$
declare tbl text; total int := 0; n int;
  tables text[] := array[
    'profiles','user_events','activities_history','race_calendar','strava_tokens',
    'activity_streams','activity_weather','session_log','renfo_exercise_log',
    'renfo_focus_log','renfo_max_lifts','renfo_profile','renfo_program',
    'renfo_session_log','strava_activities','user_entitlements'];
  col text;
begin
  foreach tbl in array tables loop
    col := case when tbl='profiles' then 'id' else 'user_id' end;
    execute format('select count(*) from public.%I where %I = %L', tbl, col, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') into n;
    if n <> 0 then raise exception 'ÉCHEC: % ligne(s) résiduelle(s) dans %', n, tbl; end if;
    total := total + n;
  end loop;
  -- grant de la cible à elle-même : supprimé (cascade user_id).
  select count(*) into n from public.plan_grants where user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if n <> 0 then raise exception 'ÉCHEC: grant de la cible non supprimé'; end if;
  -- grant au TIERS : conservé, granted_by mis à NULL.
  select count(*) into n from public.plan_grants
    where user_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' and granted_by is null;
  if n <> 1 then raise exception 'ÉCHEC: grant du tiers non préservé/NULLé (%)', n; end if;
  raise notice 'OK  aucune donnée résiduelle après suppression (16 tables) + grant tiers préservé (granted_by NULL)';
end $$;

\echo '== TEST RGPD SUPPRESSION SANS ORPHELIN : PASSÉ =='
