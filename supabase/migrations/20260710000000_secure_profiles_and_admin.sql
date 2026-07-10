-- ─────────────────────────────────────────────────────────────────────────────
-- SÉCURITÉ P0 — Verrouillage des droits PRO / administrateur.
--
-- Contexte : la table `profiles` est éditable par son propriétaire via la policy
-- `p_update_own` (USING/​WITH CHECK auth.uid() = id). La RLS n'offre AUCUN contrôle
-- au niveau colonne : un utilisateur authentifié pouvait donc écrire n'importe
-- quelle colonne de SA ligne, y compris les colonnes sensibles côté serveur :
--   plan_tier, plan_expires_at, plan_note, is_admin, stripe_customer_id.
-- => auto-passage PRO, is_admin = true, accès aux RPC admin, etc.
--
-- Correction sans casser les écritures légitimes du client (name, weight, fc_max,
-- runner_profile, dashboard_layout, onboarding_done, …) :
--   1. Un trigger BEFORE INSERT/UPDATE (SECURITY INVOKER) rejette toute tentative
--      d'écriture des colonnes sensibles quand l'appelant est un rôle client
--      (authenticated / anon). Les écritures serveur (service_role via le webhook,
--      fonctions SECURITY DEFINER exécutées par leur propriétaire) passent.
--   2. Durcissement des fonctions admin SECURITY DEFINER : search_path figé +
--      EXECUTE retiré à anon/public (défense en profondeur : la vérif interne
--      is_admin reste, mais les RPC ne sont plus atteignables par anon).
--
-- Idempotente : réexécutable sans effet de bord.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Garde-fou colonnes sensibles de profiles ──────────────────────────────
-- SECURITY INVOKER (défaut) : current_user reflète le rôle réel de l'appelant.
--   • requête API authentifiée  → current_user = 'authenticated'
--   • requête API anonyme        → current_user = 'anon'
--   • webhook / job service role → current_user = 'service_role'
--   • fonction SECURITY DEFINER  → current_user = propriétaire (postgres/…)
-- On bloque uniquement les rôles clients ; le serveur garde tous ses droits.

create or replace function public.profiles_reject_sensitive_writes()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if coalesce(new.plan_tier, 'free') is distinct from 'free'
         or new.plan_expires_at is not null
         or new.plan_note is not null
         or coalesce(new.is_admin, false) is distinct from false
         or new.stripe_customer_id is not null then
        raise exception
          'profiles: les colonnes plan_tier/plan_expires_at/plan_note/is_admin/stripe_customer_id sont réservées au serveur'
          using errcode = 'insufficient_privilege';
      end if;
    elsif tg_op = 'UPDATE' then
      if new.plan_tier        is distinct from old.plan_tier
         or new.plan_expires_at  is distinct from old.plan_expires_at
         or new.plan_note        is distinct from old.plan_note
         or new.is_admin         is distinct from old.is_admin
         or new.stripe_customer_id is distinct from old.stripe_customer_id then
        raise exception
          'profiles: les colonnes plan_tier/plan_expires_at/plan_note/is_admin/stripe_customer_id sont réservées au serveur'
          using errcode = 'insufficient_privilege';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_reject_sensitive_writes on public.profiles;
create trigger trg_profiles_reject_sensitive_writes
  before insert or update on public.profiles
  for each row execute function public.profiles_reject_sensitive_writes();

-- ── 2. Durcissement des fonctions admin SECURITY DEFINER ─────────────────────
-- 2a. search_path figé (évite l'injection de schéma dans une fonction DEFINER).
do $$
declare
  fn text;
  sigs text[] := array[
    'public.admin_get_activity_feed(integer)',
    'public.admin_get_event_breakdown(integer)',
    'public.admin_get_funnel()',
    'public.admin_get_grants(uuid)',
    'public.admin_get_kpis()',
    'public.admin_get_sessions_daily(integer)',
    'public.admin_get_signups_daily(integer)',
    'public.admin_get_user_activity(uuid, integer)',
    'public.admin_get_users()',
    'public.admin_get_users_activity_summary()',
    'public.admin_get_weekly_retention()',
    'public.admin_grant_pro(uuid, integer, text)',
    'public.admin_revoke_pro(uuid)',
    'public.update_last_seen()'
  ];
begin
  foreach fn in array sigs loop
    if to_regprocedure(fn) is not null then
      execute format('alter function %s set search_path = public', fn);
    end if;
  end loop;
end $$;

-- 2b. EXECUTE retiré à anon/public ; accordé au seul rôle authenticated
--     (les fonctions vérifient elles-mêmes is_admin en interne).
do $$
declare
  fn text;
  admin_sigs text[] := array[
    'public.admin_get_activity_feed(integer)',
    'public.admin_get_event_breakdown(integer)',
    'public.admin_get_funnel()',
    'public.admin_get_grants(uuid)',
    'public.admin_get_kpis()',
    'public.admin_get_sessions_daily(integer)',
    'public.admin_get_signups_daily(integer)',
    'public.admin_get_user_activity(uuid, integer)',
    'public.admin_get_users()',
    'public.admin_get_users_activity_summary()',
    'public.admin_get_weekly_retention()',
    'public.admin_grant_pro(uuid, integer, text)',
    'public.admin_revoke_pro(uuid)'
  ];
begin
  foreach fn in array admin_sigs loop
    if to_regprocedure(fn) is not null then
      execute format('revoke execute on function %s from anon, public', fn);
      execute format('grant execute on function %s to authenticated', fn);
    end if;
  end loop;
end $$;

-- update_last_seen : appelée par tout utilisateur connecté (session_start) → reste
-- exécutable par authenticated, mais retirée à anon.
do $$
begin
  if to_regprocedure('public.update_last_seen()') is not null then
    revoke execute on function public.update_last_seen() from anon;
    grant execute on function public.update_last_seen() to authenticated;
  end if;
end $$;

-- ── 3. plan_grants : la policy admin lit profiles.is_admin — désormais fiable ─
-- (is_admin ne peut plus être positionné par le client). On recible le rôle
-- authenticated et on optimise auth.uid() (advisor auth_rls_initplan).
drop policy if exists admins_manage_grants on public.plan_grants;
create policy admins_manage_grants on public.plan_grants
  for all to authenticated
  using ((select is_admin from public.profiles where id = (select auth.uid())))
  with check ((select is_admin from public.profiles where id = (select auth.uid())));
