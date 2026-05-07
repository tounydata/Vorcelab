// Vite replaces import.meta.env at build time; cast once here so the rest of
// the app gets typed values without triggering no-unsafe-member-access everywhere.
const raw = import.meta.env as Record<string, string | undefined>

function required(key: string): string {
  const value = raw[key]
  if (!value) throw new Error(`Missing required env var: ${key}`)
  return value
}

function optional(key: string, fallback = ''): string {
  return raw[key] ?? fallback
}

export const env = {
  supabase: {
    url: required('VITE_SUPABASE_URL'),
    anonKey: required('VITE_SUPABASE_ANON_KEY'),
  },
  strava: {
    clientId: required('VITE_STRAVA_CLIENT_ID'),
    oauthFunctionName: optional('VITE_STRAVA_OAUTH_FUNCTION_NAME', 'strava-auth'),
  },
  app: {
    version: optional('VITE_APP_VERSION', '0.0.0'),
  },
  flags: {
    newProfile: optional('VITE_FF_NEW_PROFILE') === 'true',
    newRaceCalendar: optional('VITE_FF_NEW_RACE_CALENDAR') === 'true',
    newActivities: optional('VITE_FF_NEW_ACTIVITIES') === 'true',
    newAnalysis: optional('VITE_FF_NEW_ANALYSIS') === 'true',
  },
} as const
