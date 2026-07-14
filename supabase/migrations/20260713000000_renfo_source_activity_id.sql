-- ─────────────────────────────────────────────────────────────────────────────
-- Renfo — déduplication par identifiant d'activité Strava (et non par date).
--
-- Avant : unique (user_id, session_date, focus) → deux séances de renforcement le
-- MÊME jour avec le même focus, venant de DEUX activités Strava différentes,
-- s'écrasaient (la 2ᵉ était perdue). Le webhook et le rattrapage dédupliquaient
-- aussi par date, pas par l'id réel de l'activité.
--
-- Après : on ajoute `source_activity_id` (id Strava) et on déduplique dessus.
--   • unique (user_id, source, source_activity_id) WHERE source_activity_id NOT NULL
--     → import idempotent par activité ; deux activités le même jour coexistent.
--   • l'ancienne unique (user_id, date, focus) ne s'applique plus qu'aux séances
--     SANS source_activity_id (saisies MANUELLES) → on garde l'anti-doublon manuel.
--
-- Idempotente. Les lignes Strava historiques (source_activity_id NULL) restent
-- valides ; la logique de rattrapage évite de les ré-importer (voir renfoBackfill).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.renfo_session_log
  add column if not exists source_activity_id text;

-- Dédup Strava par id réel d'activité.
create unique index if not exists renfo_session_log_source_activity_key
  on public.renfo_session_log (user_id, source, source_activity_id)
  where source_activity_id is not null;

-- Anti-doublon manuel : l'ancienne unique date+focus ne vise plus que les séances
-- sans id d'activité (saisies à la main).
drop index if exists public.renfo_session_log_user_date_focus_key;
create unique index if not exists renfo_session_log_user_date_focus_key
  on public.renfo_session_log (user_id, session_date, focus)
  where focus is not null and source_activity_id is null;
