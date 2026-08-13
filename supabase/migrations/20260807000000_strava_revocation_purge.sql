-- ─────────────────────────────────────────────────────────────────────────────
-- Conformité Strava API Policy §7.4 (b) — purge sur révocation d'autorisation.
--
-- §7.4 impose, lorsqu'un utilisateur révoque l'autorisation d'accès à son compte
-- Strava, la suppression permanente de TOUTES les Strava Data et de toutes les
-- Personal Data qui en dérivent, sous 30 jours.
--
-- Avant : `strava-disconnect` ne supprimait que `strava_tokens`. Activités,
-- streams, météo, snapshots de projection et profil coureur restaient en base
-- indéfiniment. La révocation faite depuis Strava (webhook athlète) n'était même
-- pas détectée — voir la migration jumelle côté Edge Functions.
--
-- Cette fonction est le point unique de purge, appelé par les DEUX chemins
-- (bouton de déconnexion et webhook de désautorisation). Elle est transactionnelle :
-- soit tout est supprimé, soit rien, et l'appelant peut réessayer.
--
-- DEUX CATÉGORIES, traitées différemment :
--
--   1. Données Strava ou dérivées de Strava → SUPPRIMÉES.
--      strava_tokens, strava_activities, activity_streams, activity_weather,
--      projection_validation_snapshots, strava_webhook_events, et le profil
--      coureur reconstruit depuis l'historique (runner_profile).
--
--   2. Contenu créé par l'utilisateur qui RÉFÉRENCE une activité Strava →
--      CONSERVÉ, lien Strava coupé. Une course saisie au calendrier ou une séance
--      de renfo journalisée appartiennent à l'utilisateur ; les effacer parce
--      qu'elles pointent vers une activité Strava détruirait son travail au-delà
--      de ce qu'exige §7.4.
--
-- Ce qui N'EST PAS touché : `fc_max`, taille, sexe, date de naissance, objectifs,
-- tests manuels (demi-Cooper, seuil) et coefficients saisis. Ce sont des données
-- fournies par l'utilisateur à Vorcelab, pas des Strava Data.
--
-- CASCADES déjà en place, sur lesquelles on s'appuie :
--   • activity_nutrition_log.activity_id → strava_activities ON DELETE CASCADE
--   • race_calendar.result_activity_id   → strava_activities ON DELETE SET NULL
--
-- SECURITY DEFINER : appelée par les Edge Functions avec la service role key ;
-- le `search_path` est figé, et la fonction n'est PAS exposée à `authenticated`
-- (révocation explicite plus bas) — un client ne peut pas purger un autre compte.
--
-- Idempotente : une seconde exécution ne supprime plus rien et renvoie des
-- compteurs à zéro.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.purge_strava_data(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_athlete_id bigint;
  v_activities bigint := 0;
  v_streams    bigint := 0;
  v_weather    bigint := 0;
  v_snapshots  bigint := 0;
  v_events     bigint := 0;
  v_renfo      bigint := 0;
  v_tokens     bigint := 0;
begin
  if p_user_id is null then
    raise exception 'purge_strava_data: p_user_id is required';
  end if;

  -- L'identifiant athlète sert à purger les événements webhook, qui ne portent
  -- pas de user_id. Lu AVANT de supprimer le jeton.
  select strava_athlete_id into v_athlete_id
    from public.strava_tokens where user_id = p_user_id;

  -- ── 1. Données Strava et dérivées ─────────────────────────────────────────

  delete from public.activity_streams where user_id = p_user_id;
  get diagnostics v_streams = row_count;

  delete from public.activity_weather where user_id = p_user_id;
  get diagnostics v_weather = row_count;

  -- Les snapshots figent une projection calculée à partir de l'historique Strava :
  -- données dérivées au sens de §7.4.
  delete from public.projection_validation_snapshots where user_id = p_user_id;
  get diagnostics v_snapshots = row_count;

  -- Emporte en cascade activity_nutrition_log, et remet à NULL
  -- race_calendar.result_activity_id (ON DELETE SET NULL) — la course reste.
  delete from public.strava_activities where user_id = p_user_id;
  get diagnostics v_activities = row_count;

  if v_athlete_id is not null then
    delete from public.strava_webhook_events where owner_id = v_athlete_id;
    get diagnostics v_events = row_count;
  end if;

  -- ── 2. Contenu utilisateur : on coupe le lien Strava, on garde la ligne ────

  -- Séances de renfo importées depuis une activité Strava : la séance reste
  -- (c'est l'entraînement de l'utilisateur), l'identifiant Strava s'en va.
  update public.renfo_session_log
     set source_activity_id = null
   where user_id = p_user_id
     and source_activity_id is not null;
  get diagnostics v_renfo = row_count;

  -- ── 3. Profil : effacer ce qui est reconstruit depuis Strava ──────────────
  -- `runner_profile` est intégralement dérivé des activités (buckets d'allure par
  -- pente, VAM, dérive, récupération) — cf. compute-runner-profile, seul écrivain
  -- de ces deux colonnes.
  update public.profiles
     set runner_profile    = null,
         runner_profile_at = null
   where id = p_user_id
     and (runner_profile is not null or runner_profile_at is not null);

  -- ── 4. Jeton en dernier : il porte l'identifiant athlète lu plus haut ─────
  delete from public.strava_tokens where user_id = p_user_id;
  get diagnostics v_tokens = row_count;

  return jsonb_build_object(
    'user_id',        p_user_id,
    'purged_at',      now(),
    'tokens',         v_tokens,
    'activities',     v_activities,
    'streams',        v_streams,
    'weather',        v_weather,
    'snapshots',      v_snapshots,
    'webhook_events', v_events,
    'renfo_unlinked', v_renfo
  );
end;
$$;

comment on function public.purge_strava_data(uuid) is
  'Strava API Policy 7.4 : purge des Strava Data et donnees derivees sur revocation. Appelee par strava-disconnect et strava-webhook (desautorisation athlete). Service role uniquement.';

-- Jamais appelable par un client authentifié : la purge passe par les Edge
-- Functions, qui vérifient l'identité de l'appelant.
revoke all on function public.purge_strava_data(uuid) from public;
revoke all on function public.purge_strava_data(uuid) from anon;
revoke all on function public.purge_strava_data(uuid) from authenticated;
