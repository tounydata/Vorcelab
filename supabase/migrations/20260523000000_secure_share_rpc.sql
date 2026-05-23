-- Remplace la policy directe (qui permettait de lister toutes les courses partagées)
-- par un RPC sécurisé qui n'expose que les colonnes nécessaires sans user_id ni share_token.

-- 1. Supprimer la policy dangereuse
drop policy if exists "rc_select_public_share" on race_calendar;

-- 2. RPC sécurisé — le client ne contrôle jamais le WHERE, pas d'énumération possible
create or replace function get_shared_race(p_share_token text)
returns table (
  id              uuid,
  name            text,
  date            text,
  type            text,
  distance        numeric,
  elevation       numeric,
  goal_time       text,
  gpx_data        jsonb,
  last_projection jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    rc.id,
    rc.name,
    rc.date::text,
    rc.type,
    rc.distance,
    rc.elevation,
    rc.goal_time,
    rc.gpx_data,
    rc.last_projection
  from race_calendar rc
  where rc.share_token = p_share_token
    and rc.share_token is not null
  limit 1;
$$;

-- Accessible aux utilisateurs anonymes et authentifiés
grant execute on function get_shared_race(text) to anon, authenticated;
