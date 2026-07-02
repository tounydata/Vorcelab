/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Client ID public de l'app Strava (OAuth). Défini à la compilation. */
  readonly VITE_STRAVA_CLIENT_ID?: string
  /** Projet Supabase (défaut : prod). Permet de viser un env dev/staging. */
  readonly VITE_SUPABASE_URL?: string
  /** Clé anon Supabase (publique par conception — la sécurité = RLS). */
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** Stripe Payment Links de la modale PRO. Sans eux : fallback mailto. */
  readonly VITE_STRIPE_MONTHLY_URL?: string
  readonly VITE_STRIPE_ANNUAL_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
