-- ─────────────────────────────────────────────────────────────────────────────
-- Audit 2026-07-21 — correctifs performance RLS + index (advisors Supabase).
--
-- 1. Doubles policies permissives renfo_* : on garde users_own_renfo_* (déjà
--    optimisées `(select auth.uid())`, scope authenticated) et on supprime les
--    anciennes *_own non wrappées → une seule policy évaluée par requête.
-- 2. Policies restantes avec auth.uid() nu : recréées avec (select auth.uid())
--    (initplan : évalué une fois par requête, pas par ligne) et scope
--    authenticated (anon n'a jamais de auth.uid()).
-- 3. Index dupliqué renfo_exercise_log + index manquants sur les FK signalées.
-- Idempotente et sans changement de droits effectifs.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Doublons renfo_* : suppression des anciennes policies non optimisées ──
drop policy if exists renfo_exercise_log_own on public.renfo_exercise_log;
drop policy if exists renfo_max_lifts_own    on public.renfo_max_lifts;
drop policy if exists renfo_profile_own      on public.renfo_profile;
drop policy if exists renfo_program_own      on public.renfo_program;
drop policy if exists renfo_session_log_own  on public.renfo_session_log;

-- Les policies conservées (users_own_renfo_*) sont ALL sans WITH CHECK explicite
-- → PostgreSQL applique le USING aux écritures : comportement identique.

-- ── 2. Ré-écriture des policies avec (select auth.uid()) ─────────────────────
drop policy if exists users_own_streams on public.activity_streams;
create policy users_own_streams on public.activity_streams
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "users can manage own weather cache" on public.activity_weather;
create policy "users can manage own weather cache" on public.activity_weather
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists session_log_own on public.session_log;
create policy session_log_own on public.session_log
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can read own focus logs" on public.renfo_focus_log;
create policy "Users can read own focus logs" on public.renfo_focus_log
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own focus logs" on public.renfo_focus_log;
create policy "Users can insert own focus logs" on public.renfo_focus_log
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own focus logs" on public.renfo_focus_log;
create policy "Users can update own focus logs" on public.renfo_focus_log
  for update to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own focus logs" on public.renfo_focus_log;
create policy "Users can delete own focus logs" on public.renfo_focus_log
  for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists users_select_own_events on public.user_events;
create policy users_select_own_events on public.user_events
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists users_insert_own_events on public.user_events;
create policy users_insert_own_events on public.user_events
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- ── 3. Index ─────────────────────────────────────────────────────────────────
-- Dupliqué (identique à renfo_exercise_log_user_exo_idx)
drop index if exists public.idx_renfo_exo_log_user_exo_date;

-- FK sans index couvrant (advisors) : accélère les CASCADE de suppression de
-- compte (RGPD) et les jointures admin.
create index if not exists plan_grants_user_id_idx on public.plan_grants (user_id);
create index if not exists plan_grants_granted_by_idx on public.plan_grants (granted_by);
create index if not exists pvs_race_id_idx on public.projection_validation_snapshots (race_id);
create index if not exists race_calendar_result_activity_idx
  on public.race_calendar (result_activity_id) where result_activity_id is not null;
