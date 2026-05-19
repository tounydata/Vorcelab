# Vorcelab Security Checklist

Last reviewed: 2026-05-18

This checklist reflects the current Vorcelab beta baseline: static SPA, Supabase Auth/Postgres/Edge Functions, Strava OAuth, and local deterministic activity analysis.

---

## 1. Authentication

- [x] Email/password auth via Supabase Auth
- [x] Minimum password length: 8
- [x] Required characters: lowercase, uppercase, digit
- [x] Frontend password checklist shown during signup
- [x] Login errors are user-friendly and do not expose raw provider messages
- [ ] Leaked password protection enabled — not available on current free Supabase plan

---

## 2. Multi-user isolation

- [x] RLS enabled on user-data tables
- [x] Policies scoped to authenticated users where frontend access is required
- [x] Manual two-user test passed: account B cannot see account A data
- [x] `strava_tokens` is not read directly by the frontend
- [x] `strava_webhook_events` is server-managed only

User-scoped tables to keep protected:

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

---

## 3. Strava OAuth and tokens

- [x] Strava access/refresh tokens stored server-side only in `strava_tokens`
- [x] Tokens are not returned by `strava-status`
- [x] Dashboard Strava button uses `strava-disconnect`, not Supabase logout
- [x] Profile logout signs out from Vorcelab/Supabase only
- [x] `approval_prompt: 'force'` used during beta to avoid silent Strava browser-session reuse
- [x] `strava-oauth` rejects a `strava_athlete_id` already linked to another Vorcelab account
- [x] DB unique index enforces one `strava_athlete_id` per Vorcelab account link
- [x] Duplicate Strava account test passed with account A/B

---

## 4. Account deletion and data rights

- [x] `delete-account` Edge Function deployed
- [x] Function verifies Supabase JWT server-side
- [x] Function uses service role only server-side
- [x] Function revokes Strava best effort
- [x] Function deletes user data in public tables
- [x] Function deletes Supabase Auth user
- [x] Frontend button uses double confirmation with typed `SUPPRIMER`
- [x] Deleted test account cannot log in again

---

## 5. External AI / data sharing

- [x] External AI analysis disabled
- [x] Legacy `ai-analysis` Edge Function returns HTTP 410
- [x] Frontend activity analysis is local/deterministic
- [x] CGU state that Strava data is not used to train, fine-tune, or improve AI/ML models
- [ ] If external AI is reintroduced later: update CGU, privacy policy, user consent, and Strava review wording before deployment

---

## 6. CORS

Allowed origins currently used by Edge Functions:

- `https://tounydata.github.io`
- `http://localhost:5173`
- `http://localhost:4173`

Rules:

- [x] No `Access-Control-Allow-Origin: *` on authenticated endpoints
- [x] CORS issue fixed on `strava-disconnect`
- [x] Old `runner-os.com` domains removed from CORS allowlists

---

## 7. Frontend XSS risk

Current status: needs deeper audit.

Known risk pattern:

- The current monolith uses many `innerHTML` templates.
- Many values are from Strava, GPX, or user input and should be escaped before injection.

Required next audit:

- [ ] Search all `innerHTML` assignments
- [ ] Identify user-controlled variables inside template strings
- [ ] Replace with `textContent` or DOM node creation where possible
- [ ] Add a small `escapeHTML()` helper for unavoidable templates
- [ ] Never render external or user-provided text as raw HTML

---

## 8. Secrets and APIs

- [x] Strava client secret stored in Supabase Edge Function environment
- [x] Service role used only in Edge Functions
- [x] Frontend uses anon/public Supabase key only
- [ ] Remove unused old secrets from Supabase if old functions are permanently disabled
- [ ] Verify no real secrets are committed in Git history before public release

---

## 9. Supabase advisors

Known current advisor notes:

- `strava_tokens`: RLS enabled, no policy. This is intentional because it is server-managed and not for frontend reads.
- `strava_webhook_events`: RLS enabled, no policy. This is intentional because it is server-managed.
- Leaked password protection disabled. Not available on current free plan.

---

## 10. Before beta/public launch

Minimum checklist before inviting non-technical users:

- [x] Multi-user isolation test passed
- [x] Strava duplicate identity blocked
- [x] Strava disconnect works
- [x] Full account deletion works
- [x] Password rules active
- [ ] XSS/innerHTML audit completed
- [ ] CGU/privacy text updated for final brand and contact
- [ ] Strava branding/Powered by Strava placement verified
- [x] Old runner-os domains removed from all Edge Function CORS allowlists
- [ ] Basic error messages localized and user-friendly
