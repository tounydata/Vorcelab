// Taxonomie produit — SANS dépendance (pas d'import supabase) pour rester
// importable en test Node et très tôt. useTrackEvent la réexporte.
//
// Certains événements sont émis par le CLIENT (parcours UI), d'autres par le
// SERVEUR (webhook Stripe) : la confirmation de paiement ne dépend jamais du
// client → pas de double comptage. Voir docs/analytics.md.
export const ANALYTICS_EVENTS = [
  // Acquisition / onboarding
  'signup_started', 'signup_completed', 'legal_accepted',
  'onboarding_started', 'onboarding_completed',
  // Connexion Strava & première valeur
  'strava_connect_started', 'strava_connected', 'strava_connect_failed',
  'first_sync_completed', 'runner_profile_computed',
  'first_activity_viewed', 'first_analysis_viewed',
  // Usage cœur
  'race_created', 'gpx_uploaded', 'first_strategy_generated',
  'coach_plan_generated', 'first_workout_completed',
  // Paywall & abonnement (checkout_* client ; les confirmations viennent du webhook)
  'progate_view', 'upgrade_modal_open', 'upgrade_cta_click',
  'checkout_started', 'checkout_completed', 'checkout_failed',
  'plan_renewed', 'plan_payment_failed', 'plan_cancelled', 'plan_expired',
  'account_deleted',
  // Événements historiques conservés
  'session_start', 'coach_viewed', 'strategy_viewed', 'activities_viewed',
  'plan_upgraded', 'dashboard_pro_card_click', 'subscription_manage_click',
  'payment_success_viewed',
] as const

export type AppEvent = (typeof ANALYTICS_EVENTS)[number]
