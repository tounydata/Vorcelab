-- ── MOTEUR D'ALLURES (Épopée A) — persistance dans profiles ───────────────────────
-- Champs dérivés par src/lib/paceEngine.ts. La FCmax reste individuelle (fc_max existant) ;
-- fc_repos s'ajoute pour les zones FC de réserve (Karvonen).
-- RLS : profiles est déjà protégée par les politiques user-own (20260506000000) ;
-- ces colonnes appartiennent à la même ligne, aucune politique supplémentaire requise.

alter table public.profiles add column if not exists vdot              real;
alter table public.profiles add column if not exists vma_kmh           real;
alter table public.profiles add column if not exists lthr              integer;
alter table public.profiles add column if not exists fc_repos          integer;
-- Provenance de la mesure : 'race' | 'field_test' | 'manual'
alter table public.profiles add column if not exists pace_source       text;
-- Date de la mesure (pour le flag « à retester » au-delà de ~6-8 semaines)
alter table public.profiles add column if not exists paces_measured_at timestamptz;
-- Confiance : 'good' | 'medium' | 'low'
alter table public.profiles add column if not exists pace_confidence   text;
