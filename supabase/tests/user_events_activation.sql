-- Tests activation produit (audit §P0.3) : l'index unique partiel garantit qu'un
-- JALON d'activation ne peut être compté qu'une fois par (user_id, event), tandis
-- que les événements récurrents restent libres. Vérifie aussi la vue funnel.
-- Exécuté par scripts/test-rls.sh (base éphémère, jamais la prod).
\set ON_ERROR_STOP on
set client_min_messages = notice;

create schema if not exists auth;
do $$ begin
  if not exists (select from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create table if not exists auth.users (id uuid primary key default gen_random_uuid());
grant usage on schema auth, public to anon, authenticated, service_role;

insert into auth.users (id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

-- Table user_events (mêmes colonnes que la prod).
create table public.user_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
grant select, insert on public.user_events to authenticated, service_role;

-- Migration auditée : index unique partiel + vue funnel.
\i supabase/migrations/20260723000000_user_events_activation.sql

-- 1. Un jalon d'activation ne peut exister qu'UNE fois par utilisateur.
do $$
declare blocked boolean := false;
begin
  insert into public.user_events (user_id, event) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'first_strategy_generated');
  begin
    insert into public.user_events (user_id, event) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'first_strategy_generated');
    exception when unique_violation then blocked := true; end;
  if not blocked then raise exception 'ÉCHEC: doublon de jalon d''activation accepté'; end if;
  raise notice 'OK  jalon d''activation dédupliqué (1×/user)';
end $$;

-- 2. Un autre utilisateur peut avoir le MÊME jalon (dédup par user, pas global).
do $$
begin
  insert into public.user_events (user_id, event) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'first_strategy_generated');
  raise notice 'OK  même jalon autorisé pour un autre utilisateur';
end $$;

-- 3. Les événements RÉCURRENTS ne sont PAS contraints (session_start, race_debrief_viewed).
do $$
begin
  insert into public.user_events (user_id, event) values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'session_start'),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'session_start'),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'race_debrief_viewed'),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'race_debrief_viewed');
  raise notice 'OK  événements récurrents non contraints';
end $$;

-- 4. Tous les jalons d'activation sont bien couverts par l'index (aucun doublon possible).
do $$
declare ev text; blocked boolean;
begin
  foreach ev in array array['first_analysis_viewed','coach_plan_generated','first_workout_completed','nutrition_plan_generated']
  loop
    insert into public.user_events (user_id, event) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', ev);
    blocked := false;
    begin
      insert into public.user_events (user_id, event) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', ev);
      exception when unique_violation then blocked := true; end;
    if not blocked then raise exception 'ÉCHEC: doublon accepté pour le jalon %', ev; end if;
  end loop;
  raise notice 'OK  tous les jalons d''activation sont dédupliqués';
end $$;

-- 5. La vue funnel agrège des utilisateurs distincts par étape.
do $$
declare n int;
begin
  select users into n from public.activation_funnel where event = 'first_strategy_generated';
  if n <> 2 then raise exception 'ÉCHEC: funnel first_strategy_generated attendu 2, obtenu %', n; end if;
  raise notice 'OK  vue funnel : % utilisateurs sur « première stratégie »', n;
end $$;

\echo '== TESTS USER_EVENTS ACTIVATION : PASSÉS =='
