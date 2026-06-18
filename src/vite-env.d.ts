/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Client ID public de l'app Strava (OAuth). Défini à la compilation. */
  readonly VITE_STRAVA_CLIENT_ID?: string
  /** Projet Supabase ciblé. Absent → prod (fallback codé en dur). En local : .env.local → dev. */
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
