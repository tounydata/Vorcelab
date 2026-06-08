-- Persistance des points de ravitaillement saisis sur la stratégie de course.
-- Avant : les ravitos n'étaient qu'en état React → perdus au rechargement.
alter table public.race_calendar add column if not exists ravitos jsonb;
