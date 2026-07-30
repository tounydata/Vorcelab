-- ─────────────────────────────────────────────────────────────────────────────
-- PERSISTANCE du verdict de détection de course.
--
-- Contexte (mesuré en prod, base `runnerdata`, 2026-07-30) : 3 739 activités,
-- 12 seulement portent `is_race`. Trois athlètes cumulent 501, 662 et 677 sorties
-- à pied SANS aucune course étiquetée — alors que le détecteur livré en 2026.07-11
-- en reconnaît une trentaine. Le verdict n'étant calculé qu'en mémoire au moment de
-- la projection, ces courses sont invisibles : impossible de les compter, de les
-- auditer, ni de les servir au banc de validation.
--
-- Ces colonnes rendent le verdict OBSERVABLE. Elles ne changent AUCUNE projection :
-- le moteur continue de recalculer sa décision en mémoire (cf. en-tête de
-- `src/lib/raceDetectionPersistence.ts`), et `ENGINE_VERSION` reste inchangé.
--
-- Écriture réservée au SERVEUR (job `detect-races`) : un client qui pourrait écrire
-- `race_detection_status = 'confirmed'` s'auto-déclarerait des compétitions et
-- déplacerait durablement son propre ancrage — c'est exactement ce que la détection
-- automatique cherche à éviter (précision avant rappel). Même garde-fou que les
-- colonnes sensibles de `profiles` (20260710000000_secure_profiles_and_admin.sql).
--
-- Idempotente : réexécutable sans effet de bord.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Colonnes ──────────────────────────────────────────────────────────────
alter table public.strava_activities
  add column if not exists race_detection_status  text,
  add column if not exists race_detection_reasons text[],
  add column if not exists race_detection_version text,
  add column if not exists race_detection_at      timestamptz;

comment on column public.strava_activities.race_detection_status is
  'Verdict validateRaceCandidate : confirmed | pending | rejected. Écrit par le job detect-races ; n''influence AUCUNE projection (le moteur recalcule en mémoire).';
comment on column public.strava_activities.race_detection_reasons is
  'Codes machine anonymisés expliquant le verdict (jamais de nom d''activité ni de coordonnée).';
comment on column public.strava_activities.race_detection_version is
  'Règle de détection + périmètre du rang de FC (RACE_DETECTION_VERSION) ayant produit le verdict.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.strava_activities'::regclass
      and conname = 'strava_activities_race_detection_status_check'
  ) then
    alter table public.strava_activities
      add constraint strava_activities_race_detection_status_check
      check (race_detection_status is null
             or race_detection_status in ('confirmed', 'pending', 'rejected'));
  end if;
end $$;

-- ── 2. Index : les compétitions confirmées sont la seule cible des lectures ───
-- Partiel : ~1 % des lignes. Sert le banc (courses d'un athlète, par date) et le
-- comptage d'observabilité.
create index if not exists idx_strava_activities_confirmed_races
  on public.strava_activities (user_id, start_date desc)
  where race_detection_status = 'confirmed';

-- ── 3. Garde-fou : colonnes réservées au serveur ─────────────────────────────
-- SECURITY INVOKER (défaut) : `current_user` reflète le rôle réel de l'appelant.
--   • requête API authentifiée / anonyme → 'authenticated' / 'anon'  → bloqué
--   • job service role, fonction DEFINER → 'service_role' / owner    → autorisé
-- Le client garde le droit d'écrire tout le reste de la ligne (sync Strava).
create or replace function public.strava_activities_reject_detection_writes()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      -- Une insertion cliente (sync Strava) ne porte jamais de verdict : elle est
      -- qualifiée ensuite par le job serveur.
      if new.race_detection_status is not null
         or new.race_detection_reasons is not null
         or new.race_detection_version is not null
         or new.race_detection_at is not null then
        raise exception
          'strava_activities: les colonnes race_detection_* sont réservées au serveur'
          using errcode = 'insufficient_privilege';
      end if;
    elsif tg_op = 'UPDATE' then
      if new.race_detection_status  is distinct from old.race_detection_status
         or new.race_detection_reasons is distinct from old.race_detection_reasons
         or new.race_detection_version is distinct from old.race_detection_version
         or new.race_detection_at      is distinct from old.race_detection_at then
        raise exception
          'strava_activities: les colonnes race_detection_* sont réservées au serveur'
          using errcode = 'insufficient_privilege';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_strava_activities_reject_detection_writes on public.strava_activities;
create trigger trg_strava_activities_reject_detection_writes
  before insert or update on public.strava_activities
  for each row execute function public.strava_activities_reject_detection_writes();

-- ── 4. Écriture par LOT (un seul statement par lot) ──────────────────────────
-- Le job qualifie plusieurs milliers d'activités. Une requête HTTP par ligne ferait
-- expirer l'Edge Function ; cette fonction applique un lot entier d'un coup.
--
-- SECURITY DEFINER : s'exécute avec les droits du propriétaire, donc le garde-fou du
-- point 3 la laisse passer — c'est le chemin d'écriture serveur légitime. EXECUTE est
-- retiré à tout le monde SAUF service_role : un client authentifié ne peut pas s'en
-- servir pour se déclarer des compétitions.
--
-- `search_path` figé (défense en profondeur : pas d'injection de schéma dans un DEFINER).
create or replace function public.apply_race_detection(rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  touched integer;
begin
  if rows is null or jsonb_typeof(rows) <> 'array' then
    return 0;
  end if;

  with incoming as (
    select *
    from jsonb_to_recordset(rows) as r(
      user_id            uuid,
      strava_activity_id bigint,
      status             text,
      reasons            text[],
      version            text
    )
  )
  update public.strava_activities a
     set race_detection_status  = i.status,
         race_detection_reasons = i.reasons,
         race_detection_version = i.version,
         race_detection_at      = now()
    from incoming i
   where a.user_id = i.user_id
     and a.strava_activity_id = i.strava_activity_id
     -- Ré-écriture uniquement si le verdict ou la règle a bougé : un passage sans
     -- changement ne touche aucune ligne (job réexécutable en boucle sans coût).
     and (a.race_detection_status  is distinct from i.status
          or a.race_detection_version is distinct from i.version);

  get diagnostics touched = row_count;
  return touched;
end;
$$;

revoke all on function public.apply_race_detection(jsonb) from public, anon, authenticated;
grant execute on function public.apply_race_detection(jsonb) to service_role;
