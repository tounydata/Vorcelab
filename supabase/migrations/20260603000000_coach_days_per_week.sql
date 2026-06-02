-- Jours de course / semaine pour le plan Coach (réglé dans les paramètres,
-- consommé par CoachPage). Regroupe ce réglage avec les autres paramètres
-- d'entraînement plutôt que de le laisser en état local volatile dans la page.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS coach_days_per_week smallint
  DEFAULT 5
  CHECK (coach_days_per_week BETWEEN 3 AND 6);

COMMENT ON COLUMN public.profiles.coach_days_per_week IS 'Jours de course/semaine choisis pour le plan Coach (3-6). Réglé dans les paramètres, consommé par CoachPage.';
