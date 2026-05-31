import { describe, it, expect } from 'vitest'
import {
  motivationRegister,
  formatIntention,
  explainTerm,
  GLOSSARY,
  buildDebrief,
  adherenceFeedback,
} from '../src/lib/coachContent'

// ─── D1 — motivation ──────────────────────────────────────────────────────────────

describe('motivation', () => {
  it('adapte le registre au « pourquoi »', () => {
    expect(motivationRegister('perf')).not.toBe(motivationRegister('sante'))
    expect(motivationRegister('bienetre')).toBeTruthy()
  })

  it('formatIntention produit une implementation intention', () => {
    const s = formatIntention({ days: [1, 3, 6], time: '7h', place: 'au parc' })
    expect(s).toContain('7h')
    expect(s).toContain('au parc')
  })
})

// ─── D2 — glossaire 3 niveaux ─────────────────────────────────────────────────────

describe('glossaire', () => {
  it('donne 3 niveaux de lecture distincts par terme', () => {
    const t = GLOSSARY.seuil
    expect(t.ressenti).not.toBe(t.analogie)
    expect(t.analogie).not.toBe(t.science)
  })

  it('explainTerm renvoie le bon niveau', () => {
    expect(explainTerm('seuil', 'analogie')).toContain('moteur')
    expect(explainTerm('inconnu', 'ressenti')).toBeNull()
  })
})

// ─── D4 — débrief formatif ────────────────────────────────────────────────────────

describe('buildDebrief', () => {
  it('structure objectif → constat → 1 seul conseil', () => {
    const d = buildDebrief({ intent: 'tenir le seuil', factual: 'allure stable', oneTip: 'partir 5 s plus lentement' })
    expect(d.objectif).toBe('tenir le seuil')
    expect(d.constat).toBe('allure stable')
    expect(d.conseil).toBe('partir 5 s plus lentement')
    expect(Object.keys(d)).toHaveLength(3)
  })
})

// ─── D5 — adhérence bienveillante ─────────────────────────────────────────────────

describe('adherenceFeedback', () => {
  it('régularité → on_track', () => {
    expect(adherenceFeedback({ doneThisWeek: 4, plannedThisWeek: 4, consecutiveMissed: 0 }).state).toBe('on_track')
  })

  it('1 séance manquée → coup de pouce bienveillant (pas de punition)', () => {
    const f = adherenceFeedback({ doneThisWeek: 2, plannedThisWeek: 3, consecutiveMissed: 1 })
    expect(f.state).toBe('gentle_nudge')
    expect(f.message.toLowerCase()).not.toContain('échec')
  })

  it('2 manquées d\'affilée → reprise allégée (never miss twice)', () => {
    expect(adherenceFeedback({ doneThisWeek: 0, plannedThisWeek: 3, consecutiveMissed: 2 }).state).toBe('recover')
  })
})
