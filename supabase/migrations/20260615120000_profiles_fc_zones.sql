-- Zones FC personnalisées (modèle + bornes ajustables). jsonb :
--   { "model": "fcmax"|"hrr"|"lthr", "bounds": [0.6,0.7,0.8,0.9],
--     "restingHr": number|null, "lthr": number|null }
-- NULL = pas de perso → zones par défaut (%FCmax 60/70/80/90).
alter table public.profiles
  add column if not exists fc_zones jsonb default null;
