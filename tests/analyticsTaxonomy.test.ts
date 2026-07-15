import { describe, it, expect } from 'vitest'
import { ANALYTICS_EVENTS } from '../src/lib/useTrackEvent'

// Événements requis par la taxonomie produit (docs/analytics.md). Ce test évite
// qu'un événement disparaisse accidentellement de la taxonomie.
const REQUIRED = [
  'signup_started', 'signup_completed', 'legal_accepted', 'onboarding_started',
  'onboarding_completed', 'strava_connect_started', 'strava_connected',
  'strava_connect_failed', 'first_sync_completed', 'runner_profile_computed',
  'first_activity_viewed', 'first_analysis_viewed', 'race_created', 'gpx_uploaded',
  'first_strategy_generated', 'coach_plan_generated', 'first_workout_completed',
  'progate_view', 'upgrade_modal_open', 'upgrade_cta_click', 'checkout_started',
  'checkout_completed', 'checkout_failed', 'plan_renewed', 'plan_payment_failed',
  'plan_cancelled', 'plan_expired', 'account_deleted',
]

describe('taxonomie analytics', () => {
  it('contient tous les événements requis', () => {
    for (const e of REQUIRED) expect(ANALYTICS_EVENTS).toContain(e)
  })

  it('ne contient aucun doublon', () => {
    expect(new Set(ANALYTICS_EVENTS).size).toBe(ANALYTICS_EVENTS.length)
  })
})
