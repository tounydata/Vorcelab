-- Durcissement : sécurité + performance RLS (d'après les advisors Supabase).
-- Aucune modification fonctionnelle : on préserve EXACTEMENT la même sémantique
-- d'accès (un utilisateur ne voit/écrit que ses propres lignes), on optimise.
--
-- 1) Sécurité : handle_new_user() est une fonction de TRIGGER (sur auth.users).
--    Elle n'a aucune raison d'être appelable via l'API REST (/rpc). Le trigger
--    continue de tourner (il s'exécute avec les droits du propriétaire de la
--    fonction, indépendamment des GRANT de rôle) — on retire juste l'EXECUTE public.
revoke execute on function public.handle_new_user() from anon, authenticated, public;

-- 2) Perf RLS — auth_rls_initplan : remplacer `auth.uid()` par `(select auth.uid())`
--    pour que Postgres l'évalue UNE fois par requête au lieu d'une fois par ligne.
--    On cible aussi le rôle `authenticated` (anon ne matche jamais user_id de toute façon).

-- activity_streams
drop policy if exists "users_own_streams" on public.activity_streams;
create policy "users_own_streams" on public.activity_streams
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- activity_weather
drop policy if exists "users can manage own weather cache" on public.activity_weather;
create policy "users can manage own weather cache" on public.activity_weather
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- session_log
drop policy if exists "session_log_own" on public.session_log;
create policy "session_log_own" on public.session_log
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- renfo_focus_log (4 policies par commande)
drop policy if exists "Users can read own focus logs" on public.renfo_focus_log;
create policy "Users can read own focus logs" on public.renfo_focus_log
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own focus logs" on public.renfo_focus_log;
create policy "Users can insert own focus logs" on public.renfo_focus_log
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own focus logs" on public.renfo_focus_log;
create policy "Users can update own focus logs" on public.renfo_focus_log
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own focus logs" on public.renfo_focus_log;
create policy "Users can delete own focus logs" on public.renfo_focus_log
  for delete to authenticated using ((select auth.uid()) = user_id);

-- 3) Perf RLS — multiple_permissive_policies : ces 5 tables ont DEUX policies
--    redondantes. La version `users_own_*` (rôle authenticated, déjà en
--    `(select auth.uid())`) est conservée ; on retire la vieille `_own` (rôle
--    public, non optimisée). Elles sont équivalentes (anon ne matche jamais).
drop policy if exists "renfo_exercise_log_own" on public.renfo_exercise_log;
drop policy if exists "renfo_max_lifts_own"    on public.renfo_max_lifts;
drop policy if exists "renfo_profile_own"      on public.renfo_profile;
drop policy if exists "renfo_program_own"      on public.renfo_program;
drop policy if exists "renfo_session_log_own"  on public.renfo_session_log;

-- 4) Perf index
-- FK sans index couvrant (comparaison projection ↔ activité résultat).
create index if not exists race_calendar_result_activity_id_idx
  on public.race_calendar(result_activity_id);

-- Index dupliqué (identique à idx_renfo_exo_log_user_exo_date).
drop index if exists public.renfo_exercise_log_user_exo_idx;

-- NON traités ici (volontaire) :
--  • get_shared_race : SECURITY DEFINER appelable par anon → INTENTIONNEL (page de
--    partage publique par token, doit contourner la RLS). On garde.
--  • strava_tokens / strava_webhook_events : RLS active sans policy = deny-all =
--    l'état SÉCURISÉ voulu (accès service-role uniquement). NE PAS ajouter de policy.
--  • leaked_password_protection : réglage Auth (dashboard), pas du SQL → à activer
--    côté Supabase Auth.
