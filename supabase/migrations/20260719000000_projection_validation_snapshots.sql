-- Snapshots PROSPECTIFS de projection (§14) : fondation d'une validation scientifique
-- crédible. Lorsqu'une projection est générée pour une course FUTURE, on peut en figer un
-- instantané immuable. Une fois la course commencée, seul l'ajout du résultat réel (moving
-- + elapsed) est autorisé — la prédiction et l'empreinte d'entrées ne bougent plus, ce qui
-- prouve que la projection n'a pas été recalculée après coup.
--
-- Aucune donnée GPS brute ici : seulement l'empreinte déterministe (input_fingerprint) des
-- entrées pertinentes. RLS stricte : user_id = auth.uid() (USING + WITH CHECK).

create table if not exists public.projection_validation_snapshots (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null references auth.users(id) on delete cascade,
  race_id                     uuid references public.race_calendar(id) on delete set null,
  created_at                  timestamptz not null default now(),
  race_start_at               timestamptz not null,

  -- Provenance figée (preuve prospective)
  engine_version              text not null,
  profile_version             text not null,
  profile_schema_version      text not null,

  -- Prédiction figée (secondes)
  prediction_central_s        integer not null,
  prediction_prudent_s        integer not null,
  prediction_aggressive_s     integer not null,

  -- Fenêtre d'historique ayant alimenté la projection
  history_start_at            timestamptz not null,
  history_end_at              timestamptz not null,
  activity_count              integer not null,

  -- Drapeaux d'explicabilité
  used_personal_fade          boolean not null default false,
  used_steepness_calibration  boolean not null default false,
  used_fallback               boolean not null default false,
  fallback_sources            text[]  not null default '{}',

  -- Empreinte déterministe des entrées (PAS de GPS brut)
  input_fingerprint           text not null,

  status                      text not null default 'locked'
                                check (status in ('locked','evaluated','invalidated')),

  -- Résultat réel, ajouté après la course (moving + elapsed, jamais l'un sans l'autre côté appli)
  result_moving_s             integer,
  result_elapsed_s            integer,
  result_recorded_at          timestamptz
);

comment on table public.projection_validation_snapshots is
  'Instantanés immuables de projection pour course future : preuve prospective (§14). Pas de GPS brut.';

create index if not exists idx_pvs_user_race
  on public.projection_validation_snapshots (user_id, race_id);
create index if not exists idx_pvs_user_status
  on public.projection_validation_snapshots (user_id, status);

-- ── RLS : un utilisateur ne voit et ne gère que SES propres snapshots ──────────────────
alter table public.projection_validation_snapshots enable row level security;

drop policy if exists "pvs_select_own" on public.projection_validation_snapshots;
create policy "pvs_select_own" on public.projection_validation_snapshots
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "pvs_insert_own" on public.projection_validation_snapshots;
create policy "pvs_insert_own" on public.projection_validation_snapshots
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "pvs_update_own" on public.projection_validation_snapshots;
create policy "pvs_update_own" on public.projection_validation_snapshots
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "pvs_delete_own" on public.projection_validation_snapshots;
create policy "pvs_delete_own" on public.projection_validation_snapshots
  for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.projection_validation_snapshots to authenticated;

-- ── Immuabilité : RLS gère la PROPRIÉTÉ, ce trigger gère l'IMMUABILITÉ ────────────────
-- Une fois le snapshot créé, les champs de PREUVE (prédiction, versions, empreinte,
-- fenêtre) ne peuvent plus changer. Seuls le résultat réel et la transition de `status`
-- (locked → evaluated/invalidated) sont autorisés. SECURITY INVOKER (pas de DEFINER).
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
    raise exception 'projection_validation_snapshots: champs de preuve immuables après création';
  end if;
  -- Le résultat réel ne peut être écrit qu'UNE fois (pas de réécriture a posteriori).
  if OLD.result_recorded_at is not null
     and (NEW.result_moving_s   is distinct from OLD.result_moving_s
       or NEW.result_elapsed_s  is distinct from OLD.result_elapsed_s)
  then
    raise exception 'projection_validation_snapshots: résultat réel déjà figé';
  end if;
  return NEW;
end;
$$;

revoke execute on function public.enforce_snapshot_immutability() from anon, authenticated, public;

drop trigger if exists trg_pvs_immutable on public.projection_validation_snapshots;
create trigger trg_pvs_immutable
  before update on public.projection_validation_snapshots
  for each row execute function public.enforce_snapshot_immutability();
