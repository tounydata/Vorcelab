/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Client ID public de l'app Strava (OAuth). Défini à la compilation. */
  readonly VITE_STRAVA_CLIENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
