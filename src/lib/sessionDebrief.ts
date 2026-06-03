// Débrief de séance — récap « façon Strava » 100 % local et déterministe.
// Compare la séance aux autres sorties de la même famille (course, vélo…) sur une
// fenêtre glissante, en tire une phrase d'impact d'entraînement et un mini conseil.
// Aucune IA externe : l'API Strava interdit l'envoi des données à un fournisseur d'IA
// (cf. README / ADR-001). On compose des fonctions d'analyse existantes + des stats.

import { classifySport, computeActivityLoad, type ActivityForLoad, type FamilyKey } from './trainingLoad'
import { classifySession } from './sessionQuality'

export interface DebriefActivity {
  id?: string
  distance: number
  total_elevation_gain?: number | null
  moving_time: number
  average_heartrate?: number | null
  average_speed?: number | null
  type?: string | null
  sport_type?: string | null
  start_date: string
}

export interface SessionDebrief {
  /** Titre court et parlant — type de séance + fait saillant. */
  headline: string
  /** 1 à 3 puces « cette séance vs tes autres sorties ». */
  comparisons: string[]
  /** Phrase concrète sur l'impact d'entraînement (charge vs habitude). */
  impact: string
  /** Mini conseil / débrief (récup, enchaînement…), ou null. */
  tip: string | null
  /** Nb de séances comparables retenues (transparence sur la fiabilité). */
  sampleSize: number
}

const FAMILY_NOUN: Record<FamilyKey, string> = {
  pedestre: 'course', velo: 'sortie vélo', aqua: 'séance', renfo: 'séance',
  montagne: 'sortie', cardio: 'séance',
}

// Rang d'une valeur (1 = plus grand) parmi un ensemble, la séance courante incluse.
function rankDesc(value: number, others: number[]): { rank: number; total: number } {
  const total = others.length + 1
  const above = others.filter((v) => v > value).length
  return { rank: above + 1, total }
}

// Ordinal français court : 1 → « la plus », 2 → « 2e plus », etc.
function ordinalSuffix(rank: number): string {
  return rank === 1 ? 'la plus' : `la ${rank}e plus`
}

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0
}

/**
 * Construit le débrief d'une séance par rapport à son historique.
 * @param current   séance analysée
 * @param history   sorties récentes (toutes familles), idéalement ~90 j
 * @param fcMax     FC max individuelle (pour la charge)
 * @param windowDays fenêtre de comparaison (défaut 90 j avant la séance)
 */
export function buildSessionDebrief(
  current: DebriefActivity,
  history: DebriefActivity[],
  fcMax?: number | null,
  windowDays = 90,
): SessionDebrief {
  const family = classifySport(current.type, current.sport_type).family
  const noun = FAMILY_NOUN[family]
  const curDate = new Date(current.start_date).getTime()
  const windowMs = windowDays * 86_400_000

  // Pairs comparables : même famille, dans la fenêtre, strictement avant la séance,
  // hors la séance elle-même, et assez longues pour être pertinentes (≥ 10 min).
  const peers = history.filter((a) => {
    if (current.id && a.id && a.id === current.id) return false
    if (classifySport(a.type, a.sport_type).family !== family) return false
    const t = new Date(a.start_date).getTime()
    if (!(t < curDate && curDate - t <= windowMs)) return false
    return (a.moving_time || 0) >= 600
  })

  const toLoad = (a: DebriefActivity): ActivityForLoad => ({
    moving_time: a.moving_time, average_heartrate: a.average_heartrate,
    sport_type: a.sport_type, type: a.type, distance: a.distance,
    total_elevation_gain: a.total_elevation_gain, start_date: a.start_date,
  })

  const curLoad = computeActivityLoad(toLoad(current), fcMax)
  const sessionType = classifySession(current, fcMax)
  const distKm = current.distance / 1000
  const dplus = Math.round(current.total_elevation_gain ?? 0)

  const comparisons: string[] = []
  let headlineFact = ''

  if (peers.length >= 3) {
    const dRank = rankDesc(current.distance, peers.map((p) => p.distance))
    const eRank = rankDesc(dplus, peers.map((p) => Math.round(p.total_elevation_gain ?? 0)))
    const lRank = rankDesc(curLoad, peers.map((p) => computeActivityLoad(toLoad(p), fcMax)))

    // Distance : on met en avant si c'est un sommet (top 3) du classement.
    if (dRank.rank <= 3) {
      comparisons.push(`Distance : ${ordinalSuffix(dRank.rank)} longue ${noun} sur ${windowDays} j (${distKm.toFixed(1)} km).`)
      if (dRank.rank === 1) headlineFact = `ta plus longue ${noun} sur ${windowDays} j`
    }
    // Dénivelé : pertinent en montagne/trail, mis en avant si notable.
    if (dplus >= 300 && eRank.rank <= 3) {
      comparisons.push(`Dénivelé : ${ordinalSuffix(eRank.rank)} grimpante sur ${windowDays} j (D+ ${dplus} m).`)
      if (!headlineFact && eRank.rank === 1) headlineFact = `ton plus gros dénivelé sur ${windowDays} j`
    }
    // Effort (charge TRIMP) : intègre intensité + terrain — le plus honnête cross-terrain.
    if (lRank.rank <= 3) {
      comparisons.push(`Effort : ${ordinalSuffix(lRank.rank)} exigeante sur ${windowDays} j (charge ${curLoad}).`)
      if (!headlineFact && lRank.rank === 1) headlineFact = `ta séance la plus exigeante sur ${windowDays} j`
    } else {
      const harderPct = pct(lRank.rank - 1, lRank.total - 1)
      comparisons.push(`Effort plus modéré que ${100 - harderPct}% de tes ${windowDays} derniers jours.`)
    }

    // Bonus allure : seulement sur terrain roulant (D+/km faible) pour rester honnête.
    const dpKm = distKm > 0 ? dplus / distKm : 0
    if (family === 'pedestre' && dpKm < 15 && current.average_speed) {
      const flatPeers = peers.filter((p) => {
        const pk = p.distance / 1000
        return p.average_speed && pk > 0 && (Math.round(p.total_elevation_gain ?? 0) / pk) < 15
      })
      if (flatPeers.length >= 3) {
        const slower = flatPeers.filter((p) => (p.average_speed ?? 0) < (current.average_speed ?? 0)).length
        comparisons.push(`Allure : plus rapide que ${pct(slower, flatPeers.length)}% de tes courses sur plat.`)
      }
    }
  } else if (peers.length > 0) {
    comparisons.push(`Comparaison limitée : seulement ${peers.length} sortie${peers.length > 1 ? 's' : ''} similaire${peers.length > 1 ? 's' : ''} récente${peers.length > 1 ? 's' : ''}.`)
  }

  // ── Impact d'entraînement : charge vs charge médiane des pairs ──
  let impact: string
  if (peers.length >= 3) {
    const loads = peers.map((p) => computeActivityLoad(toLoad(p), fcMax)).sort((a, b) => a - b)
    const median = loads[Math.floor(loads.length / 2)] || 1
    const deltaPct = median > 0 ? Math.round(((curLoad - median) / median) * 100) : 0
    if (deltaPct >= 40)
      impact = `Charge ${curLoad} — ${deltaPct}% au-dessus de ta moyenne : séance structurante qui fait progresser le fond.`
    else if (deltaPct <= -30)
      impact = `Charge ${curLoad} — séance légère (${Math.abs(deltaPct)}% sous ta moyenne) : entretien sans creuser la fatigue.`
    else
      impact = `Charge ${curLoad} — dans ta moyenne habituelle : brique de fond régulière.`
  } else {
    impact = `Charge ${curLoad} (durée × intensité × dénivelé) — ${sessionType}.`
  }

  // ── Mini conseil / débrief selon le type et l'effort ──
  let tip: string | null
  const isHard = peers.length >= 3
    ? rankDesc(curLoad, peers.map((p) => computeActivityLoad(toLoad(p), fcMax))).rank <= 2
    : curLoad > 250
  if (sessionType === 'effort maximal' || sessionType === 'fractionné probable')
    tip = 'Séance qualitative : 1 à 2 jours faciles avant la prochaine intensité.'
  else if (sessionType === 'tempo / seuil')
    tip = 'Bon stimulus au seuil — laisse la récup faire son travail avant de réenchaîner du dur.'
  else if (isHard)
    tip = 'Grosse séance : prévois de la récup (sommeil, easy) pour bien l’assimiler.'
  else if (sessionType.startsWith('récupération') || sessionType.includes('récup'))
    tip = 'Séance de récup bien dosée — c’est ce qui permet d’encaisser les grosses charges.'
  else
    tip = 'Séance d’endurance solide — la régularité de ces sorties construit ta base.'

  // ── Titre ──
  const typeCap = sessionType.charAt(0).toUpperCase() + sessionType.slice(1)
  const headline = headlineFact ? `${typeCap} · ${headlineFact}` : typeCap

  return { headline, comparisons, impact, tip, sampleSize: peers.length }
}
