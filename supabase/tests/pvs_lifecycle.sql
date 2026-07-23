-- Tests du cycle de vie des snapshots prospectifs (audit §P0.2). Vérifie sur une
-- base éphémère (jamais la prod) que les migrations PVS, appliquées dans l'ordre,
-- garantissent : création SERVEUR uniquement (INSERT client interdit), immuabilité
-- des champs de preuve (prédiction, manifeste, data_split, empreinte), résultat
-- réel écrit UNE seule fois, et invalidation obligatoirement justifiée.
-- Exécuté par scripts/test-rls.sh.
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
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

-- race_calendar minimal (référencé par la FK race_id du snapshot).
create table public.race_calendar (id uuid primary key default gen_random_uuid());
insert into public.race_calendar (id) values ('cccccccc-cccc-cccc-cccc-cccccccccccc');

-- Migrations PVS dans l'ordre chronologique.
\i supabase/migrations/20260719000000_projection_validation_snapshots.sql
\i supabase/migrations/20260719010000_pvs_hardening.sql
\i supabase/migrations/20260720120000_pvs_server_authoritative.sql
\i supabase/migrations/20260720130000_pvs_data_split.sql

create or replace function public._login(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, true); end $$;

-- 0. Colonnes ajoutées présentes avec leurs défauts (§4/§9).
do $$
declare dmanifest text; dsplit text;
begin
  select column_default into dmanifest from information_schema.columns
    where table_schema='public' and table_name='projection_validation_snapshots' and column_name='input_manifest';
  select column_default into dsplit from information_schema.columns
    where table_schema='public' and table_name='projection_validation_snapshots' and column_name='data_split';
  if dmanifest is null then raise exception 'ÉCHEC: input_manifest absente'; end if;
  if dsplit not like '%development%' then raise exception 'ÉCHEC: data_split défaut inattendu (%)', dsplit; end if;
  raise notice 'OK  input_manifest + data_split présentes (défaut development)';
end $$;

-- 1. Un client authentifié ne peut PAS insérer (création serveur uniquement).
do $$
declare blocked boolean := false;
begin
  set local role authenticated; perform public._login('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  begin
    insert into public.projection_validation_snapshots(
      user_id, race_start_at, engine_version, profile_version, profile_schema_version,
      prediction_central_s, prediction_prudent_s, prediction_aggressive_s,
      history_start_at, history_end_at, activity_count, input_fingerprint)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now()+interval '10 days','e','p','s',
      3600,3800,3400, now()-interval '90 days', now(), 5, 'fp');
  exception when insufficient_privilege then blocked := true; end;
  reset role;
  if not blocked then raise exception 'ÉCHEC: INSERT client autorisé (devrait être serveur uniquement)'; end if;
  raise notice 'OK  INSERT client refusé (création serveur uniquement)';
end $$;

-- Insertion serveur (rôle propriétaire = superuser du test, comme le service_role en prod).
insert into public.projection_validation_snapshots(
  user_id, race_id, race_start_at, engine_version, profile_version, profile_schema_version,
  prediction_central_s, prediction_prudent_s, prediction_aggressive_s,
  history_start_at, history_end_at, activity_count, input_fingerprint, input_manifest, data_split)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','cccccccc-cccc-cccc-cccc-cccccccccccc',
  now()+interval '10 days','engine-1','profile-1','schema-1',
  3600,3800,3400, now()-interval '90 days', now(), 5, 'fp-1',
  '[{"activityId":1,"movingTimeS":3000}]'::jsonb, 'development');

-- 2. Champs de preuve immuables (prédiction, manifeste, data_split).
do $$
declare blocked boolean;
begin
  set local role authenticated; perform public._login('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

  blocked := false;
  begin update public.projection_validation_snapshots set prediction_central_s = 9999; exception when others then blocked := true; end;
  if not blocked then raise exception 'ÉCHEC: prédiction modifiable'; end if;

  blocked := false;
  begin update public.projection_validation_snapshots set input_manifest = '[]'::jsonb; exception when others then blocked := true; end;
  if not blocked then raise exception 'ÉCHEC: manifeste modifiable'; end if;

  blocked := false;
  begin update public.projection_validation_snapshots set data_split = 'validation'; exception when others then blocked := true; end;
  if not blocked then raise exception 'ÉCHEC: data_split modifiable'; end if;

  reset role;
  raise notice 'OK  champs de preuve immuables (prédiction, manifeste, data_split)';
end $$;

-- 3. Résultat réel écrit UNE fois, puis figé.
do $$
declare blocked boolean;
begin
  set local role authenticated; perform public._login('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

  update public.projection_validation_snapshots
    set result_moving_s = 3700, result_elapsed_s = 3900, result_recorded_at = now(), status = 'evaluated';

  blocked := false;
  begin update public.projection_validation_snapshots set result_moving_s = 1; exception when others then blocked := true; end;
  reset role;
  if not blocked then raise exception 'ÉCHEC: résultat réel re-modifiable après enregistrement'; end if;
  raise notice 'OK  résultat réel écrit une fois puis figé';
end $$;

-- 4. Invalidation : interdite sans raison, autorisée avec raison (puis figée).
insert into public.projection_validation_snapshots(
  user_id, race_start_at, engine_version, profile_version, profile_schema_version,
  prediction_central_s, prediction_prudent_s, prediction_aggressive_s,
  history_start_at, history_end_at, activity_count, input_fingerprint)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', now()+interval '10 days','engine-1','profile-1','schema-1',
  3600,3800,3400, now()-interval '90 days', now(), 5, 'fp-2');

do $$
declare blocked boolean;
begin
  set local role authenticated; perform public._login('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

  blocked := false;
  begin update public.projection_validation_snapshots set status = 'invalidated'
    where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'; exception when others then blocked := true; end;
  if not blocked then raise exception 'ÉCHEC: invalidation sans raison autorisée'; end if;

  update public.projection_validation_snapshots set status = 'invalidated', invalidation_reason = 'course annulée'
    where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  blocked := false;
  begin update public.projection_validation_snapshots set invalidation_reason = 'autre'
    where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'; exception when others then blocked := true; end;
  reset role;
  if not blocked then raise exception 'ÉCHEC: raison d''invalidation re-modifiable'; end if;
  raise notice 'OK  invalidation justifiée obligatoire et figée';
end $$;

\echo '== TESTS PVS LIFECYCLE : PASSÉS =='
