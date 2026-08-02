-- ─────────────────────────────────────────────────────────────────────────────
-- CORRECTIF de `20260802000000_admin_strava_connections.sql`, qui échouait à
-- l'exécution en production. Deux défauts, l'un technique, l'autre de fond.
--
-- 1. `strava_tokens.created_at` n'existe pas en production : le schéma réel a
--    divergé du fichier de création d'origine (la colonne y figure, mais la
--    migration réellement appliquée, `fix_strava_tokens_columns`, ne l'a pas
--    créée). La fonction levait « column st.created_at does not exist » à
--    chaque appel. On expose `updated_at` — dernier rafraîchissement du jeton,
--    qui existe bel et bien — sous le nom `token_updated_at`.
--
-- 2. Le classement se fondait sur le dernier signe de vie « connexion OU
--    activité ». Or un jeton Strava sert à RÉCUPÉRER DES ACTIVITÉS : un compte
--    qui ouvre l'app mais ne court plus depuis des mois occupe un jeton pour
--    rien, et passait pour actif. `idle_since` suit désormais la dernière
--    ACTIVITÉ ; la dernière connexion reste exposée comme information.
--
-- Garanties inchangées : SECURITY DEFINER, garde is_admin, search_path épinglé,
-- EXECUTE retiré à anon/PUBLIC, aucun secret renvoyé.
-- ─────────────────────────────────────────────────────────────────────────────

-- La signature de retour change (colonne renommée) : DROP obligatoire, un
-- CREATE OR REPLACE ne peut pas modifier le type de retour d'une fonction.
drop function if exists public.admin_list_strava_connections();

create function public.admin_list_strava_connections()
returns table (
  user_id uuid,
  email text,
  name text,
  is_admin boolean,
  athlete_id bigint,
  athlete_name text,
  scope text,
  token_updated_at timestamptz,
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
    st.updated_at::timestamptz,
    u.last_sign_in_at,
    st.last_sync_at,
    act.last_activity_at,
    coalesce(act.activities_total, 0),
    coalesce(act.activities_30d, 0),
    act.last_activity_at
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
  -- Le compte qui ne court plus arrive en tête : c'est le jeton à libérer.
  order by act.last_activity_at asc nulls first,
           u.last_sign_in_at asc nulls first;
end;
$$;

revoke all on function public.admin_list_strava_connections()
  from anon, public;

grant execute on function public.admin_list_strava_connections()
  to authenticated;
