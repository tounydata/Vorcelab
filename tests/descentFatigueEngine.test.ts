// Fatigue de descente APPRISE par coureur : garanties.
//
// Le point central de ce fichier est le premier test. Sur l'ensemble des athlètes, la
// perte de vitesse après 1000 m de D− n'est que de 5 % — mais un athlète a décrit
// l'inverse : « des fois les quadriceps sont morts et je n'arrivais plus à descendre
// fort ». Les deux sont vrais, et c'est exactement ce qu'une moyenne détruit. Le modèle
// doit donc rendre des résultats DIFFÉRENTS pour deux coureurs différents, et ne rien
// appliquer du tout quand il n'a pas mesuré.

import { describe, it, expect } from 'vitest'
import {
  descentFatigueFactor,
  hasUsableDescentFatigue,
  DESCENT_FATIGUE_MIN_BIN_SECONDS,
  DESCENT_FATIGUE_MAX_FACTOR,
} from '../src/lib/descentFatigue'
import type { DescentFatigueBin } from '../src/lib/walkTransition'

function bin(
  cumulativeLossMinM: number,
  speedRatioToFresh: number | null,
  seconds = 1800,
): DescentFatigueBin {
  return {
    cumulativeLossMinM, seconds, speedRatioToFresh,
    meanSpeedKmH: 12 * (speedRatioToFresh ?? 1), meanGradePct: 12,
  }
}

/** Coureur qui « déroule » : la vitesse tient malgré le D− encaissé. */
const rouleur = [bin(0, 1), bin(250, 0.99), bin(500, 0.98), bin(750, 0.97), bin(1000, 0.96)]
/** Coureur dont les quadriceps lâchent : la vitesse s'effondre. */
const quadsMorts = [bin(0, 1), bin(250, 0.93), bin(500, 0.86), bin(750, 0.80), bin(1000, 0.75)]

describe('fatigue de descente — deux coureurs, deux verdicts', () => {
  it('ne rend PAS le même ralentissement pour deux profils opposés', () => {
    const a = descentFatigueFactor(rouleur, 900)
    const b = descentFatigueFactor(quadsMorts, 900)
    expect(b).toBeGreaterThan(a)
    expect(b - a).toBeGreaterThan(0.1) // l'écart est net, pas cosmétique
  })

  it('celui qui déroule est à peine ralenti', () => {
    expect(descentFatigueFactor(rouleur, 900)).toBeLessThan(1.06)
  })

  it('celui dont les quadriceps lâchent est nettement ralenti', () => {
    expect(descentFatigueFactor(quadsMorts, 900)).toBeGreaterThan(1.15)
  })

  it('le ralentissement croît avec le D− déjà encaissé', () => {
    const f = (d: number) => descentFatigueFactor(quadsMorts, d)
    expect(f(600)).toBeGreaterThan(f(200))
    expect(f(1000)).toBeGreaterThan(f(600))
  })
})

describe('fatigue de descente — refus de deviner', () => {
  it('sans courbe, aucun effet', () => {
    expect(descentFatigueFactor(undefined, 1500)).toBe(1)
    expect(descentFatigueFactor([], 1500)).toBe(1)
  })

  it('une seule tranche exploitable ne décrit aucune évolution', () => {
    expect(descentFatigueFactor([bin(0, 1)], 900)).toBe(1)
  })

  it('les tranches trop courtes sont écartées', () => {
    const maigre = [
      bin(0, 1, DESCENT_FATIGUE_MIN_BIN_SECONDS - 1),
      bin(250, 0.5, DESCENT_FATIGUE_MIN_BIN_SECONDS - 1),
    ]
    expect(descentFatigueFactor(maigre, 900)).toBe(1)
  })

  it('au départ, rien n’est encore encaissé : aucun effet', () => {
    expect(descentFatigueFactor(quadsMorts, 0)).toBe(1)
  })
})

describe('fatigue de descente — bornes', () => {
  it('n’extrapole pas au-delà du D− réellement mesuré', () => {
    // 5000 m de D− dépasse largement l'historique : on tient la dernière valeur mesurée
    // au lieu de prolonger la pente dans le vide.
    const auBout = descentFatigueFactor(quadsMorts, 1200)
    const bienAuDela = descentFatigueFactor(quadsMorts, 5000)
    expect(bienAuDela).toBeCloseTo(auBout, 6)
  })

  it('n’accélère JAMAIS personne, même mesuré plus rapide en fin de course', () => {
    // Un athlète parti prudemment finit « plus vite qu'à jambes fraîches ». C'est une
    // gestion d'allure, pas un gain de fraîcheur : l'accélérer sur cette base reviendrait
    // à projeter qu'il ira plus vite parce qu'il est plus fatigué.
    const partiPrudent = [bin(0, 1), bin(250, 1.05), bin(500, 1.12), bin(750, 1.15)]
    expect(descentFatigueFactor(partiPrudent, 700)).toBe(1)
  })

  it('plafonne un effondrement invraisemblable plutôt que de le propager', () => {
    const aberrant = [bin(0, 1), bin(250, 0.2), bin(500, 0.1)]
    expect(descentFatigueFactor(aberrant, 600)).toBe(DESCENT_FATIGUE_MAX_FACTOR)
  })
})

describe('fatigue de descente — lisibilité pour l’interface', () => {
  it('distingue « pas de donnée » de « ce coureur ne perd rien »', () => {
    // Les deux rendent un facteur de 1 : sans ce drapeau, l'interface ne pourrait pas
    // faire la différence entre « mesuré, et il tient » et « on ne sait pas encore ».
    expect(hasUsableDescentFatigue(undefined)).toBe(false)
    expect(hasUsableDescentFatigue([bin(0, 1)])).toBe(false)
    expect(hasUsableDescentFatigue(rouleur)).toBe(true)
    expect(descentFatigueFactor(rouleur, 100)).toBe(1)
  })
})
