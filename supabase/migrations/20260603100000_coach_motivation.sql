-- Orientation d'entraînement du coach : plaisir / mix / performance.
-- Biaise le volume et l'intensité du plan (cf. knowledge-base §10.2).
-- Défaut 'mix' → comportement inchangé tant que l'utilisateur ne choisit pas.

alter table public.profiles
  add column if not exists coach_motivation text not null default 'mix';

alter table public.profiles
  drop constraint if exists profiles_coach_motivation_check;

alter table public.profiles
  add constraint profiles_coach_motivation_check
  check (coach_motivation in ('plaisir', 'mix', 'performance'));
