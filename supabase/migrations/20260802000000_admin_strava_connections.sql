-- ─────────────────────────────────────────────────────────────────────────────
-- INVENTAIRE DES CONNEXIONS STRAVA (admin).
--
-- L'application Strava a un plafond d'athlètes connectés. Quand il est atteint,
-- il faut savoir QUI dort avant de libérer un jeton — et le savoir sur données,
-- pas de mémoire. Cette RPC liste les comptes Strava reliés avec, pour chacun,
-- la dernière connexion à Vorcelab, la dernière activité et la dernière synchro.
--
-- SECURITY DEFINER car strava_tokens et auth.users sont protégés par RLS. La
-- fonction vérifie is_admin côté serveur, épingle search_path et n'est jamais
-- exécutable par anon/PUBLIC. Elle ne renvoie AUCUN secret : ni access_token,
-- ni refresh_token, ni stripe_customer_id.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.admin_list_strava_connections()
returns table (
  user_id uuid,
  email text,
  name text,
  is_admin boolean,
  athlete_id bigint,
  athlete_name text,
  scope text,
  connected_at timestamptz,
  last_sign_in_at timestamptz,
  last_sync_at timestamptz,
  last_activity_at timestamptz,
  activities_total bigint,
  activities_30d bigint,
  idle_since timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  caller_id uuid := (select auth.uid());
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

  return query
  select
    st.user_id,
    u.email::text,
    p.name,
    coalesce(p.is_admin, false),
    st.strava_athlete_id,
    nullif(btrim(concat_ws(' ', st.athlete_firstname, st.athlete_lastname)), ''),
    st.scope,
    st.created_at,
    u.last_sign_in_at,
    st.last_sync_at,
    act.last_activity_at,
    coalesce(act.activities_total, 0),
    coalesce(act.activities_30d, 0),
    -- Dernier signe de vie, quelle qu'en soit la source. GREATEST ignore les
    -- NULL : un compte jamais reconnecté mais qui synchronise encore n'est pas
    -- classé « inactif » à tort.
    greatest(u.last_sign_in_at, act.last_activity_at)
  from public.strava_tokens st
  join auth.users u on u.id = st.user_id
  left join public.profiles p on p.id = st.user_id
  left join lateral (
    select
      max(sa.start_date) as last_activity_at,
      count(*) as activities_total,
      count(*) filter (where sa.start_date > now() - interval '30 days') as activities_30d
    from public.strava_activities sa
    where sa.user_id = st.user_id
      and sa.deleted_at is null
  ) act on true
  -- Les plus endormis en tête : c'est la liste qu'on lit quand il faut trancher.
  order by greatest(u.last_sign_in_at, act.last_activity_at) asc nulls first,
           u.created_at asc;
end;
$$;

revoke all on function public.admin_list_strava_connections()
  from anon, public;

grant execute on function public.admin_list_strava_connections()
  to authenticated;
