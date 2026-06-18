-- Seed du projet Supabase *dev* (runnerprofil) pour des écrans connectés réalistes.
-- Cible le compte de test : test@vorcelab.app (id 11111111-1111-1111-1111-111111111111).
-- Idempotent : on repart des seeds précédents à chaque exécution.
-- À exécuter via le MCP Supabase (execute_sql, project ibzwikugnsrcjvmonblm) ou psql.
do $$
declare uid uuid := '11111111-1111-1111-1111-111111111111';
begin
  delete from strava_activities where user_id = uid and strava_activity_id >= 900000000;
  delete from renfo_session_log where user_id = uid and source = 'strava';
  delete from race_calendar where user_id = uid and name like '[DEV]%';

  -- 28 sorties course sur ~8 semaines (1 tous les 2 jours).
  insert into strava_activities
    (id,user_id,strava_activity_id,name,type,sport_type,start_date,start_date_local,
     distance,moving_time,elapsed_time,total_elevation_gain,average_speed,
     average_heartrate,max_heartrate,average_cadence,is_race)
  select
    gen_random_uuid(), uid, 900000000 + g,
    case g % 4 when 0 then 'Sortie longue trail' when 1 then 'Footing récup'
               when 2 then 'Seuil / tempo' else 'Footing facile' end,
    case when g % 4 = 0 then 'TrailRun' else 'Run' end,
    case when g % 4 = 0 then 'TrailRun' else 'Run' end,
    (now() - ((55 - g*2) || ' days')::interval),
    (now() - ((55 - g*2) || ' days')::interval)::timestamp,
    d.dist, (d.dist / d.spd)::int, (d.dist / d.spd * 1.05)::int, d.elev,
    d.spd, d.hr, d.hr + 18, 168 + (g % 6), false
  from generate_series(0,27) g
  cross join lateral (
    select
      case g % 4 when 0 then 19000 + (g%3)*2500 when 1 then 8500 when 2 then 12000 else 7800 end::numeric as dist,
      case g % 4 when 0 then 620 + (g%4)*90 when 1 then 75 when 2 then 140 else 55 end::numeric as elev,
      case g % 4 when 0 then 2.45 when 1 then 2.85 when 2 then 3.40 else 2.95 end::numeric as spd,
      case g % 4 when 0 then 151 when 1 then 137 when 2 then 161 else 134 end::numeric as hr
  ) d;

  -- Séances renfo (2/sem sur 6 semaines).
  insert into renfo_session_log
    (id,user_id,session_date,day_key,completed_exercises,focus,duration_min,source,created_at,updated_at)
  select
    gen_random_uuid(), uid,
    (now() - ((g*3) || ' days')::interval)::date,
    (array['sunday','monday','tuesday','wednesday','thursday','friday','saturday'])
      [extract(dow from (now() - ((g*3) || ' days')::interval))::int + 1],
    '{}'::jsonb,
    case g % 3 when 0 then 'core' when 1 then 'lower' else 'mobility' end,
    case g % 3 when 0 then 35 when 1 then 45 else 25 end,
    'strava', now(), now()
  from generate_series(0,11) g;

  -- Courses à venir.
  insert into race_calendar (id,user_id,name,date,distance,elevation,type,goal_time,priority,created_at)
  values
    (gen_random_uuid(), uid, '[DEV] Trail des Crêtes', (current_date + 38), 32, 1800, 'trail', '4:15:00', 'A', now()),
    (gen_random_uuid(), uid, '[DEV] 10 km de la Ville', (current_date + 12), 10, 60,  'route', '42:00',  'B', now());

  update profiles set fc_max = 188, renfo_weekly_target = 2 where id = uid;
end $$;
