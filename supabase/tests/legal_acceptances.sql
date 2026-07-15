-- Tests RLS — legal_acceptances : l'utilisateur enregistre/lit ses propres
-- acceptations, ne peut pas écrire pour autrui, ni modifier/supprimer (preuve).
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

\i supabase/migrations/20260714000000_legal_acceptances.sql
-- Supabase accorde SELECT/INSERT/... par défaut aux rôles API : on le simule.
grant select, insert, update, delete on public.legal_acceptances to authenticated;
revoke update, delete on public.legal_acceptances from authenticated;

create or replace function public._login(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, true); end $$;

-- 1. Enregistrer sa propre acceptation.
do $$
begin
  set local role authenticated; perform public._login('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  insert into public.legal_acceptances (user_id, document, version)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','cgu','2026-07-02');
  reset role;
  if (select count(*) from public.legal_acceptances) <> 1 then raise exception 'ÉCHEC: insertion propre'; end if;
  raise notice 'OK  acceptation propre enregistrée';
end $$;

-- 2. Impossible d'enregistrer pour un AUTRE utilisateur.
do $$
declare blocked boolean := false;
begin
  set local role authenticated; perform public._login('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  begin
    insert into public.legal_acceptances (user_id, document, version)
      values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','cgu','2026-07-02');
  exception when insufficient_privilege then blocked := true; end;
  reset role;
  if not blocked then raise exception 'ÉCHEC: acceptation pour autrui autorisée'; end if;
  raise notice 'OK  acceptation pour autrui refusée';
end $$;

-- 3. Lecture limitée à ses propres lignes.
do $$
declare n int;
begin
  set local role authenticated; perform public._login('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  select count(*) into n from public.legal_acceptances;
  reset role;
  if n <> 0 then raise exception 'ÉCHEC: lecture des acceptations d''autrui'; end if;
  raise notice 'OK  lecture limitée à ses propres acceptations';
end $$;

-- 4. Immuable : pas de UPDATE ni DELETE.
do $$
declare u_blocked boolean := false; d_blocked boolean := false;
begin
  set local role authenticated; perform public._login('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  begin update public.legal_acceptances set version='hack'; exception when insufficient_privilege then u_blocked := true; end;
  begin delete from public.legal_acceptances; exception when insufficient_privilege then d_blocked := true; end;
  reset role;
  if not (u_blocked and d_blocked) then raise exception 'ÉCHEC: acceptation modifiable/supprimable'; end if;
  raise notice 'OK  acceptation immuable (UPDATE/DELETE refusés)';
end $$;

-- 5. Ré-accepter la même version est idempotent (unique).
do $$
declare dup boolean := false;
begin
  set local role authenticated; perform public._login('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  begin
    insert into public.legal_acceptances (user_id, document, version)
      values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','cgu','2026-07-02');
  exception when unique_violation then dup := true; end;
  reset role;
  if not dup then raise exception 'ÉCHEC: doublon (user,doc,version) accepté'; end if;
  raise notice 'OK  ré-acceptation même version idempotente (unique)';
end $$;

\echo '== TESTS LEGAL_ACCEPTANCES : PASSÉS =='
