import { describe, it, expect } from 'vitest'
import {
  meanGradeFactor,
  dispersionCorrection,
  equivalentGrade,
  DISPERSION_INTERCEPT,
  DISPERSION_PER_DPKM,
  DISPERSION_MAX,
} from '../src/lib/gradeEquivalence'
import { meanGradeFactor as mobileFactor } from '../mobile/src/lib/gradeEquivalence'

// Équivalence plat ↔ terrain. Ce facteur est appliqué DEUX fois dans l'ancrage
// (neutraliser le terrain des courses passées, rendre celui de la course visée) : une
// erreur ici ne se voit pas quand les pentes se ressemblent, mais fausse tout dès que la
// course visée est plus accidentée que l'historique de l'athlète.

// Facteurs de référence MESURÉS en intégrant Minetti sur des profils GPS réels
// (rééchantillonnés à 50 m) — la vérité que le modèle doit approcher.
const MESURES: { dpkm: number; facteurReel: number }[] = [
  { dpkm: 3.2, facteurReel: 1.0265 },  // semi route
  { dpkm: 13.0, facteurReel: 1.0924 }, // cross
  { dpkm: 21.8, facteurReel: 1.1550 }, // trail vallonné
  { dpkm: 36.0, facteurReel: 1.2865 }, // trail 32 km / 1160 m
  { dpkm: 40.6, facteurReel: 1.3356 }, // trail raide court
  { dpkm: 47.3, facteurReel: 1.3932 }, // trail raide long
]

describe('meanGradeFactor', () => {
  it('1. profil rigoureusement plat → facteur exactement 1', () => {
    expect(meanGradeFactor(0)).toBe(1)
  })

  it('2. croissant avec le D+/km', () => {
    const f = [0.5, 5, 15, 30, 50, 80].map(meanGradeFactor)
    for (let i = 1; i < f.length; i++) expect(f[i]).toBeGreaterThan(f[i - 1])
  })

  it('3. jamais en dessous de 1 (le terrain ne fait jamais gagner du temps)', () => {
    for (const d of [0, 0.1, 1, 10, 50, 200, -5]) expect(meanGradeFactor(d)).toBeGreaterThanOrEqual(1)
  })

  it('4. approche les facteurs RÉELS mesurés à moins de 2 %', () => {
    // C'est le test qui compte : le modèle doit reproduire l'intégration sur profils
    // réels, pas seulement être monotone.
    for (const { dpkm, facteurReel } of MESURES) {
      const ecart = Math.abs(meanGradeFactor(dpkm) / facteurReel - 1)
      expect(ecart, `D+/km=${dpkm}`).toBeLessThan(0.02)
    }
  })

  it('5. sans la correction de dispersion, le terrain raide serait SOUS-estimé', () => {
    // Vérifie que la correction va dans le bon sens et qu'elle mord surtout en montagne.
    const sansCorrection = (d: number) => meanGradeFactor(d) / (1 + dispersionCorrection(d))
    expect(sansCorrection(47.3)).toBeLessThan(1.3932) // sous la vérité mesurée
    expect(meanGradeFactor(47.3)).toBeGreaterThan(sansCorrection(47.3))
  })
})

describe('dispersionCorrection', () => {
  it('6. ordonnée à l’origine non nulle : une route « plate » coûte déjà plus', () => {
    // Mesuré sous 2 m/km : 1,2 à 1,9 % d'excès. Un modèle proportionnel donnerait ~0,1 %.
    expect(dispersionCorrection(1)).toBeGreaterThan(0.005)
    expect(DISPERSION_INTERCEPT).toBeGreaterThan(0)
  })

  it('7. plafonnée — au-delà on n’a plus de mesure pour étayer', () => {
    expect(dispersionCorrection(1000)).toBe(DISPERSION_MAX)
    expect(dispersionCorrection(80)).toBeLessThanOrEqual(DISPERSION_MAX)
  })

  it('8. jamais négative', () => {
    for (const d of [-100, -1, 0]) expect(dispersionCorrection(d)).toBeGreaterThanOrEqual(0)
  })

  it('9. coefficients CALIBRÉS — garde-fou anti-dérive', () => {
    // Ajustés par moindres carrés sur 240 activités réelles (0,6 à 82 m/km). Une version
    // antérieure, calée sur 5 profils d'un seul athlète, donnait 0,00102 pour la pente :
    // 29 % de trop. Ces valeurs ne doivent pas rebouger sans nouvelle mesure.
    expect(DISPERSION_INTERCEPT).toBeCloseTo(0.00734, 5)
    expect(DISPERSION_PER_DPKM).toBeCloseTo(0.00059, 5)
    expect(DISPERSION_PER_DPKM).toBeLessThan(0.00102) // l'ancienne valeur surestimait
  })
})

describe('equivalentGrade', () => {
  it('10. bornée à 45 % et jamais négative', () => {
    expect(equivalentGrade(1000)).toBe(0.45)
    expect(equivalentGrade(-10)).toBe(0)
    expect(equivalentGrade(500)).toBeCloseTo(0.45, 6)
  })

  it('11. parité web ↔ mobile', () => {
    for (const d of [0, 3.2, 21.8, 36, 47.3, 82]) expect(mobileFactor(d)).toBe(meanGradeFactor(d))
  })
})
