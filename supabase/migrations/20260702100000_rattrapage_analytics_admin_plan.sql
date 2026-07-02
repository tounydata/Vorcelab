-- ─────────────────────────────────────────────────────────────────────────────
-- Migration de RATTRAPAGE — objets créés en prod hors migrations (schema drift).
-- Reproduit l'état de la base `runnerdata` au 2026-07-02 : analytics
-- (user_events), administration (is_admin, RPCs admin_*), plan PRO
-- (plan_expires_at, plan_note, plan_grants).
-- Idempotente : sans effet sur la prod, crée les objets sur un env vierge.
--
-- Deux corrections volontaires par rapport à la prod :
--  1. profiles.last_seen ajoutée — update_last_seen() la référençait sans
--     qu'elle existe (échec silencieux à chaque session_start).
--  2. admin_get_activity_feed lit l'email depuis auth.users — la version prod
--     référençait profiles.email, colonne inexistante (échec à l'appel).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── profiles : colonnes plan / admin ─────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS plan_note TEXT,
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ;

-- ── user_events : tracking produit ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_events_user_id_idx ON public.user_events (user_id);
CREATE INDEX IF NOT EXISTS user_events_created_at_idx ON public.user_events (created_at DESC);
CREATE INDEX IF NOT EXISTS user_events_event_idx ON public.user_events (event);

ALTER TABLE public.user_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_insert_own_events ON public.user_events;
CREATE POLICY users_insert_own_events ON public.user_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS users_select_own_events ON public.user_events;
CREATE POLICY users_select_own_events ON public.user_events
  FOR SELECT USING (auth.uid() = user_id);

-- ── plan_grants : journal des attributions PRO ──────────────────────────────

CREATE TABLE IF NOT EXISTS public.plan_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by UUID NOT NULL REFERENCES auth.users(id),
  plan_tier TEXT NOT NULL DEFAULT 'pro' CHECK (plan_tier IN ('free', 'pro')),
  expires_at TIMESTAMPTZ,
  note TEXT,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

ALTER TABLE public.plan_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admins_manage_grants ON public.plan_grants;
CREATE POLICY admins_manage_grants ON public.plan_grants
  FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()));

-- ── Présence utilisateur ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_last_seen()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE profiles SET last_seen = now() WHERE id = auth.uid();
END;
$$;

-- ── Gestion du plan PRO (admin) ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_grant_pro(target_user_id uuid, months integer DEFAULT NULL::integer, note_text text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  is_admin_caller boolean;
  expires         timestamptz;
BEGIN
  SELECT is_admin INTO is_admin_caller
  FROM public.profiles WHERE id = auth.uid();

  IF NOT COALESCE(is_admin_caller, false) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF months IS NOT NULL THEN
    expires := now() + (months || ' months')::interval;
  END IF;

  UPDATE public.profiles SET
    plan_tier       = 'pro',
    plan_expires_at = expires,
    plan_note       = note_text
  WHERE id = target_user_id;

  INSERT INTO public.plan_grants (user_id, granted_by, plan_tier, expires_at, note)
  VALUES (target_user_id, auth.uid(), 'pro', expires, note_text);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_revoke_pro(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  is_admin_caller boolean;
BEGIN
  SELECT is_admin INTO is_admin_caller
  FROM public.profiles WHERE id = auth.uid();

  IF NOT COALESCE(is_admin_caller, false) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.profiles SET
    plan_tier       = 'free',
    plan_expires_at = NULL,
    plan_note       = NULL
  WHERE id = target_user_id;

  UPDATE public.plan_grants SET revoked_at = now()
  WHERE user_id = target_user_id AND revoked_at IS NULL;
END;
$$;

-- ── Dashboard admin : stats & feed ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_get_kpis()
RETURNS TABLE(total_users bigint, new_users_7d bigint, new_users_30d bigint, active_users_7d bigint, active_users_30d bigint, pro_users bigint, sessions_today bigint, sessions_7d bigint, sessions_30d bigint)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT (SELECT COALESCE(is_admin, false) FROM profiles WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM profiles)::bigint,
    (SELECT COUNT(*) FROM profiles WHERE created_at > now() - interval '7 days')::bigint,
    (SELECT COUNT(*) FROM profiles WHERE created_at > now() - interval '30 days')::bigint,
    (SELECT COUNT(DISTINCT user_id) FROM user_events WHERE event = 'session_start' AND created_at > now() - interval '7 days')::bigint,
    (SELECT COUNT(DISTINCT user_id) FROM user_events WHERE event = 'session_start' AND created_at > now() - interval '30 days')::bigint,
    (SELECT COUNT(*) FROM profiles WHERE plan_tier = 'pro' AND (plan_expires_at IS NULL OR plan_expires_at > now()))::bigint,
    (SELECT COUNT(*) FROM user_events WHERE event = 'session_start' AND created_at > now() - interval '1 day')::bigint,
    (SELECT COUNT(*) FROM user_events WHERE event = 'session_start' AND created_at > now() - interval '7 days')::bigint,
    (SELECT COUNT(*) FROM user_events WHERE event = 'session_start' AND created_at > now() - interval '30 days')::bigint;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_signups_daily(days_back integer DEFAULT 30)
RETURNS TABLE(day date, signups bigint)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT (SELECT COALESCE(is_admin, false) FROM profiles WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT
    gs::date AS day,
    COUNT(p.id)::bigint AS signups
  FROM generate_series(
    (now() - (days_back || ' days')::interval)::date,
    now()::date,
    '1 day'::interval
  ) AS gs
  LEFT JOIN profiles p ON p.created_at::date = gs::date
  GROUP BY gs::date
  ORDER BY gs::date;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_sessions_daily(days_back integer DEFAULT 30)
RETURNS TABLE(day date, sessions bigint, unique_users bigint)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT (SELECT COALESCE(is_admin, false) FROM profiles WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT
    gs::date AS day,
    COUNT(e.id)::bigint AS sessions,
    COUNT(DISTINCT e.user_id)::bigint AS unique_users
  FROM generate_series(
    (now() - (days_back || ' days')::interval)::date,
    now()::date,
    '1 day'::interval
  ) AS gs
  LEFT JOIN user_events e
    ON e.created_at::date = gs::date
    AND e.event = 'session_start'
  GROUP BY gs::date
  ORDER BY gs::date;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_event_breakdown(days_back integer DEFAULT 30)
RETURNS TABLE(event text, total_count bigint, unique_users bigint)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT (SELECT COALESCE(is_admin, false) FROM profiles WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT e.event, COUNT(*)::bigint, COUNT(DISTINCT e.user_id)::bigint
  FROM user_events e
  WHERE e.created_at > now() - (days_back || ' days')::interval
  GROUP BY e.event
  ORDER BY COUNT(*) DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_funnel()
RETURNS TABLE(step text, users bigint)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT (SELECT COALESCE(is_admin, false) FROM profiles WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY VALUES
    ('Inscrits',        (SELECT COUNT(*) FROM profiles)::bigint),
    ('Session app',     (SELECT COUNT(DISTINCT user_id) FROM user_events WHERE event = 'session_start')::bigint),
    ('Strava connecté', (SELECT COUNT(DISTINCT user_id) FROM user_events WHERE event = 'strava_connected')::bigint),
    ('Course créée',    (SELECT COUNT(DISTINCT user_id) FROM user_events WHERE event = 'race_created')::bigint),
    ('Coach consulté',  (SELECT COUNT(DISTINCT user_id) FROM user_events WHERE event = 'coach_viewed')::bigint),
    ('Passé PRO',       (SELECT COUNT(*) FROM profiles WHERE plan_tier = 'pro')::bigint);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_weekly_retention()
RETURNS TABLE(cohort_week date, users_that_week bigint, returned_next_week bigint)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT (SELECT COALESCE(is_admin, false) FROM profiles WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT
    date_trunc('week', w1.created_at)::date AS cohort_week,
    COUNT(DISTINCT w1.user_id)::bigint AS users_that_week,
    COUNT(DISTINCT w2.user_id)::bigint AS returned_next_week
  FROM user_events w1
  LEFT JOIN user_events w2
    ON w2.user_id = w1.user_id
    AND date_trunc('week', w2.created_at) = date_trunc('week', w1.created_at) + interval '1 week'
    AND w2.event = 'session_start'
  WHERE w1.event = 'session_start'
    AND w1.created_at > now() - interval '10 weeks'
  GROUP BY date_trunc('week', w1.created_at)
  ORDER BY cohort_week;
END;
$$;

-- Fix vs prod : email depuis auth.users (profiles.email n'existe pas).
CREATE OR REPLACE FUNCTION public.admin_get_activity_feed(limit_n integer DEFAULT 60)
RETURNS TABLE(event_id uuid, user_id uuid, user_email text, user_name text, event text, meta jsonb, created_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT (SELECT COALESCE(is_admin, false) FROM profiles WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
    SELECT e.id, e.user_id, u.email::text, p.name, e.event, e.meta, e.created_at
    FROM user_events e
    JOIN profiles p ON p.id = e.user_id
    JOIN auth.users u ON u.id = e.user_id
    ORDER BY e.created_at DESC
    LIMIT limit_n;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_user_activity(target_user_id uuid, limit_n integer DEFAULT 30)
RETURNS TABLE(event_id uuid, event text, meta jsonb, created_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT (SELECT COALESCE(is_admin, false) FROM profiles WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
    SELECT e.id, e.event, e.meta, e.created_at
    FROM user_events e
    WHERE e.user_id = target_user_id
    ORDER BY e.created_at DESC
    LIMIT limit_n;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_users()
RETURNS TABLE(id uuid, email text, name text, plan_tier text, plan_expires_at timestamp with time zone, plan_note text, is_admin boolean, joined_at timestamp with time zone, last_seen timestamp with time zone)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    p.id,
    u.email::text,
    p.name,
    p.plan_tier,
    p.plan_expires_at,
    p.plan_note,
    p.is_admin,
    u.created_at   AS joined_at,
    u.last_sign_in_at AS last_seen
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE (SELECT is_admin FROM public.profiles WHERE id = auth.uid())
  ORDER BY u.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_users_activity_summary()
RETURNS TABLE(user_id uuid, last_event text, last_seen_at timestamp with time zone, events_30d bigint)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT (SELECT COALESCE(is_admin, false) FROM profiles WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
    SELECT
      e.user_id,
      (SELECT e2.event FROM user_events e2 WHERE e2.user_id = e.user_id ORDER BY e2.created_at DESC LIMIT 1),
      MAX(e.created_at),
      COUNT(*) FILTER (WHERE e.created_at > now() - interval '30 days')
    FROM user_events e
    GROUP BY e.user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_grants(target_user_id uuid)
RETURNS TABLE(id uuid, plan_tier text, expires_at timestamp with time zone, note text, granted_at timestamp with time zone, revoked_at timestamp with time zone, granted_by_email text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    g.id,
    g.plan_tier,
    g.expires_at,
    g.note,
    g.granted_at,
    g.revoked_at,
    u.email::text AS granted_by_email
  FROM public.plan_grants g
  JOIN auth.users u ON u.id = g.granted_by
  WHERE g.user_id = target_user_id
    AND (SELECT is_admin FROM public.profiles WHERE id = auth.uid())
  ORDER BY g.granted_at DESC;
$$;
