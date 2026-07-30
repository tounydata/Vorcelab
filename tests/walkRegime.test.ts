import { describe, it, expect } from 'vitest'
import { walkFractionAtGrade, blendedSectionTimeS } from '../src/lib/walkRegime'
import type { GradeBinStats } from '../src/lib/walkTransition'

// La marche doit être traitée PARTOUT où elle se produit, quelle que soit la pente.
// Une correction précédente la déclenchait au-delà de 20 % : elle n'a rien changé, parce
// que la marche commence vers 10-15 %. Ces tests verrouillent l'absence de tout seuil.

const bin = (gradeMinPct: number, walkFraction: number, seconds = 600): GradeBinStats => ({
  gradeMinPct, seconds, meanCadence: 60, meanSpeedKmH: 5, meanVamMH: 700, walkFraction,
})

// Courbe proche de celle mesurée sur les tracés réels.
const courbe = [bin(0, 0.09), bin(5, 0.31), bin(10, 0.66), bin(15, 0.88), bin(20, 0.94)]

describe('part de marche selon la pente (courbe personnelle mesurée)', () => {
  it('interpole entre les CENTRES des intervalles, pas leurs bornes', () => {
    // L'intervalle « 10-15 % » décrit le comportement autour de 12,5 %.
    expect(walkFractionAtGrade(courbe, 12.5)).toBeCloseTo(0.66, 3)
    const entre = walkFractionAtGrade(courbe, 15)!
    expect(entre).toBeGreaterThan(0.66)
    expect(entre).toBeLessThan(0.88)
  })

  it('prolonge à plat au lieu d’extrapoler hors du mesuré', () => {
    expect(walkFractionAtGrade(courbe, -5)).toBeCloseTo(0.09, 3)
    expect(walkFractionAtGrade(courbe, 60)).toBeCloseTo(0.94, 3)
  })

  it('ignore les intervalles sans matière', () => {
    const maigre = [bin(0, 0.1), bin(25, 1.0, 3)]
    expect(walkFractionAtGrade(maigre, 27)).toBeCloseTo(0.1, 3)
  })

  it('reste muet sans courbe exploitable', () => {
    expect(walkFractionAtGrade([], 12)).toBeNull()
    expect(walkFractionAtGrade(courbe, NaN)).toBeNull()
  })

  it('distingue deux athlètes à la même pente — c’est tout l’enjeu', () => {
    const marcheur = [bin(5, 0.5), bin(10, 0.9)]
    const coureur = [bin(5, 0.02), bin(10, 0.1)]
    expect(walkFractionAtGrade(marcheur, 10)!).toBeGreaterThan(0.6)
    expect(walkFractionAtGrade(coureur, 10)!).toBeLessThan(0.2)
  })
})

describe('temps d’une section : mélange continu des deux régimes', () => {
  const base = { distanceM: 1000, climbM: 120, runSpeedKmH: 9, walkVamMH: 700, walkSpeedKmH: 4.5 }

  it('ne change RIEN quand l’athlète ne marche pas', () => {
    const t = blendedSectionTimeS({ ...base, walkFraction: 0 })
    expect(t).toBeCloseTo(1000 / (9 / 3.6), 3) // temps de course pur
  })

  it('gouverne le temps par le DÉNIVELÉ quand la pente est la contrainte', () => {
    // 120 m de D+ sur 1 km : 617 s par la VAM contre 800 s au sol → la VAM ne borne pas,
    // c'est le sol. On vérifie donc la règle du MAXIMUM, pas une formule unique.
    const t = blendedSectionTimeS({ ...base, walkFraction: 1 })!
    expect(t).toBeCloseTo(Math.max(1000 / (4.5 / 3.6), (120 / 700) * 3600), 3)
  })

  it('retient la contrainte la plus lente, jamais leur moyenne', () => {
    // Section très raide : 300 m de D+ sur 1 km. La VAM devient la limite.
    const t = blendedSectionTimeS({ ...base, climbM: 300, walkFraction: 1 })!
    expect(t).toBeCloseTo((300 / 700) * 3600, 3)
    expect(t).toBeGreaterThan(1000 / (4.5 / 3.6))
  })

  it('varie continûment, sans saut, entre les deux', () => {
    let prev = blendedSectionTimeS({ ...base, walkFraction: 0 })!
    for (let w = 0.1; w <= 1.0001; w += 0.1) {
      const t = blendedSectionTimeS({ ...base, walkFraction: w })!
      expect(t).toBeGreaterThan(prev) // marcher est plus lent ici
      prev = t
    }
  })

  it('s’applique à FAIBLE pente si l’athlète y marche — aucun seuil', () => {
    // 40 m de D+ sur 1 km, soit 4 % : très loin des 20 % de l'ancienne tentative.
    const t = blendedSectionTimeS({ distanceM: 1000, climbM: 40, runSpeedKmH: 10, walkVamMH: 700, walkSpeedKmH: 4.5, walkFraction: 0.5 })!
    const pur = 1000 / (10 / 3.6)
    expect(t).toBeGreaterThan(pur) // la marche pèse bien, malgré la pente douce
  })

  it('borne les parts aberrantes au lieu de les propager', () => {
    expect(blendedSectionTimeS({ ...base, walkFraction: -3 })).toBeCloseTo(1000 / (9 / 3.6), 3)
    expect(blendedSectionTimeS({ ...base, walkFraction: 9 })).toBeCloseTo(Math.max(1000 / (4.5 / 3.6), (120 / 700) * 3600), 3)
  })

  it('se tait plutôt que d’inventer quand un régime manque', () => {
    expect(blendedSectionTimeS({ ...base, walkSpeedKmH: null, walkFraction: 0.5 })).toBeNull()
    expect(blendedSectionTimeS({ ...base, runSpeedKmH: null, walkFraction: 0.5 })).toBeNull()
    expect(blendedSectionTimeS({ ...base, distanceM: 0, walkFraction: 0 })).toBeNull()
  })
})
