// Branchement du MODÈLE DE MARCHE dans le moteur : garanties non négociables.
//
// Ce fichier ne teste pas « ça marche », il verrouille les propriétés qui rendent le
// branchement SÛR. La plus importante est la première : là où l'athlète ne marche pas,
// la projection doit être strictement identique à ce qu'elle était avant. Un modèle qui
// se déclenche partout serait impossible à valider au banc — on ne saurait jamais si un
// écart vient du modèle ou d'un effet de bord.

import { describe, it, expect } from 'vitest'
import {
  isRegimeSplitUsable,
  scaleRegimes,
  REGIME_MIN_CLASSIFIED_SECONDS,
  type BucketRegimes,
} from '../src/lib/runnerProfile'
import { blendedSectionTimeS, walkFractionAtGrade } from '../src/lib/walkRegime'
import type { GradeBinStats } from '../src/lib/walkTransition'

function regimes(over: Partial<BucketRegimes> = {}): BucketRegimes {
  return {
    walkFraction: 0.3,
    classifiedSeconds: 3600,
    walk: { totalSeconds: 1080, avgSpeedKmH: 4.2, vamMH: 800, avgCadence: 55, totalDistanceM: 1260, altGainM: 240 },
    run: { totalSeconds: 2520, avgSpeedKmH: 8.4, vamMH: 1100, avgCadence: 82, totalDistanceM: 5880, altGainM: 770 },
    ...over,
  }
}

function bin(gradeMinPct: number, walkFraction: number, seconds = 600): GradeBinStats {
  return {
    gradeMinPct, seconds, walkFraction,
    meanCadence: 70, meanSpeedKmH: 6, meanVamMH: 900, sampleCount: 50,
  } as GradeBinStats
}

describe('modèle de marche — sûreté du branchement', () => {
  it('une part de marche nulle laisse le temps STRICTEMENT inchangé', () => {
    // La garantie qui rend le modèle activable partout : un coureur qui ne marche jamais
    // à cette pente doit obtenir exactement sa projection d'avant, à la seconde près.
    const runOnly = blendedSectionTimeS({
      distanceM: 1000, climbM: 120,
      runSpeedKmH: 8.4, walkVamMH: 800, walkSpeedKmH: 4.2, walkFraction: 0,
    })
    expect(runOnly).toBeCloseTo(1000 / (8.4 / 3.6), 9)
  })

  it('le temps de course fourni par l’appelant prime sur la vitesse au sol', () => {
    // En montée, le moteur mélange VAM et vitesse : lui imposer une vitesse unique
    // perdrait cette finesse. On vérifie que son temps est bien celui retenu.
    const t = blendedSectionTimeS({
      distanceM: 1000, climbM: 200,
      runSpeedKmH: 8.4, runTimeS: 900,
      walkVamMH: 800, walkSpeedKmH: 4.2, walkFraction: 0,
    })
    expect(t).toBe(900)
  })

  it('marcher ralentit : plus la part de marche est grande, plus le temps est long', () => {
    const at = (w: number) => blendedSectionTimeS({
      distanceM: 1000, climbM: 200,
      runSpeedKmH: 8.4, walkVamMH: 800, walkSpeedKmH: 4.2, walkFraction: w,
    })!
    expect(at(0.25)).toBeGreaterThan(at(0))
    expect(at(0.5)).toBeGreaterThan(at(0.25))
    expect(at(1)).toBeGreaterThan(at(0.5))
  })

  it('en marche, la contrainte la plus lente gagne — jamais la moyenne des deux', () => {
    // Section douce : marcher à 800 m/h de VAM sur 40 m de D+ donnerait 180 s, soit
    // 20 km/h au sol. Absurde — c'est la vitesse au sol qui doit borner.
    const t = blendedSectionTimeS({
      distanceM: 1000, climbM: 40,
      runSpeedKmH: 8.4, walkVamMH: 800, walkSpeedKmH: 4.2, walkFraction: 1,
    })!
    expect(t).toBeCloseTo(1000 / (4.2 / 3.6), 6) // borné par le sol, pas par la VAM
  })

  it('une section raide est bornée par la VAM de marche, pas par la vitesse au sol', () => {
    const t = blendedSectionTimeS({
      distanceM: 1000, climbM: 300,
      runSpeedKmH: 8.4, walkVamMH: 800, walkSpeedKmH: 4.2, walkFraction: 1,
    })!
    expect(t).toBeCloseTo((300 / 800) * 3600, 6)
  })
})

describe('modèle de marche — garde-fous de données', () => {
  it('refuse un seau sans découpage de régime', () => {
    expect(isRegimeSplitUsable(undefined, 3600)).toBe(false)
  })

  it('refuse un découpage assis sur trop peu de temps classé', () => {
    const r = regimes({ classifiedSeconds: REGIME_MIN_CLASSIFIED_SECONDS - 1 })
    expect(isRegimeSplitUsable(r, 3600)).toBe(false)
  })

  it('refuse une couverture de cadence trop faible pour être représentative', () => {
    // 600 s classées sur 6000 s de seau : la fraction mesurée sur 10 % du temps ne dit
    // rien des 90 % restants.
    expect(isRegimeSplitUsable(regimes({ classifiedSeconds: 600 }), 6000)).toBe(false)
  })

  it('accepte un découpage suffisamment étayé', () => {
    expect(isRegimeSplitUsable(regimes(), 5000)).toBe(true)
  })
})

describe('modèle de marche — recalage à l’effort de course', () => {
  it('accélère les deux régimes, et NE touche PAS la part de marche', () => {
    // Courir plus fort le jour J ne change pas la pente à laquelle on bascule en marche :
    // le supposer reviendrait à inventer une donnée qu'on n'a pas mesurée.
    const scaled = scaleRegimes(regimes(), 1.1)
    expect(scaled.run!.avgSpeedKmH).toBeCloseTo(8.4 * 1.1, 9)
    expect(scaled.walk!.vamMH).toBeCloseTo(800 * 1.1, 9)
    expect(scaled.walkFraction).toBe(0.3)
    expect(scaled.classifiedSeconds).toBe(3600)
  })

  it('un facteur neutre rend l’objet inchangé', () => {
    const r = regimes()
    expect(scaleRegimes(r, 1)).toBe(r)
  })
})

describe('courbe de marche — lecture à la pente réelle de la section', () => {
  it('distingue deux pentes que le seau « montée raide » confondait', () => {
    // Le seau couvre tout ce qui dépasse 12 %, sans limite haute. La courbe fine, elle,
    // sait qu'on ne marche pas pareil à 13 % et à 28 % — c'est tout l'apport.
    const bins = [bin(10, 0.10), bin(15, 0.35), bin(20, 0.60), bin(25, 0.85)]
    const at13 = walkFractionAtGrade(bins, 13)!
    const at28 = walkFractionAtGrade(bins, 28)!
    expect(at28).toBeGreaterThan(at13)
  })

  it('ne dépend d’aucun seuil de pente : un athlète qui ne marche jamais reste à zéro', () => {
    // La marche est un RÉGIME, pas une pente. Chez un coureur qui court tout, la courbe
    // vaut zéro partout — y compris en terrain très raide — et le moteur ne le ralentit pas.
    const bins = [bin(10, 0), bin(15, 0), bin(20, 0), bin(25, 0)]
    for (const g of [5, 12, 18, 30, 45]) {
      expect(walkFractionAtGrade(bins, g)).toBe(0)
    }
  })

  it('ne s’appuie pas sur un intervalle famélique', () => {
    // Trois secondes de mesure donneraient une part de marche tirée au hasard.
    const bins = [bin(10, 0.1, 600), bin(25, 0.99, 3)]
    expect(walkFractionAtGrade(bins, 25)).toBe(0.1) // l'intervalle à 3 s est ignoré
  })
})
