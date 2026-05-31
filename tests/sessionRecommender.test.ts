import { describe, it, expect } from 'vitest'
import { recommendSessions, type SessionCategory } from '../src/lib/sessionRecommender'

const ALL: SessionCategory[] = ['easy', 'long', 'tempo', 'cruise', 'vo2', 'hill', 'race_pace', 'recovery']

describe('recommendSessions — choix-first', () => {
  it('retourne TOUJOURS toutes les candidates (n\'en retire jamais)', () => {
    const recs = recommendSessions(ALL, { phase: 'base' })
    expect(recs).toHaveLength(ALL.length)
  })

  it('exactement une séance « recommandée »', () => {
    const recs = recommendSessions(ALL, { phase: 'build' })
    expect(recs.filter(r => r.badge === 'recommended')).toHaveLength(1)
  })

  it('en phase base, la recommandée est une séance favorisée (facile/longue/côte)', () => {
    const recs = recommendSessions(['vo2', 'easy', 'tempo'], { phase: 'base' })
    const top = recs.find(r => r.badge === 'recommended')!
    expect(['easy', 'long', 'hill']).toContain(top.category)
  })

  it('surcharge → le facile est recommandé, le dur badgé « caution » (jamais retiré)', () => {
    const recs = recommendSessions(['easy', 'vo2'], { phase: 'base', overload: true })
    expect(recs.find(r => r.category === 'easy')!.badge).toBe('recommended')
    expect(recs.find(r => r.category === 'vo2')!.badge).toBe('caution')
    expect(recs).toHaveLength(2) // rien retiré
  })

  it('séance dure faite hier → badge caution sur le dur', () => {
    const recs = recommendSessions(['easy', 'hill'], { phase: 'base', daysSinceHard: 1 })
    expect(recs.find(r => r.category === 'hill')!.badge).toBe('caution')
  })

  it('catégorie déjà faite cette semaine → badge repeat', () => {
    const recs = recommendSessions(['tempo', 'cruise'], { phase: 'build', recentCategories: ['tempo'] })
    expect(recs.find(r => r.category === 'tempo')!.badge).toBe('repeat')
    expect(recs.find(r => r.category === 'cruise')!.badge).toBe('recommended')
  })

  it('charge élevée (ACWR) → séance facile badgée récup', () => {
    const recs = recommendSessions(['easy', 'tempo'], { phase: 'build', acwr: 1.5 })
    // easy n'est pas favorisé en build mais le boost de charge le remonte
    expect(recs.find(r => r.category === 'easy')!.badge).toBe('recommended')
  })
})
