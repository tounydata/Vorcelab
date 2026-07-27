import { describe, it, expect } from 'vitest'
import { ANALYTICS_EVENTS, ACTIVATION_ONCE_EVENTS, isActivationOnceEvent } from '../src/lib/analyticsEvents'

// Événements requis par la taxonomie produit (docs/analytics.md). Ce test évite
// qu'un événement disparaisse accidentellement de la taxonomie.
const REQUIRED = [
  'signup_started', 'signup_completed', 'legal_accepted', 'onboarding_started',
  'onboarding_completed', 'strava_connect_started', 'strava_connected',
  'strava_connect_failed', 'first_sync_completed', 'runner_profile_computed',
  'first_activity_viewed', 'first_analysis_viewed', 'race_created', 'gpx_uploaded',
  'first_strategy_generated', 'coach_plan_generated', 'first_workout_completed',
  'nutrition_plan_generated', 'race_debrief_viewed', 'crew_plan_shared',
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

// Jalons d'activation « une fois par utilisateur » (audit P0.3).
describe('jalons d\'activation (once)', () => {
  it('tous les jalons once font partie de la taxonomie', () => {
    for (const e of ACTIVATION_ONCE_EVENTS) expect(ANALYTICS_EVENTS).toContain(e)
  })

  it('couvre les jalons d\'activation attendus', () => {
    expect([...ACTIVATION_ONCE_EVENTS].sort()).toEqual([
      'coach_plan_generated',
      'first_analysis_viewed',
      'first_strategy_generated',
      'first_workout_completed',
      'nutrition_plan_generated',
    ])
  })

  it('isActivationOnceEvent distingue jalons et événements récurrents', () => {
    expect(isActivationOnceEvent('first_strategy_generated')).toBe(true)
    expect(isActivationOnceEvent('coach_plan_generated')).toBe(true)
    // Événements récurrents (vue/partage) → PAS des jalons once.
    expect(isActivationOnceEvent('race_debrief_viewed')).toBe(false)
    expect(isActivationOnceEvent('crew_plan_shared')).toBe(false)
    expect(isActivationOnceEvent('strategy_viewed')).toBe(false)
    expect(isActivationOnceEvent('session_start')).toBe(false)
  })
})
