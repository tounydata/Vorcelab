import { describe, it, expect } from 'vitest'
import {
  isTrustedSubscription,
  planActivityUpdate,
  webhookEventKey,
} from '../supabase/functions/_shared/stravaWebhook.ts'

describe('planActivityUpdate', () => {
  it('applique un renommage SANS appel à l’API Strava', () => {
    // Cas le plus fréquent des événements `update` : le titre est déjà dans le
    // payload, le redemander à Strava serait un appel gaspillé.
    const plan = planActivityUpdate({ title: 'Sortie longue Vercors' })
    expect(plan.needsFetch).toBe(false)
    expect(plan.patch).toEqual({ name: 'Sortie longue Vercors' })
    expect(plan.becamePrivate).toBe(false)
  })

  it('applique un changement de type sur les deux colonnes', () => {
    const plan = planActivityUpdate({ type: 'TrailRun' })
    expect(plan.needsFetch).toBe(false)
    expect(plan.patch).toEqual({ type: 'TrailRun', sport_type: 'TrailRun' })
  })

  it('signale le passage en privé', () => {
    const plan = planActivityUpdate({ private: 'true' })
    expect(plan.becamePrivate).toBe(true)
    expect(plan.needsFetch).toBe(false)
  })

  it('ne signale pas un passage en public comme un passage en privé', () => {
    expect(planActivityUpdate({ private: 'false' }).becamePrivate).toBe(false)
  })

  it('exige une relecture quand `updates` est absent ou vide', () => {
    // Strava signale un changement sans le décrire : rester exact impose de relire.
    expect(planActivityUpdate(undefined).needsFetch).toBe(true)
    expect(planActivityUpdate(null).needsFetch).toBe(true)
    expect(planActivityUpdate({}).needsFetch).toBe(true)
  })

  it('exige une relecture dès qu’un champ inconnu apparaît', () => {
    const plan = planActivityUpdate({ title: 'Renommée', gear_id: 'g123' })
    expect(plan.needsFetch).toBe(true)
    // Le champ connu reste appliqué : la relecture le confirmera.
    expect(plan.patch).toEqual({ name: 'Renommée' })
  })

  it('ignore un titre vide plutôt que d’effacer le nom en base', () => {
    expect(planActivityUpdate({ title: '' }).patch).toEqual({})
  })
})

describe('isTrustedSubscription', () => {
  it('accepte un événement de notre abonnement', () => {
    expect(isTrustedSubscription(123456, '123456')).toEqual({
      trusted: true,
      unconfigured: false,
    })
  })

  it('rejette un événement forgé portant un autre abonnement', () => {
    // L'URL du webhook est publique et non signée : sans ce filtre, un tiers pouvait
    // déclencher notre consommation de quota Strava.
    expect(isTrustedSubscription(999, '123456').trusted).toBe(false)
  })

  it('accepte, en le signalant, tant que l’abonnement n’est pas configuré', () => {
    expect(isTrustedSubscription(123456, undefined)).toEqual({
      trusted: true,
      unconfigured: true,
    })
    expect(isTrustedSubscription(123456, '   ')).toEqual({
      trusted: true,
      unconfigured: true,
    })
  })

  it('compare les valeurs sans se soucier du type reçu', () => {
    expect(isTrustedSubscription('123456', '123456').trusted).toBe(true)
  })
})

describe('webhookEventKey', () => {
  it('donne la même clé à un rejeu du même événement', () => {
    const event = { owner_id: 42, object_id: 777, aspect_type: 'update', event_time: 1_700_000_000 }
    expect(webhookEventKey(event)).toBe(webhookEventKey({ ...event }))
  })

  it('distingue deux modifications successives de la même activité', () => {
    const base = { owner_id: 42, object_id: 777, aspect_type: 'update' }
    expect(webhookEventKey({ ...base, event_time: 1 })).not.toBe(
      webhookEventKey({ ...base, event_time: 2 }),
    )
  })
})
