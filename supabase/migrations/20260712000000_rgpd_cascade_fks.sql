-- ─────────────────────────────────────────────────────────────────────────────
-- RGPD — suppression de compte transactionnelle par CASCADE.
--
-- Avant : profiles, activities_history, race_calendar, strava_tokens référençaient
-- auth.users en NO ACTION → supprimer l'utilisateur Auth échouait (ou laissait des
-- orphelins), d'où un delete-account qui supprimait table par table en continuant
-- malgré les erreurs (risque de suppression partielle + user Auth orphelin).
--
-- Après : ces FK passent en ON DELETE CASCADE ⇒ `delete from auth.users` (ou
-- auth.admin.deleteUser) efface TOUTES les données de l'utilisateur en une seule
-- transaction. plan_grants.granted_by passe en SET NULL pour préserver l'historique
-- des grants d'AUTRES utilisateurs quand un administrateur est supprimé.
--
-- Idempotente (drop constraint if exists + add).
-- ─────────────────────────────────────────────────────────────────────────────

-- profiles.id → auth.users : CASCADE (déclenche en chaîne user_events, etc.)
alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.profiles
  add constraint profiles_id_fkey foreign key (id)
  references auth.users(id) on delete cascade;

-- activities_history.user_id → CASCADE
alter table public.activities_history drop constraint if exists activities_history_user_id_fkey;
alter table public.activities_history
  add constraint activities_history_user_id_fkey foreign key (user_id)
  references auth.users(id) on delete cascade;

-- race_calendar.user_id → CASCADE
alter table public.race_calendar drop constraint if exists race_calendar_user_id_fkey;
alter table public.race_calendar
  add constraint race_calendar_user_id_fkey foreign key (user_id)
  references auth.users(id) on delete cascade;

-- strava_tokens.user_id → CASCADE
alter table public.strava_tokens drop constraint if exists strava_tokens_user_id_fkey;
alter table public.strava_tokens
  add constraint strava_tokens_user_id_fkey foreign key (user_id)
  references auth.users(id) on delete cascade;

-- plan_grants.granted_by → SET NULL (l'admin qui a accordé peut être supprimé sans
-- effacer le grant d'un autre utilisateur ; on rend la colonne nullable).
alter table public.plan_grants alter column granted_by drop not null;
alter table public.plan_grants drop constraint if exists plan_grants_granted_by_fkey;
alter table public.plan_grants
  add constraint plan_grants_granted_by_fkey foreign key (granted_by)
  references auth.users(id) on delete set null;
