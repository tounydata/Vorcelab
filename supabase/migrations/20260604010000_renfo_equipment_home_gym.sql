-- Matériel renfo séparé maison / salle, pour proposer les bonnes variantes selon le lieu
-- choisi au lancement de la séance (avant : un seul jeu d'équipement → variantes figées).
-- La « salle » démarre en salle complète (l'utilisateur décoche ce qui manque) ; le
-- matériel déjà saisi devient le matériel « maison » au backfill.
alter table public.renfo_profile
  add column if not exists equipment_home jsonb not null default '{}'::jsonb,
  add column if not exists equipment_gym  jsonb not null default '{"barbell":true,"bench":true,"pullup_bar":true,"step":true,"anchor_point":true,"leg_press":true,"dumbbells_max_kg":40,"kettlebell_max_kg":32}'::jsonb;

update public.renfo_profile
  set equipment_home = coalesce(equipment, '{}'::jsonb)
  where equipment_home = '{}'::jsonb and equipment is not null and equipment <> '{}'::jsonb;
