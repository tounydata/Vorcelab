-- Filet anti-doublon : un athlète Strava = un seul compte Vorcelab.
-- Le code (strava-auth / strava-oauth) déduplique déjà via une recherche par
-- strava_athlete_id, mais rien au niveau base ne l'empêchait en cas de double
-- inscription simultanée. Cet index unique le garantit définitivement.
-- (Appliqué en prod le 2026-07-09 via le connecteur ; fichier tracé pour l'historique.)
create unique index if not exists strava_tokens_athlete_unique
  on public.strava_tokens (strava_athlete_id);
