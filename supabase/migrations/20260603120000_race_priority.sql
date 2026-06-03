-- Priorité d'objectif des courses : A (principal) / B (secondaire) / C (rodage).
-- Cf. knowledge-base §10.1. Défaut 'A' → comportement inchangé.

alter table public.race_calendar
  add column if not exists priority text not null default 'A';

alter table public.race_calendar
  drop constraint if exists race_calendar_priority_check;

alter table public.race_calendar
  add constraint race_calendar_priority_check
  check (priority in ('A', 'B', 'C'));
