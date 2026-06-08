-- Cache des surfaces de terrain (OSM Overpass) par section de course, pour ne pas
-- ré-interroger Overpass à chaque ouverture de la stratégie. Aligné sur projection.sections.
alter table public.race_calendar add column if not exists surfaces jsonb;
