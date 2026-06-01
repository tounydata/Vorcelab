-- ── JOURNAL DES SÉANCES (boucle d'adaptation — V1) ───────────────────────────
-- Lie une séance prévue (workoutId + date) à l'activité Strava confirmée par
-- l'athlète, et stocke le verdict compilé (allure / FC / dérive / D+ / RPE).
-- 100 % déterministe ; aucune donnée envoyée à un fournisseur d'IA.

create table if not exists session_log (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users on delete cascade,
  -- Séance prévue (le plan est régénéré côté client : on référence par id + date).
  planned_workout_id text not null,
  planned_date       date not null,
  week_phase         text,
  -- Liaison à l'activité (NULL = pas d'activité, verdict sur le ressenti seul).
  strava_activity_id text,
  -- Verdict compilé.
  verdict            text not null,           -- trop_facile | conforme | trop_dur | manquee
  confidence         text not null,           -- low | medium | high
  -- Métriques agrégées (pas de streams bruts ici).
  compliance_pace    text,                    -- easier | on | harder | unknown
  avg_hr_pct_max     numeric,
  hr_drift_pct       numeric,
  dplus_m            integer,
  duration_min       integer,
  -- Ressenti.
  feeling            text,                    -- good | ok | bad
  rpe                integer,
  reasons            jsonb not null default '[]',
  pain               boolean not null default false,
  created_at         timestamptz not null default now(),
  -- Une séance prévue ne se journalise qu'une fois.
  constraint session_log_unique unique (user_id, planned_workout_id, planned_date)
);

create index if not exists session_log_user_date_idx
  on session_log (user_id, planned_date desc);

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table session_log enable row level security;

create policy "session_log_own" on session_log
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
