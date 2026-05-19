# ADR-001 — Vorcelab Current Foundation

**Status:** Accepted / current baseline  
**Date:** 2026-05-18  
**Authors:** Engineering lead

---

## Context

Vorcelab is a personal running and trail analytics application. The current production baseline is still a static frontend built around `index.html`, `app.js`, `style.css`, `renfo.js`, Supabase Auth/Postgres/Edge Functions, and Strava OAuth.

This document describes the current safe baseline after the multi-user and Strava security audit.

---

## Current Architecture

```
Browser SPA
  ├─ index.html / app.js / style.css / renfo.js
  ├─ Supabase Auth for email/password login
  ├─ Supabase Postgres with RLS on user-data tables
  └─ Supabase Edge Functions for sensitive operations
       ├─ strava-oauth        — OAuth code exchange, token storage, anti-duplicate Strava link
       ├─ strava-refresh      — Strava sync / token refresh
       ├─ strava-status       — connection status without exposing tokens
       ├─ strava-disconnect   — revoke Strava and remove local token row
       ├─ strava-webhook      — Strava webhook processing
       └─ delete-account      — full user data and Auth account deletion
```

---

## Security Decisions

| Concern | Current decision |
| --- | --- |
| Strava tokens | Stored server-side in `strava_tokens`; never returned to the browser |
| Multi-user isolation | RLS on user data + service-role Edge Functions scoped by authenticated user |
| Duplicate Strava identity | `strava-oauth` rejects an already-linked `strava_athlete_id`; DB unique index also enforces it |
| Strava disconnect | Dedicated `strava-disconnect` function; dashboard button disconnects Strava only |
| Vorcelab logout | Profile logout only signs out from Vorcelab/Supabase |
| Account deletion | `delete-account` removes user data, revokes Strava best effort, and deletes Supabase Auth user |
| Password policy | Minimum 8 chars, lowercase, uppercase, digit. Leaked password protection unavailable on free Supabase plan |
| External AI | Disabled. Vorcelab currently uses local deterministic activity analysis only |
| CORS | Authenticated Edge Functions use an allowlist for production and local dev origins |

---

## Current Data Ownership Model

Each user can access only their own rows. User-scoped tables include:

- `profiles`
- `activities_history`
- `race_calendar`
- `strava_activities`
- `strava_tokens`
- `renfo_profile`
- `renfo_program`
- `renfo_session_log`
- `renfo_exercise_log`
- `renfo_max_lifts`

`strava_tokens` and `strava_webhook_events` are server-managed tables. They are not intended to be queried directly by the frontend.

---

## Strava OAuth Baseline

The Strava OAuth flow must respect these rules:

1. The browser never receives Strava access or refresh tokens.
2. `approval_prompt` is forced in the frontend to avoid silent browser-session reuse during beta testing.
3. `strava-oauth` checks whether the returned `strava_athlete_id` already belongs to another Vorcelab user.
4. The database has a unique index on `strava_tokens(strava_athlete_id)` where not null.
5. If a duplicate Strava athlete is attempted, the API returns HTTP 409 with a clear message.

---

## External AI Decision

Older experimental AI/Groq/Claude analysis work is no longer part of the current production behavior.

Current rule:

> Strava data must not be sent to an external AI provider. Activity summaries are generated locally/deterministically from the user’s own data.

The legacy `ai-analysis` Edge Function is disabled and returns HTTP 410 if called.

---

## Near-Term Development Notes

Before adding major new features such as the renfo module, keep this baseline stable:

- Do not reintroduce Strava token exposure in the frontend.
- Do not add direct frontend calls to Strava APIs.
- Do not bypass the anti-duplicate Strava athlete check.
- Do not re-enable external AI analysis without updating CGU, privacy policy, user consent, and Strava review wording.
- Keep GitHub function sources aligned with deployed Supabase Edge Functions.

---

## Future Architecture Option

A future migration to React + Vite remains possible, but it is not the current production baseline. Any migration should preserve the same security model and data ownership rules described above.
