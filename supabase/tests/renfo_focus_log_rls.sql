-- Tests RLS — renfo_focus_log : le WITH CHECK de la policy UPDATE (perdu par la
-- migration perf 20260721000000, rétabli par 20260722000000) empêche un
-- propriétaire de ligne de la réaffecter à un autre utilisateur (intégrité
-- multi-tenant). Exécuté par scripts/test-rls.sh (DB éphémère).
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

-- Table minimale (mêmes colonnes clés que la prod pour ce test).
create table public.renfo_focus_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  note text
);
alter table public.renfo_focus_log enable row level security;
grant select, insert, update, delete on public.renfo_focus_log to authenticated;

-- État post-régression (20260721000000) : UPDATE sans WITH CHECK explicite.
create policy "Users can update own focus logs" on public.renfo_focus_log
  for update to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can read own focus logs" on public.renfo_focus_log
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can insert own focus logs" on public.renfo_focus_log
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- Correctif audité.
\i supabase/migrations/20260722000000_audit_secu_focus_log_definer.sql

create or replace function public._login(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, true); end $$;

-- Ligne appartenant à A.
insert into public.renfo_focus_log (user_id, note)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'origine');

-- 1. A peut mettre à jour sa propre ligne (contenu).
do $$
begin
  set local role authenticated; perform public._login('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  update public.renfo_focus_log set note = 'modifiée';
  reset role;
  if (select note from public.renfo_focus_log limit 1) <> 'modifiée' then
    raise exception 'ÉCHEC: update propre refusé';
  end if;
  raise notice 'OK  update de sa propre ligne accepté';
end $$;

-- 2. A ne peut PAS réaffecter sa ligne à B (WITH CHECK).
do $$
declare blocked boolean := false;
begin
  set local role authenticated; perform public._login('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  begin
    update public.renfo_focus_log
      set user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  exception when insufficient_privilege or check_violation then blocked := true; end;
  reset role;
  if not blocked then raise exception 'ÉCHEC: réaffectation du user_id autorisée'; end if;
  raise notice 'OK  réaffectation du user_id refusée (WITH CHECK)';
end $$;

-- 3. B ne voit toujours rien.
do $$
declare n int;
begin
  set local role authenticated; perform public._login('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  select count(*) into n from public.renfo_focus_log;
  reset role;
  if n <> 0 then raise exception 'ÉCHEC: lecture croisée'; end if;
  raise notice 'OK  isolation de lecture intacte';
end $$;

\echo '== TESTS RENFO_FOCUS_LOG RLS : PASSÉS =='
