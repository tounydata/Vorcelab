-- Lien course → activité Strava réelle (résultat), pour la comparaison projection vs réel.
-- Nullable : renseigné une fois la course courue et l'activité associée (auto-détection + confirmation).
ALTER TABLE public.race_calendar
  ADD COLUMN IF NOT EXISTS result_activity_id uuid
    REFERENCES public.strava_activities(id) ON DELETE SET NULL;
