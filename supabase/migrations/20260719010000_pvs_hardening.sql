-- Durcissement des snapshots de validation (§14, revue) :
--   1. INTERDIRE le DELETE (les snapshots sont des PREUVES immuables — jamais supprimables
--      côté utilisateur ; seul le service_role conserve un accès d'administration).
--   2. Traçer toute INVALIDATION : colonne `invalidation_reason`, obligatoire dès que le
--      statut passe à `invalidated`, et figée ensuite.

-- 1. Interdiction de suppression : on retire la policy DELETE et le privilège DELETE.
drop policy if exists "pvs_delete_own" on public.projection_validation_snapshots;
revoke delete on public.projection_validation_snapshots from authenticated;

-- 2. Raison d'invalidation.
alter table public.projection_validation_snapshots
  add column if not exists invalidation_reason text;

-- 3. Trigger d'immuabilité renforcé (remplace la version précédente) : champs de preuve
--    figés + résultat écrit une seule fois + invalidation tracée et figée.
create or replace function public.enforce_snapshot_immutability()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if NEW.user_id                    is distinct from OLD.user_id
     or NEW.race_id                 is distinct from OLD.race_id
     or NEW.created_at              is distinct from OLD.created_at
     or NEW.race_start_at           is distinct from OLD.race_start_at
     or NEW.engine_version          is distinct from OLD.engine_version
     or NEW.profile_version         is distinct from OLD.profile_version
     or NEW.profile_schema_version  is distinct from OLD.profile_schema_version
     or NEW.prediction_central_s    is distinct from OLD.prediction_central_s
     or NEW.prediction_prudent_s    is distinct from OLD.prediction_prudent_s
     or NEW.prediction_aggressive_s is distinct from OLD.prediction_aggressive_s
     or NEW.history_start_at        is distinct from OLD.history_start_at
     or NEW.history_end_at          is distinct from OLD.history_end_at
     or NEW.activity_count          is distinct from OLD.activity_count
     or NEW.used_personal_fade      is distinct from OLD.used_personal_fade
     or NEW.used_steepness_calibration is distinct from OLD.used_steepness_calibration
     or NEW.used_fallback           is distinct from OLD.used_fallback
     or NEW.fallback_sources        is distinct from OLD.fallback_sources
     or NEW.input_fingerprint       is distinct from OLD.input_fingerprint
  then
    raise exception 'projection_validation_snapshots: champs de preuve immuables apres creation';
  end if;

  -- Le resultat reel ne s'ecrit qu'une fois.
  if OLD.result_recorded_at is not null
     and (NEW.result_moving_s   is distinct from OLD.result_moving_s
       or NEW.result_elapsed_s  is distinct from OLD.result_elapsed_s)
  then
    raise exception 'projection_validation_snapshots: resultat reel deja fige';
  end if;

  -- Toute invalidation doit etre justifiee, et la raison est figee une fois posee.
  if NEW.status = 'invalidated' and (NEW.invalidation_reason is null or length(btrim(NEW.invalidation_reason)) = 0) then
    raise exception 'projection_validation_snapshots: invalidation sans raison interdite';
  end if;
  if OLD.invalidation_reason is not null and NEW.invalidation_reason is distinct from OLD.invalidation_reason then
    raise exception 'projection_validation_snapshots: raison d''invalidation deja figee';
  end if;
  if NEW.status <> 'invalidated' and NEW.invalidation_reason is not null and OLD.invalidation_reason is null then
    raise exception 'projection_validation_snapshots: raison d''invalidation sans statut invalidated';
  end if;

  return NEW;
end;
$$;
