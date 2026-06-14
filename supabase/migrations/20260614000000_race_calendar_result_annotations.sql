-- Étiquetage des arrêts de course (débrief) : motif posé par le coureur sur chaque
-- arrêt détecté OU ajouté manuellement (chute, crampe, ravito… — avec ou sans pause
-- de la montre). Tableau JSON d'objets { km, label, note? }.
alter table public.race_calendar add column if not exists result_annotations jsonb;
