-- ─────────────────────────────────────────────────────────────────────────────
-- Conformité Strava API Policy §6.2 / §5.5 / §5.7 — rétention du payload brut.
--
-- §6.2 : « You may not retain Strava Data in your cache for longer than seven (7)
-- days. » §5.5 interdit d'accumuler les Strava Data en un corpus persistant. §5.7
-- interdit spécifiquement de conserver les informations de localisation.
--
-- CONSTAT : `upsertStravaActivity` écrit la réponse Strava ENTIÈRE dans
-- `strava_activities.raw_data` (`raw_data: act`), et cette colonne n'est jamais
-- nettoyée. On y conserve donc indéfiniment le tracé encodé (`map.summary_polyline`),
-- les points de départ et d'arrivée (`start_latlng`, `end_latlng`), les splits, les
-- efforts de segment, le matériel — alors que le produit n'en lit que quatre champs.
--
-- CE QUE FAIT CETTE MIGRATION : au-delà de 7 jours, `raw_data` est réduit aux seules
-- clés effectivement consommées. Tout le reste — dont la totalité des données
-- géographiques — est effacé. Aucune ligne n'est supprimée, aucun champ lu par le
-- code ne disparaît : c'est une purge sans changement fonctionnel.
--
-- Clés conservées, et pourquoi :
--   • workout_type   → distingue une compétition (raceValidation, raceDetection)
--   • average_temp   → pénalités de conditions (buildRunnerProfile)
--   • exercise_sets  → séances de renforcement (renfoBackfill)
--   • source         → provenance d'un import CSV (StravaArchiveImport)
-- Ce sont des scalaires de modélisation, pas des données de localisation.
--
-- EFFET DE BORD ASSUMÉ : `fillMissingWeather` rattrape la météo via
-- `raw_data->start_latlng`. Au-delà de 7 jours ce rattrapage ne trouvera plus la
-- position et sera sans effet. C'est le comportement voulu : conserver la position de
-- départ d'une sortie pendant des mois est précisément ce que §5.7 interdit. La météo
-- déjà mise en cache, elle, est conservée — elle vient d'un fournisseur météo, ce
-- n'est pas une Strava Data.
--
-- CE QUE CETTE MIGRATION NE FAIT PAS : les résumés d'activité (distance, temps, D+)
-- et les `activity_streams` restent conservés au-delà de 7 jours. Le moteur en a
-- besoin (183 jours d'historique, 56 jours de streams) et les purger sans avoir
-- d'abord extrait les métriques dérivées par activité casserait les projections.
-- C'est le point ouvert documenté dans `docs/strava-conformite-2026-08.md` §2.3.
--
-- Idempotente : réexécutable, ne retouche que les lignes qui portent encore des clés
-- hors liste.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.purge_expired_strava_raw(p_days integer default 7)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cutoff timestamptz;
  v_rows   bigint := 0;
begin
  if p_days is null or p_days < 0 then
    raise exception 'purge_expired_strava_raw: p_days must be >= 0';
  end if;

  v_cutoff := now() - make_interval(days => p_days);

  update public.strava_activities
     set raw_data = coalesce(
           jsonb_strip_nulls(
             jsonb_build_object(
               'workout_type',  raw_data -> 'workout_type',
               'average_temp',  raw_data -> 'average_temp',
               'exercise_sets', raw_data -> 'exercise_sets',
               'source',        raw_data -> 'source'
             )
           ),
           '{}'::jsonb
         ),
         updated_at = now()
   where start_date < v_cutoff
     and raw_data is not null
     -- Ne réécrit que ce qui porte encore une clé hors liste → idempotent, et le
     -- second passage ne touche aucune ligne.
     and exists (
       select 1
         from jsonb_object_keys(raw_data) as k
        where k not in ('workout_type', 'average_temp', 'exercise_sets', 'source')
     );

  get diagnostics v_rows = row_count;

  return jsonb_build_object(
    'purged_at',     now(),
    'cutoff',        v_cutoff,
    'retention_days', p_days,
    'rows_stripped', v_rows
  );
end;
$$;

comment on function public.purge_expired_strava_raw(integer) is
  'Strava API Policy 6.2/5.7 : reduit strava_activities.raw_data aux seules cles consommees au-dela de la fenetre de retention (7 jours par defaut). Efface notamment polyline, start_latlng et end_latlng. Service role uniquement.';

revoke all on function public.purge_expired_strava_raw(integer) from public;
revoke all on function public.purge_expired_strava_raw(integer) from anon;
revoke all on function public.purge_expired_strava_raw(integer) from authenticated;

-- Rend la purge périodique peu coûteuse : elle ne balaie que l'historique ancien.
create index if not exists strava_activities_start_date_idx
  on public.strava_activities (start_date);

-- Rattrapage immédiat sur tout l'existant : sans cela, les payloads déjà stockés
-- (plusieurs milliers d'activités, remontant à 2018) resteraient intacts jusqu'au
-- premier passage planifié.
select public.purge_expired_strava_raw(7);
