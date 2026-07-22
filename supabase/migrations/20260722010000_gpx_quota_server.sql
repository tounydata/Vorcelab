-- ─────────────────────────────────────────────────────────────────────────────
-- AUDIT 2026-07-22 — P0.4 revenu : le quota commercial est décidé PAR LA BASE.
--
-- Avant : la limite « 1 stratégie GPX en plan gratuit » n'existait que dans
-- l'interface (RaceStrategyPage : isGated). Un client modifié ou un appel API
-- direct pouvait attacher un GPX à toutes ses courses. Désormais un trigger
-- BEFORE INSERT/UPDATE sur race_calendar applique la même règle que le client :
--   ajouter un gpx_data à une course alors qu'une AUTRE course en a déjà un
--   → réservé au plan PRO (entitlement serveur, repli profiles, admin).
--
-- Journalisation : chaque ACCORD d'ajout GPX est tracé dans user_events
-- (gpx_quota_granted, meta.tier). Les REFUS lèvent une exception — l'insertion
-- d'un event dans la même transaction serait annulée par le rollback, le refus
-- est donc journalisé côté client (event gpx_quota_denied, cf. RaceStrategyPage)
-- et reste observable côté serveur via les logs Postgres (RAISE).
--
-- Le remplacement du GPX d'une course qui en avait déjà un reste permis (même
-- règle que le client). service_role et fonctions serveur ne sont pas limités.
-- Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

-- Niveau de plan effectif — réplique SQL de resolvePlanTier/effectiveTier
-- (src/lib/planResolver.ts + _shared/stripeEntitlement.ts) :
--   admin → pro ; entitlement active/trialing → pro ; canceled/past_due avec
--   période payée encore en cours → pro ; repli profiles.plan_tier ; sinon free.
create or replace function public.effective_plan_tier(p_user uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_is_admin boolean;
  v_plan_tier text;
  v_plan_expires timestamptz;
  v_status text;
  v_period_end timestamptz;
begin
  select is_admin, plan_tier, plan_expires_at
    into v_is_admin, v_plan_tier, v_plan_expires
    from public.profiles where id = p_user;
  if coalesce(v_is_admin, false) then return 'pro'; end if;

  select status, current_period_end
    into v_status, v_period_end
    from public.user_entitlements where user_id = p_user;
  if v_status in ('active', 'trialing') then return 'pro'; end if;
  if v_status in ('canceled', 'past_due')
     and v_period_end is not null and v_period_end > now() then
    return 'pro';
  end if;

  -- Repli transitoire (source historique, non modifiable par le client).
  if v_plan_tier = 'pro' and (v_plan_expires is null or v_plan_expires > now()) then
    return 'pro';
  end if;
  return 'free';
end;
$$;

revoke execute on function public.effective_plan_tier(uuid) from anon, public;
grant execute on function public.effective_plan_tier(uuid) to authenticated, service_role;

-- Trigger de quota : SECURITY INVOKER (comme profiles_reject_sensitive_writes)
-- pour que current_user reflète le RÔLE RÉEL de l'appelant — en DEFINER il
-- vaudrait le propriétaire de la fonction et le garde-fou ne s'appliquerait
-- jamais. Le comptage des courses passe par la RLS de l'appelant (ses propres
-- lignes — exactement le périmètre du quota) ; la lecture du plan passe par
-- effective_plan_tier (DEFINER). Le serveur (service_role) garde tous ses droits.
create or replace function public.race_calendar_enforce_gpx_quota()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_tier text;
  v_other_gpx int;
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;

  -- Seul l'AJOUT d'un GPX est soumis au quota (pas le remplacement/suppression).
  if new.gpx_data is null then return new; end if;
  if tg_op = 'UPDATE' and old.gpx_data is not null then return new; end if;

  v_tier := public.effective_plan_tier(new.user_id);
  if v_tier <> 'pro' then
    select count(*) into v_other_gpx
      from public.race_calendar
      where user_id = new.user_id and gpx_data is not null and id is distinct from new.id;
    if v_other_gpx >= 1 then
      raise exception
        'quota gratuit atteint : 1 stratégie GPX incluse — passe à PRO pour analyser toutes tes courses'
        using errcode = 'insufficient_privilege', hint = 'gpx_quota';
    end if;
  end if;

  -- Accord journalisé (l'event suit la transaction : il n'existe que si
  -- l'écriture du GPX aboutit réellement).
  insert into public.user_events (user_id, event, meta)
    values (new.user_id, 'gpx_quota_granted', jsonb_build_object('tier', v_tier, 'race_id', new.id));
  return new;
end;
$$;

revoke execute on function public.race_calendar_enforce_gpx_quota() from anon, authenticated, public;

drop trigger if exists trg_race_calendar_gpx_quota on public.race_calendar;
create trigger trg_race_calendar_gpx_quota
  before insert or update on public.race_calendar
  for each row execute function public.race_calendar_enforce_gpx_quota();
