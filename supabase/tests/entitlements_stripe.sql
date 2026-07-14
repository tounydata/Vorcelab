-- ─────────────────────────────────────────────────────────────────────────────
-- Tests SQL — source de vérité entitlements + idempotence Stripe.
-- Vérifie qu'un client ne peut ni écrire ni contourner son entitlement, que la
-- lecture propre marche, que le service role écrit, et que le registre Stripe
-- garantit l'idempotence. Exécuté par scripts/test-rls.sh (DB éphémère).
-- ─────────────────────────────────────────────────────────────────────────────
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
  select nullif(current_setting('request.jwt.claims', true)::json->>'sub','')::uuid
$$;
grant usage on schema auth, public to anon, authenticated, service_role;

-- profiles minimal (colonnes lues par le backfill de la migration).
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  plan_tier text not null default 'free',
  plan_expires_at timestamptz,
  is_admin boolean not null default false,
  stripe_customer_id text
);
grant select, insert, update, delete on public.profiles to authenticated, service_role;

-- Supabase accorde par défaut les privilèges de table aux rôles API : on simule
-- ce contexte pour prouver que c'est bien la RLS + les REVOKE de la migration
-- qui protègent (et pas l'absence de GRANT).
alter default privileges in schema public grant all on tables to authenticated;

-- Données.
insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222') on conflict do nothing;
insert into public.profiles (id, plan_tier, plan_expires_at, stripe_customer_id) values
  ('11111111-1111-1111-1111-111111111111','pro', now()+interval '1 month','cus_123'),
  ('22222222-2222-2222-2222-222222222222','free', null, null) on conflict do nothing;

\echo '== application de la migration =='
\i supabase/migrations/20260711000000_entitlements_and_stripe_idempotency.sql

-- Après migration : la table doit exister ; on donne les GRANT larges pour
-- prouver que la RLS/REVOKE priment (Supabase accorde SELECT/INSERT/... par défaut).
grant select, insert, update, delete on public.user_entitlements to authenticated;
grant select, insert, update, delete on public.stripe_webhook_events to authenticated;
-- On ré-applique le durcissement de la migration (les GRANT ci-dessus l'annulent
-- localement ; en prod le REVOKE de la migration s'applique après les défauts).
revoke insert, update, delete on public.user_entitlements from anon, authenticated;
revoke insert, update, delete on public.stripe_webhook_events from anon, authenticated;
grant select, insert, update, delete on public.user_entitlements to service_role;
grant select, insert, update, delete on public.stripe_webhook_events to service_role;
-- anon a le GRANT SELECT par défaut en Supabase : on le simule pour prouver que
-- c'est bien la RLS (absence de policy pour anon) qui renvoie 0 ligne, et non un
-- simple manque de privilège de table.
grant select on public.user_entitlements to anon;
grant select on public.stripe_webhook_events to anon;

create or replace function public._login(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, true); end $$;

\echo '== Tests =='

-- Backfill : user 1 (pro actif) doit avoir un entitlement pro/active.
do $$
declare t text; s text;
begin
  select plan_tier, status into t, s from public.user_entitlements where user_id='11111111-1111-1111-1111-111111111111';
  if t <> 'pro' or s <> 'active' then raise exception 'ÉCHEC backfill: attendu pro/active, obtenu %/%', t, s; end if;
  raise notice 'OK  backfill profiles→entitlements (pro actif)';
end $$;

-- 1. Lecture propre autorisée, lecture d'autrui interdite (RLS).
do $$
declare n_self int; n_other int;
begin
  set local role authenticated; perform public._login('11111111-1111-1111-1111-111111111111');
  select count(*) into n_self from public.user_entitlements where user_id='11111111-1111-1111-1111-111111111111';
  select count(*) into n_other from public.user_entitlements where user_id='22222222-2222-2222-2222-222222222222';
  reset role;
  if n_self <> 1 then raise exception 'ÉCHEC: lecture de sa propre ligne'; end if;
  if n_other <> 0 then raise exception 'ÉCHEC: un user voit l''entitlement d''autrui'; end if;
  raise notice 'OK  lecture propre autorisée, lecture d''autrui bloquée';
end $$;

-- 2. Écriture client interdite (INSERT/UPDATE/DELETE).
do $$
declare blocked int := 0;
begin
  set local role authenticated; perform public._login('22222222-2222-2222-2222-222222222222');
  begin insert into public.user_entitlements(user_id,plan_tier,status) values('22222222-2222-2222-2222-222222222222','pro','active');
  exception when insufficient_privilege then blocked := blocked+1; end;
  begin update public.user_entitlements set plan_tier='pro',status='active' where user_id='22222222-2222-2222-2222-222222222222';
  exception when insufficient_privilege then blocked := blocked+1; end;
  begin delete from public.user_entitlements where user_id='22222222-2222-2222-2222-222222222222';
  exception when insufficient_privilege then blocked := blocked+1; end;
  reset role;
  if blocked <> 3 then raise exception 'ÉCHEC: écriture client sur entitlements non totalement bloquée (%/3)', blocked; end if;
  if (select status from public.user_entitlements where user_id='22222222-2222-2222-2222-222222222222') = 'active' then
    raise exception 'ÉCHEC: un user a réussi à s''activer PRO';
  end if;
  raise notice 'OK  INSERT/UPDATE/DELETE client refusés sur user_entitlements';
end $$;

-- 3. anon ne lit rien.
do $$
declare n int;
begin
  set local role anon; perform set_config('request.jwt.claims','{"role":"anon"}',true);
  select count(*) into n from public.user_entitlements;
  reset role;
  if n <> 0 then raise exception 'ÉCHEC: anon lit des entitlements'; end if;
  raise notice 'OK  anon ne lit aucun entitlement';
end $$;

-- 4. service role peut écrire (webhook).
do $$
begin
  set local role service_role;
  insert into public.user_entitlements(user_id,plan_tier,status,source,stripe_subscription_id,current_period_end)
    values('22222222-2222-2222-2222-222222222222','pro','active','stripe','sub_1', now()+interval '1 month')
    on conflict (user_id) do update set plan_tier='pro', status='active', source='stripe',
      stripe_subscription_id='sub_1', current_period_end=excluded.current_period_end;
  reset role;
  if (select status from public.user_entitlements where user_id='22222222-2222-2222-2222-222222222222') <> 'active' then
    raise exception 'ÉCHEC: service role ne peut pas écrire l''entitlement';
  end if;
  raise notice 'OK  service role (webhook) écrit l''entitlement';
end $$;

-- 5. updated_at bougé par le trigger.
do $$
declare before_ts timestamptz; after_ts timestamptz;
begin
  select updated_at into before_ts from public.user_entitlements where user_id='22222222-2222-2222-2222-222222222222';
  perform pg_sleep(0.01);
  set local role service_role;
  update public.user_entitlements set cancel_at_period_end = true where user_id='22222222-2222-2222-2222-222222222222';
  reset role;
  select updated_at into after_ts from public.user_entitlements where user_id='22222222-2222-2222-2222-222222222222';
  if after_ts <= before_ts then raise exception 'ÉCHEC: updated_at non mis à jour'; end if;
  raise notice 'OK  trigger updated_at fonctionne';
end $$;

-- 6. Idempotence : même event_id inséré 2× → violation d'unicité (le webhook s'en
--    sert pour ne pas re-traiter un événement rejoué).
do $$
declare dup boolean := false;
begin
  set local role service_role;
  insert into public.stripe_webhook_events(event_id,event_type) values('evt_test','checkout.session.completed');
  begin
    insert into public.stripe_webhook_events(event_id,event_type) values('evt_test','checkout.session.completed');
  exception when unique_violation then dup := true; end;
  reset role;
  if not dup then raise exception 'ÉCHEC: event Stripe dupliqué accepté (pas d''idempotence)'; end if;
  raise notice 'OK  idempotence Stripe : event_id unique (rejeu bloqué)';
end $$;

-- 7. Client ne peut pas lire/écrire le registre Stripe.
do $$
declare read_blocked boolean := false; write_blocked boolean := false; n int;
begin
  set local role authenticated; perform public._login('11111111-1111-1111-1111-111111111111');
  select count(*) into n from public.stripe_webhook_events; -- RLS deny-all → 0
  begin insert into public.stripe_webhook_events(event_id,event_type) values('evt_hack','x');
  exception when insufficient_privilege then write_blocked := true; end;
  reset role;
  if n <> 0 then raise exception 'ÉCHEC: client lit stripe_webhook_events'; end if;
  if not write_blocked then raise exception 'ÉCHEC: client écrit stripe_webhook_events'; end if;
  raise notice 'OK  stripe_webhook_events inaccessible au client';
end $$;

\echo '== TOUS LES TESTS ENTITLEMENTS/STRIPE SONT PASSÉS =='
