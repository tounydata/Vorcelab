-- ─────────────────────────────────────────────────────────────────────────────
-- Test SQL — déduplication renfo par id d'activité Strava.
-- Vérifie qu'après migration : deux activités Strava différentes le même jour+focus
-- coexistent, un même id est rejeté (idempotence), et les saisies MANUELLES restent
-- dédupliquées par date+focus. Exécuté par scripts/test-rls.sh.
-- ─────────────────────────────────────────────────────────────────────────────
\set ON_ERROR_STOP on
set client_min_messages = notice;

create table public.renfo_session_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  session_date date not null,
  focus text,
  source varchar not null default 'manual',
  day_key text,
  completed_exercises jsonb not null default '{}'::jsonb
);
-- État AVANT : unique (user, date, focus) — deux activités le même jour s'écrasent.
create unique index renfo_session_log_user_date_focus_key
  on public.renfo_session_log (user_id, session_date, focus) where focus is not null;

\echo '== application de la migration =='
\i supabase/migrations/20260713000000_renfo_source_activity_id.sql

-- 1. Deux activités Strava différentes, même jour + focus → LES DEUX conservées.
do $$
begin
  insert into public.renfo_session_log (user_id, session_date, focus, source, source_activity_id)
    values ('11111111-1111-1111-1111-111111111111','2026-06-03','force_lourde','strava','111');
  insert into public.renfo_session_log (user_id, session_date, focus, source, source_activity_id)
    values ('11111111-1111-1111-1111-111111111111','2026-06-03','force_lourde','strava','222');
  if (select count(*) from public.renfo_session_log where source_activity_id in ('111','222')) <> 2 then
    raise exception 'ÉCHEC: deux activités distinctes le même jour non conservées';
  end if;
  raise notice 'OK  deux activités Strava distinctes le même jour+focus coexistent';
end $$;

-- 2. Même id d'activité rejoué → rejeté (idempotence).
do $$
declare dup boolean := false;
begin
  begin
    insert into public.renfo_session_log (user_id, session_date, focus, source, source_activity_id)
      values ('11111111-1111-1111-1111-111111111111','2026-06-03','force_lourde','strava','111');
  exception when unique_violation then dup := true; end;
  if not dup then raise exception 'ÉCHEC: même source_activity_id accepté deux fois'; end if;
  raise notice 'OK  même id d''activité rejeté (idempotence)';
end $$;

-- 3. Saisies MANUELLES : toujours dédupliquées par (date, focus).
do $$
declare dup boolean := false;
begin
  insert into public.renfo_session_log (user_id, session_date, focus, source)
    values ('11111111-1111-1111-1111-111111111111','2026-06-10','haut_corps','manual');
  begin
    insert into public.renfo_session_log (user_id, session_date, focus, source)
      values ('11111111-1111-1111-1111-111111111111','2026-06-10','haut_corps','manual');
  exception when unique_violation then dup := true; end;
  if not dup then raise exception 'ÉCHEC: doublon manuel même date+focus accepté'; end if;
  raise notice 'OK  anti-doublon manuel (date+focus) préservé';
end $$;

-- 4. Une activité Strava le même jour+focus qu'une saisie manuelle → autorisée
--    (l'unique manuel ne s'applique qu'aux lignes sans source_activity_id).
do $$
begin
  insert into public.renfo_session_log (user_id, session_date, focus, source, source_activity_id)
    values ('11111111-1111-1111-1111-111111111111','2026-06-10','haut_corps','strava','333');
  raise notice 'OK  activité Strava coexiste avec une saisie manuelle même jour+focus';
end $$;

\echo '== TEST DEDUP RENFO : PASSÉ =='
