-- Snapshots prospectifs — création CÔTÉ SERVEUR + manifeste complet (§4). Idempotente.
--
-- 1. Manifeste COMPLET des entrées : on ne se contente plus d'un COMPTE d'activités +
--    empreinte ; on fige la LISTE des activités (agrégats, jamais de GPS) qui ont alimenté
--    la projection → preuve prospective auditable et recalculable.
-- 2. Création SERVEUR uniquement : le client n'a plus le droit d'INSERT. Seul l'Edge Function
--    `lock-projection-snapshot` (service_role) crée les snapshots, après avoir vérifié serveur
--    que la course n'a pas commencé (borne faisant autorité depuis `race_calendar`). Le client
--    conserve SELECT (lecture) et UPDATE (ajout du résultat réel post-course, borné par le
--    trigger d'immuabilité).

-- 1. Colonne manifeste (agrégats uniquement).
alter table public.projection_validation_snapshots
  add column if not exists input_manifest jsonb not null default '[]'::jsonb;

comment on column public.projection_validation_snapshots.input_manifest is
  'Manifeste COMPLET des entrées (agrégats par activité : id, start_date, moving_time, distance, D+). Jamais de GPS brut. Fige la preuve prospective (§4).';

-- 2. Création serveur uniquement : plus d'INSERT client.
drop policy if exists "pvs_insert_own" on public.projection_validation_snapshots;
revoke insert on public.projection_validation_snapshots from authenticated;

-- 3. Trigger d'immuabilité renforcé : + `input_manifest` figé après création (remplace la
--    version de 20260719010000, mêmes règles + manifeste).
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
     or NEW.input_manifest          is distinct from OLD.input_manifest
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
