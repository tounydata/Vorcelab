-- Ordre des sections du dashboard, choisi par l'utilisateur et synchronisé
-- entre appareils (remplace le localStorage seul). NULL = ordre par défaut.
alter table public.profiles
  add column if not exists dashboard_layout text[] default null;
