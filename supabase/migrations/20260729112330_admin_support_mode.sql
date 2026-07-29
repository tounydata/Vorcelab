-- ─────────────────────────────────────────────────────────────────────────────
-- MODE ASSISTANCE ADMIN
--
-- Un administrateur peut assister un utilisateur présent à distance :
--   • ouvrir une session support limitée dans le temps ;
--   • modifier uniquement les champs de profil explicitement autorisés ;
--   • piloter les opérations Strava via une Edge Function qui conserve les
--     jetons côté serveur ;
--   • consulter un journal assaini des actions effectuées.
--
-- Aucun mot de passe, jeton Strava, identifiant Stripe ou secret technique
-- n'est stocké dans les journaux ni renvoyé au navigateur administrateur.
-- ─────────────────────────────────────────────────────────────────────────────

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.admin_support_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete restrict,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (char_length(reason) between 8 and 240),
  consent_mode text not null check (
    consent_mode in ('verbal', 'written', 'verbal_written', 'in_person')
  ),
  user_present boolean not null default true check (user_present is true),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '45 minutes'),
  ended_at timestamptz,
  check (admin_user_id <> target_user_id),
  check (expires_at > started_at),
  check (ended_at is null or ended_at >= started_at)
);

create index if not exists admin_support_sessions_admin_active_idx
  on public.admin_support_sessions (admin_user_id, started_at desc)
  where ended_at is null;

create index if not exists admin_support_sessions_target_date_idx
  on public.admin_support_sessions (target_user_id, started_at desc);

comment on column public.admin_support_sessions.consent_mode is
  'Mode de consentement déclaré par l’administrateur. Vorcelab ne vérifie ni n’enregistre la conversation externe.';

alter table public.admin_support_sessions enable row level security;
revoke all on table public.admin_support_sessions from public, anon, authenticated;

create table if not exists public.admin_support_action_log (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.admin_support_sessions(id) on delete cascade,
  admin_user_id uuid not null references auth.users(id) on delete restrict,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (char_length(action) between 3 and 80),
  outcome text not null default 'success' check (outcome in ('success', 'error')),
  summary text not null check (char_length(summary) between 3 and 240),
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now(),
  constraint admin_support_action_log_no_secrets check (
    coalesce(lower(before_state::text), '') !~ '"(access_token|refresh_token|password|client_secret|authorization|token_hash|hashed_token|otp)"'
    and coalesce(lower(after_state::text), '') !~ '"(access_token|refresh_token|password|client_secret|authorization|token_hash|hashed_token|otp)"'
  )
);

create index if not exists admin_support_action_log_session_date_idx
  on public.admin_support_action_log (session_id, created_at desc);

create index if not exists admin_support_action_log_target_date_idx
  on public.admin_support_action_log (target_user_id, created_at desc);

alter table public.admin_support_action_log enable row level security;
revoke all on table public.admin_support_action_log from public, anon, authenticated;

create or replace function private.require_active_admin_support_session(
  p_session_id uuid
)
returns public.admin_support_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  support_session public.admin_support_sessions;
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

  select s.*
    into support_session
  from public.admin_support_sessions s
  where s.id = p_session_id
    and s.admin_user_id = caller_id
    and s.ended_at is null
    and s.expires_at > now();

  if not found then
    raise exception 'support session unavailable or expired'
      using errcode = '42501';
  end if;

  return support_session;
end;
$$;

revoke all on function private.require_active_admin_support_session(uuid)
  from public, anon, authenticated;

create or replace function public.admin_start_support_session(
  target_user_id uuid,
  support_reason text,
  consent_mode text,
  user_present boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id uuid := (select auth.uid());
  clean_reason text := btrim(support_reason);
  clean_consent text := btrim(consent_mode);
  created_session public.admin_support_sessions;
begin
  if caller_id is null
     or not exists (
       select 1 from public.profiles
       where id = caller_id and is_admin is true
     ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if target_user_id is null
     or target_user_id = caller_id
     or not exists (
       select 1 from public.profiles
       where id = target_user_id and is_admin is false
     ) then
    raise exception 'unknown target user' using errcode = '22023';
  end if;

  if clean_reason is null or char_length(clean_reason) < 8 then
    raise exception 'support reason must contain at least 8 characters'
      using errcode = '22023';
  end if;

  if clean_consent is null
     or clean_consent not in ('verbal', 'written', 'verbal_written', 'in_person') then
    raise exception 'invalid consent mode' using errcode = '22023';
  end if;

  if user_present is not true then
    raise exception 'the user must be present during an assisted session'
      using errcode = '22023';
  end if;

  update public.admin_support_sessions
  set ended_at = now()
  where admin_user_id = caller_id
    and ended_at is null;

  insert into public.admin_support_sessions (
    admin_user_id,
    target_user_id,
    reason,
    consent_mode,
    user_present
  )
  values (
    caller_id,
    target_user_id,
    left(clean_reason, 240),
    clean_consent,
    true
  )
  returning * into created_session;

  insert into public.admin_support_action_log (
    session_id,
    admin_user_id,
    target_user_id,
    action,
    summary,
    after_state
  )
  values (
    created_session.id,
    caller_id,
    target_user_id,
    'support_session_started',
    'Session ouverte — présence et consentement déclarés par l’admin',
    jsonb_build_object(
      'consent_mode', created_session.consent_mode,
      'expires_at', created_session.expires_at
    )
  );

  return jsonb_build_object(
    'id', created_session.id,
    'target_user_id', created_session.target_user_id,
    'reason', created_session.reason,
    'consent_mode', created_session.consent_mode,
    'started_at', created_session.started_at,
    'expires_at', created_session.expires_at
  );
end;
$$;

create or replace function public.admin_get_active_support_session()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id uuid := (select auth.uid());
  result jsonb;
begin
  if caller_id is null
     or not exists (
       select 1 from public.profiles
       where id = caller_id and is_admin is true
     ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', s.id,
    'target_user_id', s.target_user_id,
    'target_email', u.email,
    'target_name', p.name,
    'reason', s.reason,
    'consent_mode', s.consent_mode,
    'started_at', s.started_at,
    'expires_at', s.expires_at
  )
  into result
  from public.admin_support_sessions s
  join public.profiles p on p.id = s.target_user_id
  join auth.users u on u.id = s.target_user_id
  where s.admin_user_id = caller_id
    and s.ended_at is null
    and s.expires_at > now()
  order by s.started_at desc
  limit 1;

  return result;
end;
$$;

create or replace function public.admin_get_support_context(
  support_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  support_session public.admin_support_sessions;
  result jsonb;
begin
  support_session := private.require_active_admin_support_session(support_session_id);

  select jsonb_build_object(
    'session', jsonb_build_object(
      'id', support_session.id,
      'reason', support_session.reason,
      'consent_mode', support_session.consent_mode,
      'started_at', support_session.started_at,
      'expires_at', support_session.expires_at
    ),
    'identity', jsonb_build_object(
      'id', p.id,
      'email', u.email,
      'joined_at', u.created_at,
      'last_sign_in_at', u.last_sign_in_at
    ),
    'profile', jsonb_strip_nulls(jsonb_build_object(
      'name', p.name,
      'birthdate', p.birthdate,
      'sex', p.sex,
      'weight', p.weight,
      'height', p.height,
      'vo2max', p.vo2max,
      'fc_max', p.fc_max,
      'lactate_threshold', p.lactate_threshold,
      'lactate_pace', p.lactate_pace,
      'nutrition_level', p.nutrition_level,
      'nutrition_no_caffeine', p.nutrition_no_caffeine,
      'coach_days_per_week', p.coach_days_per_week,
      'coach_motivation', p.coach_motivation,
      'renfo_weekly_target', p.renfo_weekly_target,
      'onboarding_done', p.onboarding_done,
      'tours_seen', p.tours_seen,
      'tours_off', p.tours_off
    )),
    'strava', coalesce((
      select jsonb_strip_nulls(jsonb_build_object(
        'connected', true,
        'athlete_id', st.strava_athlete_id,
        'athlete_firstname', st.athlete_firstname,
        'athlete_lastname', st.athlete_lastname,
        'scope', st.scope,
        'activity_access_granted',
          coalesce(st.scope, '') ~ '(^|[ ,])activity:read_all([ ,]|$)',
        'last_sync_at', st.last_sync_at,
        'token_expires_at', to_timestamp(st.expires_at),
        'token_state', case
          when st.expires_at is null then 'unknown'
          when st.expires_at > extract(epoch from now() + interval '5 minutes') then 'valid'
          else 'refresh_needed'
        end
      ))
      from public.strava_tokens st
      where st.user_id = support_session.target_user_id
    ), jsonb_build_object(
      'connected', false,
      'activity_access_granted', false,
      'token_state', 'missing'
    )),
    'counts', jsonb_build_object(
      'activities', (
        select count(*) from public.strava_activities
        where user_id = support_session.target_user_id
          and deleted_at is null
      ),
      'races', (
        select count(*) from public.race_calendar
        where user_id = support_session.target_user_id
      )
    ),
    'recent_actions', coalesce((
      select jsonb_agg(to_jsonb(log_row) order by log_row.created_at desc)
      from (
        select
          l.id,
          l.action,
          l.outcome,
          l.summary,
          l.before_state,
          l.after_state,
          l.created_at
        from public.admin_support_action_log l
        where l.session_id = support_session.id
        order by l.created_at desc
        limit 50
      ) log_row
    ), '[]'::jsonb)
  )
  into result
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id = support_session.target_user_id;

  return result;
end;
$$;

create or replace function public.admin_update_user_support_profile(
  support_session_id uuid,
  profile_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  support_session public.admin_support_sessions;
  invalid_keys text[];
  before_state jsonb;
  after_state jsonb;
begin
  support_session := private.require_active_admin_support_session(support_session_id);

  if profile_patch is null
     or jsonb_typeof(profile_patch) <> 'object'
     or profile_patch = '{}'::jsonb then
    raise exception 'profile patch must be a non-empty object'
      using errcode = '22023';
  end if;

  select array_agg(key order by key)
  into invalid_keys
  from jsonb_object_keys(profile_patch) as key
  where key not in (
    'name',
    'birthdate',
    'sex',
    'weight',
    'height',
    'vo2max',
    'fc_max',
    'lactate_threshold',
    'lactate_pace',
    'nutrition_level',
    'nutrition_no_caffeine',
    'coach_days_per_week',
    'coach_motivation',
    'renfo_weekly_target',
    'onboarding_done',
    'tours_seen',
    'tours_off'
  );

  if invalid_keys is not null then
    raise exception 'unsupported profile fields: %', array_to_string(invalid_keys, ', ')
      using errcode = '22023';
  end if;

  if profile_patch ? 'name'
     and char_length(coalesce(profile_patch->>'name', '')) > 120 then
    raise exception 'name is too long' using errcode = '22023';
  end if;

  if profile_patch ? 'sex'
     and profile_patch->>'sex' is not null
     and profile_patch->>'sex' not in ('M', 'F') then
    raise exception 'invalid sex value' using errcode = '22023';
  end if;

  if profile_patch ? 'birthdate'
     and profile_patch->>'birthdate' is not null
     and (
       (profile_patch->>'birthdate')::date < date '1900-01-01'
       or (profile_patch->>'birthdate')::date > current_date
     ) then
    raise exception 'invalid birthdate' using errcode = '22023';
  end if;

  if profile_patch ? 'weight'
     and profile_patch->>'weight' is not null
     and (profile_patch->>'weight')::numeric not between 20 and 350 then
    raise exception 'weight is outside the accepted range' using errcode = '22023';
  end if;

  if profile_patch ? 'height'
     and profile_patch->>'height' is not null
     and (profile_patch->>'height')::numeric not between 80 and 260 then
    raise exception 'height is outside the accepted range' using errcode = '22023';
  end if;

  if profile_patch ? 'vo2max'
     and profile_patch->>'vo2max' is not null
     and (profile_patch->>'vo2max')::numeric not between 10 and 100 then
    raise exception 'vo2max is outside the accepted range' using errcode = '22023';
  end if;

  if profile_patch ? 'fc_max'
     and profile_patch->>'fc_max' is not null
     and (profile_patch->>'fc_max')::integer not between 80 and 240 then
    raise exception 'fc_max is outside the accepted range' using errcode = '22023';
  end if;

  if profile_patch ? 'lactate_threshold'
     and profile_patch->>'lactate_threshold' is not null
     and (profile_patch->>'lactate_threshold')::integer not between 80 and 240 then
    raise exception 'lactate threshold is outside the accepted range' using errcode = '22023';
  end if;

  if profile_patch ? 'coach_days_per_week'
     and profile_patch->>'coach_days_per_week' is not null
     and (profile_patch->>'coach_days_per_week')::integer not between 3 and 6 then
    raise exception 'coach days must be between 3 and 6' using errcode = '22023';
  end if;

  if profile_patch ? 'renfo_weekly_target'
     and profile_patch->>'renfo_weekly_target' is not null
     and (profile_patch->>'renfo_weekly_target')::integer not between 2 and 5 then
    raise exception 'strength target must be between 2 and 5' using errcode = '22023';
  end if;

  if profile_patch ? 'coach_motivation'
     and profile_patch->>'coach_motivation' is not null
     and profile_patch->>'coach_motivation' not in ('plaisir', 'mix', 'performance') then
    raise exception 'invalid coach motivation' using errcode = '22023';
  end if;

  if profile_patch ? 'nutrition_level'
     and profile_patch->>'nutrition_level' is not null
     and profile_patch->>'nutrition_level' not in (
       'prudent', 'standard', 'trained', 'gut_trained', 'elite'
     ) then
    raise exception 'invalid nutrition level' using errcode = '22023';
  end if;

  if profile_patch ? 'tours_seen'
     and jsonb_typeof(profile_patch->'tours_seen') <> 'array' then
    raise exception 'tours_seen must be an array' using errcode = '22023';
  end if;

  select jsonb_strip_nulls(jsonb_build_object(
    'name', p.name,
    'birthdate', p.birthdate,
    'sex', p.sex,
    'weight', p.weight,
    'height', p.height,
    'vo2max', p.vo2max,
    'fc_max', p.fc_max,
    'lactate_threshold', p.lactate_threshold,
    'lactate_pace', p.lactate_pace,
    'nutrition_level', p.nutrition_level,
    'nutrition_no_caffeine', p.nutrition_no_caffeine,
    'coach_days_per_week', p.coach_days_per_week,
    'coach_motivation', p.coach_motivation,
    'renfo_weekly_target', p.renfo_weekly_target,
    'onboarding_done', p.onboarding_done,
    'tours_seen', p.tours_seen,
    'tours_off', p.tours_off
  ))
  into before_state
  from public.profiles p
  where p.id = support_session.target_user_id;

  update public.profiles p
  set
    name = case
      when profile_patch ? 'name' then nullif(btrim(profile_patch->>'name'), '')
      else p.name
    end,
    birthdate = case
      when profile_patch ? 'birthdate' then nullif(profile_patch->>'birthdate', '')::date
      else p.birthdate
    end,
    sex = case
      when profile_patch ? 'sex' then nullif(profile_patch->>'sex', '')
      else p.sex
    end,
    weight = case
      when profile_patch ? 'weight' then nullif(profile_patch->>'weight', '')::numeric
      else p.weight
    end,
    height = case
      when profile_patch ? 'height' then nullif(profile_patch->>'height', '')::numeric
      else p.height
    end,
    vo2max = case
      when profile_patch ? 'vo2max' then nullif(profile_patch->>'vo2max', '')::numeric
      else p.vo2max
    end,
    fc_max = case
      when profile_patch ? 'fc_max' then nullif(profile_patch->>'fc_max', '')::integer
      else p.fc_max
    end,
    lactate_threshold = case
      when profile_patch ? 'lactate_threshold' then nullif(profile_patch->>'lactate_threshold', '')::integer
      else p.lactate_threshold
    end,
    lactate_pace = case
      when profile_patch ? 'lactate_pace' then nullif(btrim(profile_patch->>'lactate_pace'), '')
      else p.lactate_pace
    end,
    nutrition_level = case
      when profile_patch ? 'nutrition_level' then nullif(profile_patch->>'nutrition_level', '')
      else p.nutrition_level
    end,
    nutrition_no_caffeine = case
      when profile_patch ? 'nutrition_no_caffeine'
        then coalesce((profile_patch->>'nutrition_no_caffeine')::boolean, false)
      else p.nutrition_no_caffeine
    end,
    coach_days_per_week = case
      when profile_patch ? 'coach_days_per_week'
        then nullif(profile_patch->>'coach_days_per_week', '')::smallint
      else p.coach_days_per_week
    end,
    coach_motivation = case
      when profile_patch ? 'coach_motivation'
        then coalesce(nullif(profile_patch->>'coach_motivation', ''), 'mix')
      else p.coach_motivation
    end,
    renfo_weekly_target = case
      when profile_patch ? 'renfo_weekly_target'
        then nullif(profile_patch->>'renfo_weekly_target', '')::integer
      else p.renfo_weekly_target
    end,
    onboarding_done = case
      when profile_patch ? 'onboarding_done'
        then coalesce((profile_patch->>'onboarding_done')::boolean, false)
      else p.onboarding_done
    end,
    tours_seen = case
      when profile_patch ? 'tours_seen'
        then array(select jsonb_array_elements_text(profile_patch->'tours_seen'))
      else p.tours_seen
    end,
    tours_off = case
      when profile_patch ? 'tours_off'
        then coalesce((profile_patch->>'tours_off')::boolean, false)
      else p.tours_off
    end,
    updated_at = now()
  where p.id = support_session.target_user_id;

  select jsonb_strip_nulls(jsonb_build_object(
    'name', p.name,
    'birthdate', p.birthdate,
    'sex', p.sex,
    'weight', p.weight,
    'height', p.height,
    'vo2max', p.vo2max,
    'fc_max', p.fc_max,
    'lactate_threshold', p.lactate_threshold,
    'lactate_pace', p.lactate_pace,
    'nutrition_level', p.nutrition_level,
    'nutrition_no_caffeine', p.nutrition_no_caffeine,
    'coach_days_per_week', p.coach_days_per_week,
    'coach_motivation', p.coach_motivation,
    'renfo_weekly_target', p.renfo_weekly_target,
    'onboarding_done', p.onboarding_done,
    'tours_seen', p.tours_seen,
    'tours_off', p.tours_off
  ))
  into after_state
  from public.profiles p
  where p.id = support_session.target_user_id;

  insert into public.admin_support_action_log (
    session_id,
    admin_user_id,
    target_user_id,
    action,
    summary,
    before_state,
    after_state
  )
  values (
    support_session.id,
    support_session.admin_user_id,
    support_session.target_user_id,
    'profile_updated',
    'Profil et réglages Vorcelab modifiés',
    before_state,
    after_state
  );

  return after_state;
end;
$$;

create or replace function public.admin_end_support_session(
  support_session_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  support_session public.admin_support_sessions;
begin
  support_session := private.require_active_admin_support_session(support_session_id);

  insert into public.admin_support_action_log (
    session_id,
    admin_user_id,
    target_user_id,
    action,
    summary
  )
  values (
    support_session.id,
    support_session.admin_user_id,
    support_session.target_user_id,
    'support_session_ended',
    'Session d’assistance terminée'
  );

  update public.admin_support_sessions
  set ended_at = now()
  where id = support_session.id;

  return true;
end;
$$;

-- Appelée uniquement depuis la fenêtre Vorcelab isolée de l'utilisateur assisté.
-- Elle permet à cette fenêtre de vérifier régulièrement que l'admin n'a pas
-- terminé la session et que les 45 minutes ne sont pas écoulées.
create or replace function public.support_validate_assisted_session(
  support_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id uuid := (select auth.uid());
  result jsonb;
begin
  if caller_id is null then
    return null;
  end if;

  select jsonb_build_object(
    'id', s.id,
    'target_user_id', s.target_user_id,
    'target_name', p.name,
    'target_email', u.email,
    'reason', s.reason,
    'started_at', s.started_at,
    'expires_at', s.expires_at
  )
  into result
  from public.admin_support_sessions s
  join public.profiles p on p.id = s.target_user_id
  join auth.users u on u.id = s.target_user_id
  where s.id = support_session_id
    and s.target_user_id = caller_id
    and s.user_present is true
    and s.ended_at is null
    and s.expires_at > now();

  return result;
end;
$$;

-- L'utilisateur assisté (donc la fenêtre impersonnée elle-même) peut toujours
-- terminer l'assistance. Cette action ne touche à aucune autre session du compte.
create or replace function public.support_end_assisted_session(
  support_session_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id uuid := (select auth.uid());
  support_session public.admin_support_sessions;
begin
  if caller_id is null then
    return false;
  end if;

  select s.*
  into support_session
  from public.admin_support_sessions s
  where s.id = support_session_id
    and s.target_user_id = caller_id
    and s.ended_at is null
    and s.expires_at > now();

  if not found then
    return false;
  end if;

  insert into public.admin_support_action_log (
    session_id,
    admin_user_id,
    target_user_id,
    action,
    summary
  )
  values (
    support_session.id,
    support_session.admin_user_id,
    support_session.target_user_id,
    'support_window_ended',
    'Fenêtre Vorcelab assistée fermée'
  );

  update public.admin_support_sessions
  set ended_at = now()
  where id = support_session.id;

  return true;
end;
$$;

revoke execute on function public.admin_start_support_session(uuid, text, text, boolean)
  from public, anon;
grant execute on function public.admin_start_support_session(uuid, text, text, boolean)
  to authenticated;

revoke execute on function public.admin_get_active_support_session()
  from public, anon;
grant execute on function public.admin_get_active_support_session()
  to authenticated;

revoke execute on function public.admin_get_support_context(uuid)
  from public, anon;
grant execute on function public.admin_get_support_context(uuid)
  to authenticated;

revoke execute on function public.admin_update_user_support_profile(uuid, jsonb)
  from public, anon;
grant execute on function public.admin_update_user_support_profile(uuid, jsonb)
  to authenticated;

revoke execute on function public.admin_end_support_session(uuid)
  from public, anon;
grant execute on function public.admin_end_support_session(uuid)
  to authenticated;

revoke execute on function public.support_validate_assisted_session(uuid)
  from public, anon;
grant execute on function public.support_validate_assisted_session(uuid)
  to authenticated;

revoke execute on function public.support_end_assisted_session(uuid)
  from public, anon;
grant execute on function public.support_end_assisted_session(uuid)
  to authenticated;
