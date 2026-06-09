-- Étiquette « course / effort de référence » posée manuellement dans Vorcelab,
-- pour les courses que Strava n'a pas marquées (workout_type=1). Sert au Facteur
-- d'Intensité de Course : cale l'allure de projection sur l'effort de course réel.
ALTER TABLE public.strava_activities
  ADD COLUMN IF NOT EXISTS is_race boolean NOT NULL DEFAULT false;
