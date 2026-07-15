import { describe, it, expect } from 'vitest'
import { PRICING, fmtEur, monthlyEquivalentEur, annualSavingsPct, priceLabels } from '../src/lib/pricing'

describe('pricing — source de vérité unique', () => {
  it('fmtEur : entier sans décimale, sinon virgule FR', () => {
    expect(fmtEur(5)).toBe('5€')
    expect(fmtEur(50)).toBe('50€')
    expect(fmtEur(4.1666)).toBe('4,17€')
  })

  it('équivalent mensuel de l’annuel = annuel / 12', () => {
    expect(monthlyEquivalentEur(PRICING.annual)).toBeCloseTo(PRICING.annual.amountEur / 12, 5)
  })

  it('% d’économie annuel vs mensuel, cohérent avec les montants', () => {
    // 50/12 ≈ 4,17 vs 5 → ~17 %
    expect(annualSavingsPct()).toBe(Math.round((1 - PRICING.annual.amountEur / 12 / PRICING.monthly.amountEur) * 100))
  })

  it('libellés dérivés (pas de valeurs codées en dur ailleurs)', () => {
    expect(priceLabels.monthly()).toBe(`${fmtEur(PRICING.monthly.amountEur)}/mois`)
    expect(priceLabels.annual()).toBe(`${fmtEur(PRICING.annual.amountEur)}/an`)
    expect(priceLabels.annualPerMonth()).toBe(`${fmtEur(PRICING.annual.amountEur / 12)}/mois`)
  })
})
