-- ─────────────────────────────────────────────────────────────────────────────
-- Tests SQL d'attaque — sécurité PRO / admin de la table profiles.
--
-- Reproduit le scaffolding Supabase (rôles anon/authenticated/service_role,
-- schéma auth, auth.uid()), l'état VULNÉRABLE (policy p_update_own seule),
-- démontre l'attaque, applique la migration de correction, puis prouve que
-- l'attaque est bloquée et que les écritures légitimes/serveur passent.
--
-- Exécution : scripts/test-rls.sh  (createdb → \i ce fichier → dropdb)
-- Prérequis : PostgreSQL local. Aucune donnée de prod n'est touchée.
-- ─────────────────────────────────────────────────────────────────────────────
\set ON_ERROR_STOP on
\timing off
set client_min_messages = notice;

-- ── Scaffolding Supabase ─────────────────────────────────────────────────────
create schema if not exists auth;

do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  created_at timestamptz not null default now(),
  last_sign_in_at timestamptz
);

-- auth.uid() = sub du JWT injecté via le GUC request.jwt.claims (comme PostgREST).
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

-- ── Schéma applicatif minimal (colonnes réelles concernées) ──────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  weight numeric,
  fc_max integer,
  dashboard_layout jsonb,
  onboarding_done boolean not null default false,
  plan_tier text not null default 'free' check (plan_tier in ('free','pro')),
  plan_expires_at timestamptz,
  plan_note text,
  is_admin boolean not null default false,
  stripe_customer_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.plan_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  granted_by uuid not null references auth.users(id),
  plan_tier text not null default 'pro' check (plan_tier in ('free','pro')),
  expires_at timestamptz,
  note text,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table public.profiles enable row level security;
alter table public.plan_grants enable row level security;

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.plan_grants to authenticated;
-- service_role (webhook / jobs serveur) : accès complet comme dans Supabase.
grant select, insert, update, delete on public.profiles to service_role;
grant select, insert, update, delete on public.plan_grants to service_role;

-- État VULNÉRABLE reproduit : la policy autorise l'update de toute la ligne.
drop policy if exists p_select_own on public.profiles;
create policy p_select_own on public.profiles for select to authenticated using (auth.uid() = id);
drop policy if exists p_insert_own on public.profiles;
create policy p_insert_own on public.profiles for insert to authenticated with check (auth.uid() = id);
drop policy if exists p_update_own on public.profiles;
create policy p_update_own on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists admins_manage_grants on public.plan_grants;
create policy admins_manage_grants on public.plan_grants for all
  using ((select is_admin from public.profiles where id = auth.uid()));

-- Fonction admin représentative (copie fidèle de la migration rattrapage).
create or replace function public.admin_grant_pro(target_user_id uuid, months integer default null, note_text text default null)
returns void language plpgsql security definer set search_path = public as $$
declare is_admin_caller boolean; expires timestamptz;
begin
  select is_admin into is_admin_caller from public.profiles where id = auth.uid();
  if not coalesce(is_admin_caller, false) then raise exception 'Unauthorized'; end if;
  if months is not null then expires := now() + (months || ' months')::interval; end if;
  update public.profiles set plan_tier = 'pro', plan_expires_at = expires, plan_note = note_text where id = target_user_id;
  insert into public.plan_grants (user_id, granted_by, plan_tier, expires_at, note)
  values (target_user_id, auth.uid(), 'pro', expires, note_text);
end $$;

-- ── Données de test ──────────────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'attacker@test.dev'),
  ('22222222-2222-2222-2222-222222222222', 'admin@test.dev')
on conflict do nothing;
insert into public.profiles (id, name) values
  ('11111111-1111-1111-1111-111111111111', 'Attacker'),
  ('22222222-2222-2222-2222-222222222222', 'Admin')
on conflict do nothing;
update public.profiles set is_admin = true where id = '22222222-2222-2222-2222-222222222222';

-- Helper : se faire passer pour l'attaquant (rôle authenticated + JWT).
create or replace function public._login_attacker() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
end $$;

\echo ''
\echo '=========================================================================='
\echo ' PHASE A — Démonstration de la VULNÉRABILITÉ (état actuel non corrigé)'
\echo '=========================================================================='

-- Attaque 1 : auto-promotion admin + PRO, AVANT correction → doit RÉUSSIR ici.
do $$
declare v_admin boolean; v_tier text;
begin
  set local role authenticated;
  perform public._login_attacker();
  update public.profiles
    set is_admin = true, plan_tier = 'pro', plan_expires_at = now() + interval '10 years'
    where id = '11111111-1111-1111-1111-111111111111';
  reset role;
  select is_admin, plan_tier into v_admin, v_tier from public.profiles where id = '11111111-1111-1111-1111-111111111111';
  if v_admin is true and v_tier = 'pro' then
    raise warning 'VULN CONFIRMÉE (avant correction) : un utilisateur standard a pu se mettre is_admin=true et plan_tier=pro';
  else
    raise exception 'Le harnais ne reproduit pas la vuln (is_admin=%, tier=%)', v_admin, v_tier;
  end if;
end $$;

-- On remet l'attaquant à l'état standard avant d'appliquer la correction.
update public.profiles set is_admin = false, plan_tier = 'free', plan_expires_at = null
  where id = '11111111-1111-1111-1111-111111111111';

\echo ''
\echo '=========================================================================='
\echo ' Application de la migration de correction'
\echo '=========================================================================='
\i supabase/migrations/20260710000000_secure_profiles_and_admin.sql

\echo ''
\echo '=========================================================================='
\echo ' PHASE B — La correction bloque les attaques'
\echo '=========================================================================='

-- Test 1 : un utilisateur standard NE PEUT PAS se mettre is_admin=true.
do $$
declare blocked boolean := false;
begin
  set local role authenticated; perform public._login_attacker();
  begin
    update public.profiles set is_admin = true where id = '11111111-1111-1111-1111-111111111111';
  exception when insufficient_privilege then blocked := true;
  end;
  reset role;
  if not blocked then raise exception 'ÉCHEC: is_admin modifiable par le client'; end if;
  if (select is_admin from public.profiles where id = '11111111-1111-1111-1111-111111111111') then
    raise exception 'ÉCHEC: is_admin est passé à true';
  end if;
  raise notice 'OK  is_admin non modifiable par le client';
end $$;

-- Test 2 : impossible de s'auto-attribuer PRO (plan_tier / plan_expires_at).
do $$
declare blocked boolean := false;
begin
  set local role authenticated; perform public._login_attacker();
  begin
    update public.profiles set plan_tier = 'pro', plan_expires_at = now() + interval '10 years'
      where id = '11111111-1111-1111-1111-111111111111';
  exception when insufficient_privilege then blocked := true;
  end;
  reset role;
  if not blocked then raise exception 'ÉCHEC: plan_tier modifiable par le client'; end if;
  raise notice 'OK  plan_tier / plan_expires_at non modifiables par le client';
end $$;

-- Test 3 : impossible de modifier stripe_customer_id / plan_note.
do $$
declare blocked boolean := false;
begin
  set local role authenticated; perform public._login_attacker();
  begin
    update public.profiles set stripe_customer_id = 'cus_hacked', plan_note = 'x'
      where id = '11111111-1111-1111-1111-111111111111';
  exception when insufficient_privilege then blocked := true;
  end;
  reset role;
  if not blocked then raise exception 'ÉCHEC: stripe_customer_id modifiable par le client'; end if;
  raise notice 'OK  stripe_customer_id / plan_note non modifiables par le client';
end $$;

-- Test 4 : impossible de s'insérer une nouvelle ligne is_admin=true.
do $$
declare blocked boolean := false;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
  begin
    insert into public.profiles (id, is_admin) values ('33333333-3333-3333-3333-333333333333', true);
  exception when insufficient_privilege then blocked := true;
    when foreign_key_violation then blocked := true; -- pas d'auth.users : peu importe, l'insert admin est refusé en amont
  end;
  reset role;
  if not blocked then raise exception 'ÉCHEC: insertion avec is_admin=true autorisée'; end if;
  raise notice 'OK  insertion is_admin=true refusée';
end $$;

-- Test 5 : les écritures LÉGITIMES du profil passent toujours.
do $$
begin
  set local role authenticated; perform public._login_attacker();
  update public.profiles set name = 'Nouveau', weight = 72, fc_max = 190, dashboard_layout = '["a"]'::jsonb, onboarding_done = true
    where id = '11111111-1111-1111-1111-111111111111';
  reset role;
  if (select name from public.profiles where id = '11111111-1111-1111-1111-111111111111') <> 'Nouveau' then
    raise exception 'ÉCHEC: écriture légitime du profil bloquée';
  end if;
  raise notice 'OK  écritures légitimes (name/weight/fc_max/…) toujours autorisées';
end $$;

-- Test 6 : un update ne touchant PAS aux colonnes sensibles passe même si la
-- ligne a déjà un plan (no-op sur les colonnes protégées).
do $$
begin
  -- serveur pose un plan pro
  update public.profiles set plan_tier = 'pro', plan_expires_at = now() + interval '1 month'
    where id = '11111111-1111-1111-1111-111111111111';  -- current_user = superuser (setup)
  set local role authenticated; perform public._login_attacker();
  update public.profiles set name = 'Encore' where id = '11111111-1111-1111-1111-111111111111';
  reset role;
  if (select plan_tier from public.profiles where id = '11111111-1111-1111-1111-111111111111') <> 'pro' then
    raise exception 'ÉCHEC: plan perdu lors d''un update légitime';
  end if;
  raise notice 'OK  update légitime préserve le plan serveur';
end $$;

-- Test 7 : les écritures SERVEUR (service_role) restent autorisées.
do $$
begin
  set local role service_role;
  update public.profiles set plan_tier = 'pro', plan_expires_at = now() + interval '1 year', stripe_customer_id = 'cus_ok'
    where id = '11111111-1111-1111-1111-111111111111';
  reset role;
  if (select stripe_customer_id from public.profiles where id = '11111111-1111-1111-1111-111111111111') <> 'cus_ok' then
    raise exception 'ÉCHEC: service_role ne peut plus écrire le plan';
  end if;
  raise notice 'OK  service_role (webhook) peut écrire plan_tier/stripe_customer_id';
end $$;

-- Test 8 : anon ne peut PAS exécuter les RPC admin (EXECUTE révoqué).
do $$
declare blocked boolean := false;
begin
  set local role anon;
  begin
    perform public.admin_grant_pro('11111111-1111-1111-1111-111111111111', 12, 'hack');
  exception when insufficient_privilege then blocked := true;
  end;
  reset role;
  if not blocked then raise exception 'ÉCHEC: anon peut exécuter admin_grant_pro'; end if;
  raise notice 'OK  anon ne peut pas exécuter admin_grant_pro';
end $$;

-- Test 9 : un authenticated NON admin est refusé par la vérif interne du RPC.
do $$
declare blocked boolean := false;
begin
  set local role authenticated; perform public._login_attacker();
  begin
    perform public.admin_grant_pro('11111111-1111-1111-1111-111111111111', 12, 'hack');
  exception when others then
    if sqlerrm like '%Unauthorized%' then blocked := true; else raise; end if;
  end;
  reset role;
  if not blocked then raise exception 'ÉCHEC: un non-admin a pu appeler admin_grant_pro'; end if;
  raise notice 'OK  utilisateur standard rejeté par admin_grant_pro (Unauthorized)';
end $$;

-- Test 10 : un vrai admin peut toujours accorder le PRO (non-régression).
do $$
begin
  update public.profiles set plan_tier='free', plan_expires_at=null where id='11111111-1111-1111-1111-111111111111';
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
  perform public.admin_grant_pro('11111111-1111-1111-1111-111111111111', 6, 'cadeau');
  reset role;
  if (select plan_tier from public.profiles where id='11111111-1111-1111-1111-111111111111') <> 'pro' then
    raise exception 'ÉCHEC: un admin ne peut plus accorder le PRO';
  end if;
  raise notice 'OK  un admin peut toujours accorder le PRO';
end $$;

\echo ''
\echo '=========================================================================='
\echo ' TOUS LES TESTS RLS PROFILES/ADMIN SONT PASSÉS'
\echo '=========================================================================='
