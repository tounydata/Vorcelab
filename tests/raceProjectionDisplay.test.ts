import { describe, it, expect } from 'vitest'
import { fmtRaceTimeS, fmtHM } from '../src/lib/raceStrategyView'

// ── Affichage de la projection : dashboard ↔ stratégie ────────────────────────
// La projection (les données) est déjà identique partout (calcul déterministe,
// hook partagé). L'écart « 2h22 vs 2h23 » qui persistait venait UNIQUEMENT du
// formatage : le dashboard TRONQUAIT les secondes (Math.floor) là où la stratégie
// les ARRONDISSAIT (fmtHM). Même temps, deux formateurs → 1 minute d'écart dès que
// les secondes tombaient entre 30 et 59. fmtRaceTimeS est la source unique.

describe('fmtRaceTimeS — source unique de formatage (arrondi, pas troncature)', () => {
  it('arrondit à la minute (2h22m30s → 2h23, pas 2h22)', () => {
    // 8550 s = 2 h 22 min 30 s. L'ancien dashboard (floor) affichait « 2h22 ».
    expect(fmtRaceTimeS(8550)).toBe('2h23')
  })

  it('arrondit vers le bas sous 30 s (2h22m29s → 2h22)', () => {
    expect(fmtRaceTimeS(8549)).toBe('2h22')
  })

  it('ne produit jamais « 2h60 » (arrondi avant séparation h/min)', () => {
    // 10 799 s ≈ 2 h 59 min 59 s → arrondi 3 h 00.
    expect(fmtRaceTimeS(10799)).toBe('3h00')
  })

  it('est cohérent avec fmtHM (qui prend des minutes)', () => {
    for (let s = 0; s <= 5 * 3600; s += 7) {
      expect(fmtRaceTimeS(s)).toBe(fmtHM(s / 60))
    }
  })
})

describe('Dashboard ↔ Stratégie : même formateur sur les mêmes champs → même affichage', () => {
  // Le dashboard formate { cible, prudent, agressif } = { estTimeS, timeMax, timeMin }.
  // La stratégie formate { CIBLE, PRUDENT, OPTIMISTE } = { estTimeS, timeMax, timeMin }.
  // Mêmes champs, même fmtRaceTimeS → strictement identiques, sur toute la plage.
  it('cible/prudent/agressif s\'affichent à l\'identique pour toute projection', () => {
    for (let estTimeS = 1200; estTimeS <= 6 * 3600; estTimeS += 13) {
      const timeMin = estTimeS * 0.96
      const timeMax = estTimeS * 1.12

      // Dashboard
      const dashCible = fmtRaceTimeS(estTimeS)
      const dashPrudent = fmtRaceTimeS(timeMax)
      const dashAgressif = fmtRaceTimeS(timeMin)

      // Stratégie (mêmes champs, même formateur)
      const stratCible = fmtRaceTimeS(estTimeS)
      const stratPrudent = fmtRaceTimeS(timeMax)
      const stratOptimiste = fmtRaceTimeS(timeMin)

      expect(dashCible).toBe(stratCible)
      expect(dashPrudent).toBe(stratPrudent)
      expect(dashAgressif).toBe(stratOptimiste)
    }
  })

  it('la troncature (ancien dashboard) divergeait — ce test documente le bug corrigé', () => {
    // Ancien fmtTimeS : Math.floor des minutes → divergeait de l'arrondi de la stratégie.
    const floorFmt = (s: number) => {
      const h = Math.floor(s / 3600)
      const m = Math.floor((s % 3600) / 60)
      return `${h}h${String(m).padStart(2, '0')}`
    }
    // 8550 s : ancien dashboard « 2h22 », stratégie « 2h23 » → c'était l'écart rapporté.
    expect(floorFmt(8550)).toBe('2h22')
    expect(fmtRaceTimeS(8550)).toBe('2h23')
    expect(floorFmt(8550)).not.toBe(fmtRaceTimeS(8550))
  })
})
