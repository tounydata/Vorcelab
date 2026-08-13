import { describe, it, expect } from 'vitest'
import {
  BACKGROUND_BUDGET_RATIO,
  describeRateLimit,
  readRateLimit,
  shouldStopBackground,
} from '../supabase/functions/_shared/stravaRateLimit.ts'

function resWith(headers: Record<string, string>): Response {
  return new Response(null, { headers })
}

describe('readRateLimit', () => {
  it('lit les en-têtes globaux', () => {
    const state = readRateLimit(resWith({
      'x-ratelimit-limit': '100,1000',
      'x-ratelimit-usage': '23,412',
    }))
    expect(state).toMatchObject({
      shortLimit: 100, dailyLimit: 1000, shortUsage: 23, dailyUsage: 412,
    })
  })

  it('préfère les en-têtes de LECTURE quand ils sont présents', () => {
    // Le backfill ne fait que lire : c'est ce quota-là qui le concerne.
    const state = readRateLimit(resWith({
      'x-ratelimit-limit': '100,1000',
      'x-ratelimit-usage': '10,100',
      'x-readratelimit-limit': '300,3000',
      'x-readratelimit-usage': '299,500',
    }))
    expect(state).toMatchObject({ shortLimit: 300, shortUsage: 299 })
  })

  it('renvoie null quand les en-têtes sont absents ou illisibles', () => {
    expect(readRateLimit(resWith({}))).toBeNull()
    expect(readRateLimit(resWith({
      'x-ratelimit-limit': 'nawak', 'x-ratelimit-usage': '1,2',
    }))).toBeNull()
    // Une seule valeur au lieu de deux → inexploitable.
    expect(readRateLimit(resWith({
      'x-ratelimit-limit': '100', 'x-ratelimit-usage': '5',
    }))).toBeNull()
  })
})

describe('shouldStopBackground', () => {
  const base = { shortLimit: 100, dailyLimit: 1000, readAt: '2026-08-07T00:00:00Z' }

  it('laisse passer le premier appel quand aucun état n’est connu', () => {
    // Sinon le backfill ne démarrerait jamais : c'est le premier appel qui renseigne.
    expect(shouldStopBackground(null)).toBe(false)
  })

  it('laisse travailler tant que le budget de fond n’est pas atteint', () => {
    expect(shouldStopBackground({ ...base, shortUsage: 50, dailyUsage: 100 })).toBe(false)
    expect(shouldStopBackground({ ...base, shortUsage: 89, dailyUsage: 100 })).toBe(false)
  })

  it('arrête AVANT le plafond, en gardant une marge pour les appels interactifs', () => {
    // 90/100 sur la fenêtre courte : on s'arrête alors que Strava accepterait encore.
    expect(shouldStopBackground({ ...base, shortUsage: 90, dailyUsage: 100 })).toBe(true)
    expect(shouldStopBackground({ ...base, shortUsage: 10, dailyUsage: 900 })).toBe(true)
  })

  it('déclenche sur la fenêtre quotidienne même si la fenêtre courte est vide', () => {
    expect(shouldStopBackground({ ...base, shortUsage: 0, dailyUsage: 999 })).toBe(true)
  })

  it('respecte un ratio explicite', () => {
    expect(shouldStopBackground({ ...base, shortUsage: 50, dailyUsage: 0 }, 0.5)).toBe(true)
    expect(shouldStopBackground({ ...base, shortUsage: 49, dailyUsage: 0 }, 0.5)).toBe(false)
  })

  it('ignore un plafond nul plutôt que de tout bloquer', () => {
    // Un plafond à 0 signifierait « arrête-toi toujours » avec une comparaison naïve.
    expect(shouldStopBackground({
      shortLimit: 0, dailyLimit: 0, shortUsage: 5, dailyUsage: 5, readAt: '',
    })).toBe(false)
  })

  it('garde une marge réelle sous le plafond', () => {
    expect(BACKGROUND_BUDGET_RATIO).toBeGreaterThan(0)
    expect(BACKGROUND_BUDGET_RATIO).toBeLessThan(1)
  })
})

describe('describeRateLimit', () => {
  it('résume l’état pour les journaux', () => {
    expect(describeRateLimit({
      shortLimit: 100, dailyLimit: 1000, shortUsage: 23, dailyUsage: 412,
      readAt: '2026-08-07T00:00:00Z',
    })).toEqual({ short: '23/100', daily: '412/1000', read_at: '2026-08-07T00:00:00Z' })
  })

  it('renvoie null sans état', () => {
    expect(describeRateLimit(null)).toBeNull()
  })
})
