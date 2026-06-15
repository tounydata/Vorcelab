-- Résultat du test demi-Cooper (6 min à fond) pour calibrer la VMA/CS du plan.
-- jsonb { "distanceM": number, "dateISO": "yyyy-mm-dd" }.
-- NULL = pas de test → le coach retombe sur l'historique récent (courses étiquetées).
alter table public.profiles
  add column if not exists demi_cooper jsonb default null;
