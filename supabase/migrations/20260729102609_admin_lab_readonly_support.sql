-- ─────────────────────────────────────────────────────────────────────────────
-- LABO ADMIN — consultation support en lecture seule et journalisée.
--
-- Le compte administrateur peut consulter un instantané utile au support sans
-- recevoir les secrets techniques (tokens Strava, identifiant Stripe, payloads
-- bruts, streams GPS ou GPX). Chaque ouverture exige un motif et laisse une
-- trace durable.
--
-- Les deux RPC sont SECURITY DEFINER car les données restent protégées par RLS.
-- Elles vérifient is_admin côté serveur, épinglent search_path et ne sont jamais
-- exécutables par anon/PUBLIC.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.admin_data_access_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete restrict,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (char_length(reason) between 8 and 240),
  accessed_at timestamptz not null default now()
);

create index if not exists admin_data_access_log_admin_date_idx
  on public.admin_data_access_log (admin_user_id, accessed_at desc);

create index if not exists admin_data_access_log_target_date_idx
  on public.admin_data_access_log (target_user_id, accessed_at desc);

alter table public.admin_data_access_log enable row level security;

-- Aucun accès direct depuis le navigateur : seules les RPC contrôlées ci-dessous
-- peuvent écrire ou lire le journal.
revoke all on table public.admin_data_access_log from anon, authenticated, public;

create or replace function public.admin_get_user_support_snapshot(
  target_user_id uuid,
  access_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id uuid := (select auth.uid());
  clean_reason text := btrim(access_reason);
  snapshot jsonb;
begin
  if caller_id is null
     or not exists (
       select 1
       from public.profiles
       where id = caller_id
         and is_admin is true
     ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if target_user_id is null
     or not exists (select 1 from public.profiles where id = target_user_id) then
    raise exception 'unknown target user' using errcode = '22023';
  end if;

  if clean_reason is null or char_length(clean_reason) < 8 then
    raise exception 'access reason must contain at least 8 characters'
      using errcode = '22023';
  end if;

  insert into public.admin_data_access_log (admin_user_id, target_user_id, reason)
  values (caller_id, target_user_id, left(clean_reason, 240));

  select jsonb_build_object(
    'identity', jsonb_build_object(
      'id', p.id,
      'email', u.email,
      'joined_at', u.created_at,
      'last_sign_in_at', u.last_sign_in_at
    ),
    'profile', jsonb_strip_nulls(jsonb_build_object(
      'name', p.name,
      'birthdate', p.birthdate,
      'age', p.age,
      'sex', p.sex,
      'weight', p.weight,
      'height', p.height,
      'vo2max', p.vo2max,
      'fc_max', p.fc_max,
      'lactate_threshold', p.lactate_threshold,
      'lactate_pace', p.lactate_pace,
      'mass_fat', p.mass_fat,
      'mass_muscle', p.mass_muscle,
      'pain_zones', p.pain_zones,
      'goals', p.goals,
      'prs', p.prs,
      'vam_avg', p.vam_avg,
      'vam_max', p.vam_max,
      'recovery_drop_avg', p.recovery_drop_avg,
      'coeff_uphill', p.coeff_uphill,
      'coeff_downhill', p.coeff_downhill,
      'coeff_flat', p.coeff_flat,
      'runner_profile', p.runner_profile,
      'runner_profile_at', p.runner_profile_at,
      'nutrition_level', p.nutrition_level,
      'renfo_weekly_target', p.renfo_weekly_target,
      'coach_days_per_week', p.coach_days_per_week,
      'coach_motivation', p.coach_motivation,
      'demi_cooper', p.demi_cooper,
      'fc_zones', p.fc_zones,
      'onboarding_done', p.onboarding_done,
      'plan_tier', p.plan_tier,
      'plan_expires_at', p.plan_expires_at,
      'created_at', p.created_at,
      'updated_at', p.updated_at
    )),
    'strava', coalesce((
      select jsonb_strip_nulls(jsonb_build_object(
        'connected', true,
        'athlete_id', st.strava_athlete_id,
        'athlete_firstname', st.athlete_firstname,
        'athlete_lastname', st.athlete_lastname,
        'athlete_avatar', st.athlete_avatar,
        'scope', st.scope,
        'last_sync_at', st.last_sync_at,
        'token_expires_at', to_timestamp(st.expires_at)
      ))
      from public.strava_tokens st
      where st.user_id = target_user_id
    ), jsonb_build_object('connected', false)),
    'counts', jsonb_build_object(
      'activities', (
        select count(*)
        from public.strava_activities sa
        where sa.user_id = target_user_id and sa.deleted_at is null
      ),
      'races', (
        select count(*)
        from public.race_calendar rc
        where rc.user_id = target_user_id
      ),
      'renfo_sessions', (
        select count(*)
        from public.renfo_session_log rsl
        where rsl.user_id = target_user_id
      ),
      'coach_feedbacks', (
        select count(*)
        from public.session_log sl
        where sl.user_id = target_user_id
      )
    ),
    'activities', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.start_date desc)
      from (
        select
          sa.id,
          sa.strava_activity_id,
          sa.name,
          sa.type,
          sa.sport_type,
          sa.start_date,
          sa.distance,
          sa.moving_time,
          sa.elapsed_time,
          sa.total_elevation_gain,
          sa.average_speed,
          sa.average_heartrate,
          sa.max_heartrate,
          sa.average_cadence,
          sa.calories,
          sa.suffer_score,
          sa.is_race
        from public.strava_activities sa
        where sa.user_id = target_user_id
          and sa.deleted_at is null
        order by sa.start_date desc
        limit 20
      ) a
    ), '[]'::jsonb),
    'races', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.date desc)
      from (
        select
          rc.id,
          rc.name,
          rc.date,
          rc.distance,
          rc.elevation,
          rc.type,
          rc.goal_time,
          rc.priority,
          rc.start_time,
          rc.result_activity_id,
          (rc.gpx_data is not null) as has_gpx,
          rc.last_projection
        from public.race_calendar rc
        where rc.user_id = target_user_id
        order by rc.date desc
        limit 15
      ) r
    ), '[]'::jsonb),
    'coach_sessions', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.created_at desc)
      from (
        select
          sl.id,
          sl.planned_date,
          sl.week_phase,
          sl.verdict,
          sl.confidence,
          sl.compliance_pace,
          sl.avg_hr_pct_max,
          sl.hr_drift_pct,
          sl.dplus_m,
          sl.duration_min,
          sl.feeling,
          sl.rpe,
          sl.reasons,
          sl.pain,
          sl.created_at
        from public.session_log sl
        where sl.user_id = target_user_id
        order by sl.created_at desc
        limit 15
      ) c
    ), '[]'::jsonb),
    'renfo', jsonb_build_object(
      'profile', (
        select to_jsonb(rp)
        from public.renfo_profile rp
        where rp.user_id = target_user_id
      ),
      'max_lifts', coalesce((
        select jsonb_agg(to_jsonb(ml) order by ml.recorded_at desc)
        from (
          select exercise_id, one_rm, is_estimated, recorded_at
          from public.renfo_max_lifts
          where user_id = target_user_id
          order by recorded_at desc
        ) ml
      ), '[]'::jsonb),
      'recent_sessions', coalesce((
        select jsonb_agg(to_jsonb(rs) order by rs.session_date desc)
        from (
          select
            id,
            session_date,
            day_key,
            focus,
            duration_min,
            source,
            completed_exercises,
            note,
            created_at
          from public.renfo_session_log
          where user_id = target_user_id
          order by session_date desc
          limit 15
        ) rs
      ), '[]'::jsonb)
    ),
    'projection_validation', coalesce((
      select jsonb_agg(to_jsonb(v) order by v.created_at desc)
      from (
        select
          pvs.id,
          pvs.race_id,
          pvs.created_at,
          pvs.engine_version,
          pvs.prediction_central_s,
          pvs.prediction_prudent_s,
          pvs.prediction_aggressive_s,
          pvs.activity_count,
          pvs.status,
          pvs.result_moving_s,
          pvs.result_elapsed_s,
          pvs.result_recorded_at,
          pvs.used_fallback,
          pvs.fallback_sources
        from public.projection_validation_snapshots pvs
        where pvs.user_id = target_user_id
        order by pvs.created_at desc
        limit 10
      ) v
    ), '[]'::jsonb)
  )
  into snapshot
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id = target_user_id;

  return snapshot;
end;
$$;

create or replace function public.admin_get_data_access_log(limit_n integer default 50)
returns table(
  id uuid,
  admin_user_id uuid,
  admin_email text,
  target_user_id uuid,
  target_email text,
  reason text,
  accessed_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select auth.uid()) is null
     or not exists (
       select 1
       from public.profiles
       where profiles.id = (select auth.uid())
         and profiles.is_admin is true
     ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select
    l.id,
    l.admin_user_id,
    admin_u.email::text,
    l.target_user_id,
    target_u.email::text,
    l.reason,
    l.accessed_at
  from public.admin_data_access_log l
  join auth.users admin_u on admin_u.id = l.admin_user_id
  join auth.users target_u on target_u.id = l.target_user_id
  order by l.accessed_at desc
  limit least(greatest(coalesce(limit_n, 50), 1), 200);
end;
$$;

revoke execute on function public.admin_get_user_support_snapshot(uuid, text)
  from anon, public;
grant execute on function public.admin_get_user_support_snapshot(uuid, text)
  to authenticated;

revoke execute on function public.admin_get_data_access_log(integer)
  from anon, public;
grant execute on function public.admin_get_data_access_log(integer)
  to authenticated;
