-- ─────────────────────────────────────────────────────────────────────────────
-- ASSISTANCE ADMIN : PREUVE D'EXÉCUTION + HISTORIQUE
-- Version alignée sur l'identifiant enregistré par Supabase production.
--
-- Les actions réalisées dans la vraie session utilisateur ne doivent apparaître
-- comme réussies qu'après confirmation de la base ou de la fonction serveur.
-- Le journal reste intégralement privé : l'utilisateur assisté peut provoquer
-- une écriture d'audit via ses propres actions, mais ne peut jamais le lire.
-- ─────────────────────────────────────────────────────────────────────────────

create index if not exists admin_support_sessions_target_active_idx
  on public.admin_support_sessions (target_user_id, started_at desc)
  where ended_at is null;

create index if not exists admin_support_action_log_admin_date_idx
  on public.admin_support_action_log (admin_user_id, created_at desc);

-- Journalise uniquement une mutation réellement validée par Postgres et
-- uniquement lorsque le JWT courant est celui de l'utilisateur assisté.
-- Les RPC admin (JWT admin) et les traitements service_role ne créent donc
-- jamais de doublon.
create or replace function private.log_assisted_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  changed_row jsonb;
  owner_key text := coalesce(nullif(tg_argv[0], ''), 'user_id');
  display_label text := coalesce(nullif(tg_argv[1], ''), tg_table_name);
  record_key text := coalesce(nullif(tg_argv[2], ''), 'id');
  owner_id uuid;
  record_ref text;
  support_session public.admin_support_sessions;
  operation_label text;
begin
  if caller_id is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  changed_row := case
    when tg_op = 'DELETE' then to_jsonb(old)
    else to_jsonb(new)
  end;

  begin
    owner_id := nullif(changed_row->>owner_key, '')::uuid;
  exception
    when invalid_text_representation then
      return case when tg_op = 'DELETE' then old else new end;
  end;

  if owner_id is null or owner_id <> caller_id then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select s.*
  into support_session
  from public.admin_support_sessions s
  where s.target_user_id = caller_id
    and s.user_present is true
    and s.ended_at is null
    and s.expires_at > now()
  order by s.started_at desc
  limit 1;

  if not found then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  operation_label := case tg_op
    when 'INSERT' then 'création'
    when 'UPDATE' then 'modification'
    when 'DELETE' then 'suppression'
    else lower(tg_op)
  end;
  record_ref := coalesce(
    nullif(changed_row->>record_key, ''),
    nullif(changed_row->>'id', ''),
    nullif(changed_row->>'user_id', '')
  );

  insert into public.admin_support_action_log (
    session_id,
    admin_user_id,
    target_user_id,
    action,
    outcome,
    summary,
    after_state
  )
  values (
    support_session.id,
    support_session.admin_user_id,
    support_session.target_user_id,
    left('assisted_' || lower(tg_op) || '_' || tg_table_name, 80),
    'success',
    left(display_label || ' — ' || operation_label || ' confirmée par la base', 240),
    jsonb_strip_nulls(jsonb_build_object(
      'source', 'database_trigger',
      'table', tg_table_name,
      'operation', lower(tg_op),
      'record_ref', record_ref
    ))
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.log_assisted_row_change()
  from public, anon, authenticated, service_role;

drop trigger if exists support_audit_profiles on public.profiles;
create trigger support_audit_profiles
after insert or update or delete on public.profiles
for each row execute function private.log_assisted_row_change(
  'id', 'Profil et réglages Vorcelab', 'id'
);

drop trigger if exists support_audit_race_calendar on public.race_calendar;
create trigger support_audit_race_calendar
after insert or update or delete on public.race_calendar
for each row execute function private.log_assisted_row_change(
  'user_id', 'Course et stratégie', 'id'
);

drop trigger if exists support_audit_strava_activities on public.strava_activities;
create trigger support_audit_strava_activities
after insert or update or delete on public.strava_activities
for each row execute function private.log_assisted_row_change(
  'user_id', 'Activité Strava', 'id'
);

drop trigger if exists support_audit_activity_nutrition on public.activity_nutrition_log;
create trigger support_audit_activity_nutrition
after insert or update or delete on public.activity_nutrition_log
for each row execute function private.log_assisted_row_change(
  'user_id', 'Nutrition de l’activité', 'id'
);

drop trigger if exists support_audit_renfo_profile on public.renfo_profile;
create trigger support_audit_renfo_profile
after insert or update or delete on public.renfo_profile
for each row execute function private.log_assisted_row_change(
  'user_id', 'Réglages de renforcement', 'user_id'
);

drop trigger if exists support_audit_renfo_max_lifts on public.renfo_max_lifts;
create trigger support_audit_renfo_max_lifts
after insert or update or delete on public.renfo_max_lifts
for each row execute function private.log_assisted_row_change(
  'user_id', 'Charge maximale de renforcement', 'exercise_id'
);

drop trigger if exists support_audit_renfo_session on public.renfo_session_log;
create trigger support_audit_renfo_session
after insert or update or delete on public.renfo_session_log
for each row execute function private.log_assisted_row_change(
  'user_id', 'Séance de renforcement', 'id'
);

drop trigger if exists support_audit_renfo_exercise on public.renfo_exercise_log;
create trigger support_audit_renfo_exercise
after insert or update or delete on public.renfo_exercise_log
for each row execute function private.log_assisted_row_change(
  'user_id', 'Exercice de renforcement', 'id'
);

drop trigger if exists support_audit_coach_session on public.session_log;
create trigger support_audit_coach_session
after insert or update or delete on public.session_log
for each row execute function private.log_assisted_row_change(
  'user_id', 'Séance du coach', 'id'
);

-- Upsert atomique du nouveau jeton et de sa preuve d'audit. Cette RPC est
-- réservée au service_role utilisé par l'Edge Function strava-oauth.
create or replace function public.support_apply_strava_oauth(
  p_support_session_id uuid,
  p_target_user_id uuid,
  p_strava_athlete_id bigint,
  p_access_token text,
  p_refresh_token text,
  p_expires_at bigint,
  p_scope text,
  p_athlete_firstname text,
  p_athlete_lastname text,
  p_athlete_avatar text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  support_session public.admin_support_sessions;
  current_athlete_id bigint;
  current_scope text;
begin
  if p_access_token is null
     or p_refresh_token is null
     or p_strava_athlete_id is null
     or coalesce(p_scope, '') !~ '(^|[ ,])activity:read_all([ ,]|$)' then
    raise exception 'invalid Strava OAuth payload' using errcode = '22023';
  end if;

  select s.*
  into support_session
  from public.admin_support_sessions s
  where s.id = p_support_session_id
    and s.target_user_id = p_target_user_id
    and s.user_present is true
    and s.ended_at is null
    and s.expires_at > now()
  for update;

  if not found then
    raise exception 'support session unavailable or expired'
      using errcode = '42501';
  end if;

  select st.strava_athlete_id, st.scope
  into current_athlete_id, current_scope
  from public.strava_tokens st
  where st.user_id = p_target_user_id
  for update;

  if current_athlete_id is not null
     and current_athlete_id <> p_strava_athlete_id then
    raise exception 'different Strava athlete' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.strava_tokens st
    where st.strava_athlete_id = p_strava_athlete_id
      and st.user_id <> p_target_user_id
  ) then
    raise exception 'Strava athlete already linked' using errcode = '23505';
  end if;

  insert into public.strava_tokens (
    user_id,
    strava_athlete_id,
    access_token,
    refresh_token,
    expires_at,
    scope,
    athlete_firstname,
    athlete_lastname,
    athlete_avatar,
    updated_at
  )
  values (
    p_target_user_id,
    p_strava_athlete_id,
    p_access_token,
    p_refresh_token,
    p_expires_at,
    p_scope,
    p_athlete_firstname,
    p_athlete_lastname,
    p_athlete_avatar,
    timezone('utc', now())
  )
  on conflict (user_id) do update
  set
    strava_athlete_id = excluded.strava_athlete_id,
    access_token = excluded.access_token,
    refresh_token = excluded.refresh_token,
    expires_at = excluded.expires_at,
    scope = excluded.scope,
    athlete_firstname = excluded.athlete_firstname,
    athlete_lastname = excluded.athlete_lastname,
    athlete_avatar = excluded.athlete_avatar,
    updated_at = excluded.updated_at;

  insert into public.admin_support_action_log (
    session_id,
    admin_user_id,
    target_user_id,
    action,
    outcome,
    summary,
    before_state,
    after_state
  )
  values (
    support_session.id,
    support_session.admin_user_id,
    support_session.target_user_id,
    'strava_oauth_completed',
    'success',
    'Réautorisation Strava confirmée par le serveur',
    jsonb_build_object(
      'scope', coalesce(current_scope, ''),
      'activity_access_granted',
        coalesce(current_scope, '') ~ '(^|[ ,])activity:read_all([ ,]|$)'
    ),
    jsonb_build_object(
      'scope', p_scope,
      'activity_access_granted', true,
      'athlete_id_matches', true,
      'source', 'strava_token_exchange'
    )
  );

  return jsonb_build_object(
    'scope', p_scope,
    'activity_access_granted', true
  );
end;
$$;

revoke execute on function public.support_apply_strava_oauth(
  uuid, uuid, bigint, text, text, bigint, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.support_apply_strava_oauth(
  uuid, uuid, bigint, text, text, bigint, text, text, text, text
) to service_role;

-- Les annulations et erreurs de navigateur surviennent avant l'échange serveur.
-- L'utilisateur assisté ne peut envoyer qu'un code fermé ; le texte du journal
-- est construit côté base et reste illisible pour lui.
create or replace function public.support_log_assisted_oauth_result(
  support_session_id uuid,
  result_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  support_session public.admin_support_sessions;
  clean_code text := lower(btrim(coalesce(result_code, '')));
  result_summary text;
begin
  if clean_code not in ('denied', 'missing_scope', 'client_error') then
    raise exception 'invalid OAuth result code' using errcode = '22023';
  end if;

  select s.*
  into support_session
  from public.admin_support_sessions s
  where s.id = support_session_id
    and s.target_user_id = caller_id
    and s.user_present is true
    and s.ended_at is null
    and s.expires_at > now();

  if caller_id is null or not found then
    raise exception 'support session unavailable or expired'
      using errcode = '42501';
  end if;

  result_summary := case clean_code
    when 'denied' then 'Réautorisation Strava annulée sur l’écran OAuth'
    when 'missing_scope' then 'Réautorisation Strava refusée : permission activités absente'
    else 'Réautorisation Strava interrompue avant confirmation serveur'
  end;

  insert into public.admin_support_action_log (
    session_id,
    admin_user_id,
    target_user_id,
    action,
    outcome,
    summary,
    after_state
  )
  values (
    support_session.id,
    support_session.admin_user_id,
    support_session.target_user_id,
    'strava_oauth_failed',
    'error',
    result_summary,
    jsonb_build_object(
      'source', 'oauth_browser_callback',
      'error_code', clean_code
    )
  );

  return true;
end;
$$;

revoke execute on function public.support_log_assisted_oauth_result(uuid, text)
  from public, anon;
grant execute on function public.support_log_assisted_oauth_result(uuid, text)
  to authenticated;

-- Historique lisible uniquement par l'admin propriétaire des sessions.
create or replace function public.admin_list_support_history(
  history_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  safe_limit integer := least(greatest(coalesce(history_limit, 20), 1), 50);
  result jsonb;
begin
  if caller_id is null
     or not exists (
       select 1
       from public.profiles p
       where p.id = caller_id
         and p.is_admin is true
     ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(history_row.payload order by history_row.started_at desc),
    '[]'::jsonb
  )
  into result
  from (
    select
      s.started_at,
      jsonb_build_object(
        'id', s.id,
        'target_user_id', s.target_user_id,
        'target_name', p.name,
        'target_email', u.email,
        'reason', s.reason,
        'consent_mode', s.consent_mode,
        'started_at', s.started_at,
        'expires_at', s.expires_at,
        'ended_at', s.ended_at,
        'state', case
          when s.ended_at is not null then 'ended'
          when s.expires_at <= now() then 'expired'
          else 'active'
        end,
        'actions', coalesce((
          select jsonb_agg(to_jsonb(action_row) order by action_row.created_at desc)
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
            where l.session_id = s.id
            order by l.created_at desc
            limit 100
          ) action_row
        ), '[]'::jsonb)
      ) as payload
    from public.admin_support_sessions s
    join public.profiles p on p.id = s.target_user_id
    join auth.users u on u.id = s.target_user_id
    where s.admin_user_id = caller_id
    order by s.started_at desc
    limit safe_limit
  ) history_row;

  return result;
end;
$$;

revoke execute on function public.admin_list_support_history(integer)
  from public, anon;
grant execute on function public.admin_list_support_history(integer)
  to authenticated;
