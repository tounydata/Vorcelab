// Débrief de course : à partir de la projection et des streams de l'activité réelle,
// produit une analyse de coach — verdict + note d'exécution, courbe allure/profil,
// pacing en 3 actes, dérive cardiaque, bilan terrain, banc d'essai de la projection,
// enseignements, et ce que la course apprend au profil. Calcul PUR (testable).
import type { ProjectionResult } from './computeRaceProjection'
import type { StreamData } from './streams'
import { compareProjectionToActual, type SectionCompare } from './raceComparison'

// Étiquette d'arrêt posée par le coureur (avec ou sans pause de la montre).
export type IncidentLabel = 'chute' | 'crampe' | 'ravito' | 'hydratation' | 'douleur' | 'autre'
export interface RaceAnnotation { km: number; label: IncidentLabel; note?: string }

export const INCIDENTS: Record<IncidentLabel, { fr: string; color: string }> = {
  chute: { fr: 'Chute', color: 'var(--vl-status-over, #d1583a)' },
  crampe: { fr: 'Crampe', color: 'var(--vl-ember)' },
  ravito: { fr: 'Ravito', color: 'var(--vl-growth)' },
  hydratation: { fr: 'Hydratation', color: '#3B82F6' },
  douleur: { fr: 'Douleur', color: 'var(--vl-amber)' },
  autre: { fr: 'Autre', color: 'var(--vl-text-2)' },
}

export interface DebriefPoint {
  km: number
  alt: number | null
  projPaceS: number | null    // allure projetée (s/km) au km
  actualPaceS: number | null  // allure réelle (s/km) sur le pas
  ahead: boolean              // réel plus rapide que projeté sur ce pas
}

export interface ThirdSplit {
  label: string
  startKm: number
  endKm: number
  actualS: number
  projS: number
  actualPaceS: number
  deltaS: number
}

export interface TerrainVerdict {
  kind: 'climb' | 'descent_tech' | 'descent'
  label: string
  startKm: number
  endKm: number
  grade: number
  deltaS: number               // réel − projeté
  actualVamMH: number | null   // VAM réelle (montées)
  projVamMH: number | null
  outcome: 'better' | 'worse' | 'onplan'
  note: string
}

export interface DebriefTakeaway {
  text: string
  tone: 'good' | 'work' | 'info'
}

export interface RaceDebrief {
  // ── Résultat & exécution ──
  projTotalS: number
  actualTotalS: number
  deltaS: number
  deltaPct: number
  accuracyPct: number          // 100 − |écart %|, borné [0,100]
  executionScore: number       // 0..100 — qualité d'exécution (≠ chrono)
  executionLabel: string
  verdict: string

  // ── Courbe allure vs profil ──
  points: DebriefPoint[]
  altMin: number
  altMax: number
  paceLoS: number              // borne d'allure rapide (haut du graphe)
  paceHiS: number              // borne d'allure lente (bas du graphe)

  // ── Pacing ──
  thirds: ThirdSplit[]
  firstHalfPaceS: number
  secondHalfPaceS: number
  splitPct: number             // (2e − 1re)/1re ×100 ; + = ralenti
  splitVerdict: string

  // ── Cardiaque ──
  hasHR: boolean
  avgHR: number | null
  maxHR: number | null
  decouplingPct: number | null // dérive aérobie (Pa:HR) H1→H2
  hrDriftPredicted: boolean
  zones: { z: number; pct: number }[] | null

  // ── Banc d'essai / sections ──
  sections: SectionCompare[]
  worst: SectionCompare | null
  best: SectionCompare | null

  // ── Terrain ──
  terrain: TerrainVerdict[]

  // ── Enseignements & profil ──
  takeaways: DebriefTakeaway[]
  raceVamMH: number | null     // VAM globale de montée sur la course

  // ── Arrêts (crampes, longs ravitos…) : détectés quand la distance stagne ──
  stops: { startKm: number; durationS: number; isRavito: boolean }[]
  stopCount: number
  stoppedS: number             // temps total à l'arrêt
  movingS: number              // temps en mouvement (total − arrêts)
  ravitoStoppedS: number       // temps d'arrêt sur un ravito connu (prévu)
  unplannedStoppedS: number    // temps d'arrêt subi (hors ravito : crampes, chute…)
}

// ── Helpers d'interpolation sur le profil projeté ─────────────────────────────
function altAtKm(km: number, samples: { d: number; alt: number | null }[]): number | null {
  const pts = samples.filter((s): s is { d: number; alt: number } => s.alt != null)
  if (!pts.length) return null
  if (km <= pts[0].d) return pts[0].alt
  for (let i = 1; i < pts.length; i++) {
    if (km <= pts[i].d) {
      const a = pts[i - 1], b = pts[i]
      const f = (km - a.d) / Math.max(1e-6, b.d - a.d)
      return a.alt + (b.alt - a.alt) * f
    }
  }
  return pts[pts.length - 1].alt
}

function projPaceAtKm(km: number, proj: ProjectionResult): number | null {
  for (let i = 0; i < proj.sections.length; i++) {
    const s = proj.sections[i]
    if (km >= s.startKm && km <= s.endKm) {
      const span = Math.max(0.01, s.endKm - s.startKm)
      return (proj.sectionTimes[i] ?? 0) / span
    }
  }
  return null
}

function pct(values: number[], p: number): number {
  if (!values.length) return 0
  const a = [...values].sort((x, y) => x - y)
  const idx = Math.min(a.length - 1, Math.max(0, Math.round((p / 100) * (a.length - 1))))
  return a[idx]
}

/** Interpolateur temps réel (s écoulées) ↔ distance (km) depuis les streams. */
function makeTimeAtKm(dist: number[], time: number[]): (km: number) => number {
  const t0 = time[0]
  const total = time[time.length - 1] - t0
  const end = dist[dist.length - 1]
  return (km: number): number => {
    const target = km * 1000
    if (target <= dist[0]) return 0
    if (target >= end) return total
    let lo = 0, hi = dist.length - 1
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1
      if (dist[mid] < target) lo = mid
      else hi = mid
    }
    const d0 = dist[lo], d1 = dist[hi]
    const f = d1 > d0 ? (target - d0) / (d1 - d0) : 0
    return (time[lo] + (time[hi] - time[lo]) * f) - t0
  }
}

// Détecte les arrêts : intervalles où la vitesse tombe sous le seuil (distance qui
// stagne pendant que le temps avance — pauses étirement, crampes, longs ravitos),
// d'une durée ≥ MIN. Seuil bas (0,5 m/s) pour ne pas confondre avec du power-hiking.
const STOP_SPEED = 0.5   // m/s
const MIN_STOP_S = 8
function detectStops(dist: number[], time: number[]): { startKm: number; durationS: number }[] {
  const stops: { startKm: number; durationS: number }[] = []
  let i = 1
  while (i < dist.length) {
    const dt = time[i] - time[i - 1]
    const speed = dt > 0 ? (dist[i] - dist[i - 1]) / dt : 1
    if (speed < STOP_SPEED) {
      const startD = dist[i - 1]
      let dur = 0
      while (i < dist.length) {
        const ddt = time[i] - time[i - 1]
        const sp = ddt > 0 ? (dist[i] - dist[i - 1]) / ddt : 1
        if (sp < STOP_SPEED) { dur += Math.max(0, ddt); i++ } else break
      }
      if (dur >= MIN_STOP_S) stops.push({ startKm: startD / 1000, durationS: dur })
    } else i++
  }
  return stops
}

function fmtDur(totalS: number): string {
  const t = Math.round(totalS)
  const m = Math.floor(t / 60), s = t % 60
  return m > 0 ? `${m} min ${String(s).padStart(2, '0')}` : `${s} s`
}

export function computeRaceDebrief(
  proj: ProjectionResult,
  stream: StreamData,
  fcMax?: number | null,
  meta?: { movingTimeS?: number | null; elapsedTimeS?: number | null; ravitoKms?: number[] },
): RaceDebrief | null {
  const dist = stream.distance?.data
  const time = stream.time?.data
  if (!dist || !time || dist.length < 2 || dist.length !== time.length) return null

  const cmp = compareProjectionToActual(proj, stream)
  if (!cmp) return null

  const timeAtKm = makeTimeAtKm(dist, time)
  const totalKm = Math.min(cmp.projDistKm, cmp.actualDistKm)

  // ── Arrêts → temps en mouvement. Toute l'analyse d'allure/pacing/exécution se base
  // sur le MOUVEMENT pour que les pauses (crampes, ravitos) ne plombent pas le verdict.
  // Le chrono « Résultat » reste, lui, le temps réel (arrêts inclus).
  // Un arrêt qui tombe sur un ravito CONNU (depuis la stratégie) est « prévu » : on le
  // reconnaît tout seul, le coureur n'a pas à le réétiqueter.
  const ravitoKms = meta?.ravitoKms ?? []
  const isRavitoKm = (km: number) => ravitoKms.some((r) => Math.abs(r - km) < 0.3)
  const stops = detectStops(dist, time).map((s) => ({ ...s, isRavito: isRavitoKm(s.startKm) }))
  const stoppedBeforeKm = (km: number) => stops.reduce((s, st) => (st.startKm < km ? s + st.durationS : s), 0)
  const movingAtKm = (km: number) => Math.max(0, timeAtKm(km) - stoppedBeforeKm(km))
  const detectedStoppedS = Math.max(0, cmp.actualTotalS - movingAtKm(totalKm))
  // Totaux : on privilégie les métadonnées Strava (temps écoulé / en mouvement) —
  // elles captent AUSSI les arrêts où la montre a été mise en pause (invisibles dans
  // le flux GPS). Le stream sert à localiser les arrêts ; le méta donne le vrai total.
  const realElapsedS = meta?.elapsedTimeS && meta.elapsedTimeS > 0 ? meta.elapsedTimeS : cmp.actualTotalS
  const realMovingS = meta?.movingTimeS && meta.movingTimeS > 0 ? meta.movingTimeS : (cmp.actualTotalS - detectedStoppedS)
  const stoppedS = Math.max(0, realElapsedS - realMovingS)
  const movingS = Math.max(0, realMovingS)
  const stopCount = stops.length
  // Part « ravito prévu » vs « subie » (crampes, chute) — le reste non localisé
  // (montre en pause) est compté comme subi.
  const ravitoStoppedS = stops.filter((s) => s.isRavito).reduce((a, s) => a + s.durationS, 0)
  const unplannedStoppedS = Math.max(0, stoppedS - ravitoStoppedS)

  // Sections recalées sur le temps en mouvement (deltas non faussés par les arrêts).
  const sections: SectionCompare[] = proj.sections.map((s, i) => {
    const projS = proj.sectionTimes[i] ?? 0
    const actualS = Math.max(0, movingAtKm(s.endKm) - movingAtKm(s.startKm))
    const km = Math.max(0.01, s.endKm - s.startKm)
    return { startKm: s.startKm, endKm: s.endKm, type: s.type, projS, actualS, deltaS: actualS - projS, projPaceS: projS / km, actualPaceS: actualS / km }
  })
  let worst: SectionCompare | null = null, best: SectionCompare | null = null
  for (const sec of sections) {
    if (!worst || sec.deltaS > worst.deltaS) worst = sec
    if (!best || sec.deltaS < best.deltaS) best = sec
  }

  // ── Courbe : échantillons réguliers (allure réelle/projetée + altitude) ──
  const nPts = Math.max(40, Math.min(200, Math.round(totalKm / 0.25)))
  const step = totalKm / nPts
  const points: DebriefPoint[] = []
  for (let i = 1; i <= nPts; i++) {
    const km = i * step
    const prevKm = (i - 1) * step
    const actualStepS = movingAtKm(km) - movingAtKm(prevKm)
    const actualPaceS = step > 0 ? actualStepS / step : null
    const projPaceS = projPaceAtKm(km, proj)
    points.push({
      km: +km.toFixed(3),
      alt: altAtKm(km, proj.samples),
      projPaceS,
      actualPaceS,
      ahead: projPaceS != null && actualPaceS != null ? actualPaceS <= projPaceS : false,
    })
  }

  const alts = points.map((p) => p.alt).filter((a): a is number => a != null)
  const altMin = alts.length ? Math.min(...alts) : 0
  const altMax = alts.length ? Math.max(...alts) : 0

  // Bornes d'allure robustes (on plafonne les pics de marche pour ne pas écraser le graphe)
  const paces = points.flatMap((p) => [p.actualPaceS, p.projPaceS].filter((x): x is number => x != null && x > 0))
  const paceLoS = paces.length ? Math.min(...paces) * 0.96 : 240
  const paceHiS = paces.length ? Math.min(Math.max(...paces), pct(paces, 92) * 1.18) : 600

  // ── Pacing : tiers + demi-course ──
  const third = totalKm / 3
  const mkThird = (label: string, a: number, b: number): ThirdSplit => {
    const actualS = Math.max(0, movingAtKm(b) - movingAtKm(a))
    let projS = 0
    for (let i = 0; i < proj.sections.length; i++) {
      const s = proj.sections[i]
      const lo = Math.max(a, s.startKm), hi = Math.min(b, s.endKm)
      if (hi > lo) projS += (proj.sectionTimes[i] ?? 0) * ((hi - lo) / Math.max(0.01, s.endKm - s.startKm))
    }
    const km = Math.max(0.01, b - a)
    return { label, startKm: a, endKm: b, actualS, projS, actualPaceS: actualS / km, deltaS: actualS - projS }
  }
  const thirds = [
    mkThird('Départ', 0, third),
    mkThird('Milieu', third, 2 * third),
    mkThird('Fin', 2 * third, totalKm),
  ]
  const half = totalKm / 2
  const firstHalfPaceS = (movingAtKm(half) - movingAtKm(0)) / Math.max(0.01, half)
  const secondHalfPaceS = (movingAtKm(totalKm) - movingAtKm(half)) / Math.max(0.01, totalKm - half)
  const splitPct = firstHalfPaceS > 0 ? ((secondHalfPaceS - firstHalfPaceS) / firstHalfPaceS) * 100 : 0
  const splitVerdict = splitPct <= -2
    ? 'Split négatif : tu as accéléré en 2ᵉ moitié — pacing maîtrisé.'
    : splitPct < 4
      ? 'Allure régulière du début à la fin.'
      : splitPct < 9
        ? `Léger ralentissement en 2ᵉ moitié (+${splitPct.toFixed(0)} %).`
        : `Ralentissement marqué en 2ᵉ moitié (+${splitPct.toFixed(0)} %) — départ trop ambitieux.`

  // ── Cardiaque : dérive aérobie (Pa:HR) H1→H2, FC moyenne/max, zones ──
  const hr = stream.heartrate?.data
  const hasHR = !!hr && hr.length === dist.length && hr.some((v) => v > 0)
  let avgHR: number | null = null, maxHR: number | null = null, decouplingPct: number | null = null
  let zones: { z: number; pct: number }[] | null = null
  if (hasHR && hr) {
    const valid = hr.filter((v) => v > 0)
    avgHR = Math.round(valid.reduce((s, v) => s + v, 0) / valid.length)
    maxHR = Math.max(...valid)

    // Demi-course par index de distance
    const halfM = (totalKm / 2) * 1000
    let mid = 0
    while (mid < dist.length - 1 && dist[mid] < halfM) mid++
    const eff = (lo: number, hi: number): number | null => {
      const dd = dist[hi] - dist[lo], dt = time[hi] - time[lo]
      if (dt <= 0) return null
      let hsum = 0, hn = 0
      for (let i = lo; i <= hi; i++) if (hr[i] > 0) { hsum += hr[i]; hn++ }
      if (!hn) return null
      const speed = dd / dt
      const meanHr = hsum / hn
      return meanHr > 0 ? speed / meanHr : null
    }
    const e1 = eff(0, mid), e2 = eff(mid, dist.length - 1)
    if (e1 != null && e2 != null && e1 > 0) decouplingPct = ((e1 - e2) / e1) * 100

    if (fcMax && fcMax > 0) {
      const buckets = [0, 0, 0, 0, 0]
      for (let i = 1; i < hr.length; i++) {
        if (hr[i] <= 0) continue
        const r = hr[i] / fcMax
        const z = r < 0.6 ? 0 : r < 0.7 ? 1 : r < 0.8 ? 2 : r < 0.9 ? 3 : 4
        buckets[z] += Math.max(0, time[i] - time[i - 1])
      }
      const tot = buckets.reduce((s, v) => s + v, 0)
      if (tot > 0) zones = buckets.map((v, i) => ({ z: i + 1, pct: Math.round((v / tot) * 100) }))
    }
  }
  const hrDriftPredicted = (proj.personalAdjustments ?? []).some((a) => /dérive cardiaque/i.test(a.label))

  // ── Terrain : montées & descentes clés, réel vs projeté ──
  const terrain: TerrainVerdict[] = []
  const climbs = sections.filter((s) => s.type === 'up')
    .map((s) => ({ s, dplus: proj.sections.find((p) => p.startKm === s.startKm)?.dplus ?? 0 }))
    .sort((a, b) => b.dplus - a.dplus).slice(0, 2)
  for (const { s, dplus } of climbs) {
    const projH = s.projS / 3600, actH = s.actualS / 3600
    const projVam = projH > 0 ? dplus / projH : null
    const actVam = actH > 0 ? dplus / actH : null
    const outcome = Math.abs(s.deltaS) < 0.08 * s.projS ? 'onplan' : s.deltaS > 0 ? 'worse' : 'better'
    terrain.push({
      kind: 'climb',
      label: `Montée km ${s.startKm.toFixed(1)}–${s.endKm.toFixed(1)}`,
      startKm: s.startKm, endKm: s.endKm, grade: 0, deltaS: s.deltaS,
      actualVamMH: actVam != null ? Math.round(actVam) : null,
      projVamMH: projVam != null ? Math.round(projVam) : null,
      outcome,
      note: outcome === 'onplan' ? 'Tenue comme prévu.'
        : outcome === 'better' ? `Mieux que prévu (${fmtDeltaShort(s.deltaS)}).`
          : `Coûteuse (${fmtDeltaShort(s.deltaS)}).`,
    })
  }
  const techDesc = proj.sections.map((p, i) => ({ p, c: sections[i] }))
    .filter(({ p }) => p.type === 'down' && p.technical)
    .sort((a, b) => (b.p.dminus) - (a.p.dminus)).slice(0, 1)
  for (const { p, c } of techDesc) {
    if (!c) continue
    const outcome = Math.abs(c.deltaS) < 0.08 * c.projS ? 'onplan' : c.deltaS > 0 ? 'worse' : 'better'
    terrain.push({
      kind: 'descent_tech',
      label: `Descente technique km ${p.startKm.toFixed(1)}–${p.endKm.toFixed(1)}`,
      startKm: p.startKm, endKm: p.endKm, grade: p.grade, deltaS: c.deltaS,
      actualVamMH: null, projVamMH: null, outcome,
      note: outcome === 'onplan' ? 'Freinage maîtrisé, comme anticipé.'
        : outcome === 'better' ? `Mieux négociée que prévu (${fmtDeltaShort(c.deltaS)}).`
          : `Poste de perte (${fmtDeltaShort(c.deltaS)}) — comme redouté.`,
    })
  }

  // VAM globale de montée sur la course (D+ total / temps total)
  const raceVamMH = movingS > 0 ? Math.round(proj.dplus / (movingS / 3600)) : null

  // ── Note d'exécution (0..100) : pacing + fidélité au plan + maîtrise de l'effort ──
  const splitScore = clamp(100 - Math.max(0, splitPct) * 4, 40, 100)
  const mape = sections.length
    ? sections.reduce((s, c) => s + (c.projS > 0 ? Math.abs(c.deltaS) / c.projS : 0), 0) / sections.length
    : 0
  const adherenceScore = clamp(100 - mape * 180, 40, 100)
  let executionScore: number
  if (decouplingPct != null) {
    const effortScore = clamp(100 - Math.max(0, decouplingPct) * 4, 40, 100)
    executionScore = Math.round(splitScore * 0.4 + adherenceScore * 0.35 + effortScore * 0.25)
  } else {
    executionScore = Math.round(splitScore * 0.55 + adherenceScore * 0.45)
  }
  const executionLabel = executionScore >= 85 ? 'Exemplaire'
    : executionScore >= 70 ? 'Solide'
      : executionScore >= 55 ? 'Correcte'
        : 'À travailler'

  // Précision : la projection prédit un temps EN COURSE (sans pauses) → on la compare
  // au temps en mouvement. Sans arrêt, movingS = temps réel → comportement inchangé.
  const movingDeltaPct = cmp.projTotalS > 0 ? ((movingS - cmp.projTotalS) / cmp.projTotalS) * 100 : 0
  const accuracyPct = clamp(100 - Math.abs(movingDeltaPct), 0, 100)

  // ── Verdict (phrase de coach) ──
  const fasterSlower = cmp.deltaS <= 0 ? 'plus rapide' : 'plus lent'
  let verdict: string
  if (stoppedS >= 45) {
    const head = stopCount > 0 ? `${stopCount} arrêt${stopCount > 1 ? 's' : ''}` : 'Des arrêts'
    const ravBit = ravitoStoppedS >= 30 ? `, dont ${fmtDur(ravitoStoppedS)} au ravito` : ''
    const cause = unplannedStoppedS >= 45 ? 'ravito, hydratation ou douleurs' : 'surtout du ravito prévu'
    verdict = `${head} (${fmtDur(stoppedS)}${ravBit}) — ${cause}. Hors arrêts, ${accuracyPct >= 95 ? 'la projection est quasi parfaite' : `exécution ${executionLabel.toLowerCase()}`}. L'analyse ci-dessous les exclut.`
  } else if (executionScore >= 80 && Math.abs(splitPct) < 5) {
    verdict = `Course bien gérée — allure tenue et effort maîtrisé, ${fmtDelta(cmp.deltaS)} (${fasterSlower}) que la projection.`
  } else if (splitPct >= 9) {
    verdict = `Départ trop ambitieux : tu as payé la facture en 2ᵉ moitié (+${splitPct.toFixed(0)} % d'allure).`
  } else if (decouplingPct != null && decouplingPct >= 10) {
    verdict = `L'effort a dérivé en fin de course (FC qui grimpe à allure égale) — endurance ou nutrition à renforcer.`
  } else {
    verdict = `Course ${fasterSlower === 'plus lent' ? 'en deçà' : 'au-dessus'} de la projection (${fmtDelta(cmp.deltaS)}), exécution ${executionLabel.toLowerCase()}.`
  }

  // ── Enseignements (priorisés, 2-3) ──
  const candidates: DebriefTakeaway[] = []
  if (unplannedStoppedS >= 45) {
    const crampLikely = splitPct >= 6 || terrain.some((t) => t.kind === 'descent_tech' && t.outcome === 'worse')
    candidates.push(crampLikely
      ? { tone: 'work', text: `Arrêts subis en fin de course / descente (${fmtDur(unplannedStoppedS)}, hors ravito) — souvent des crampes : renfo excentrique (mollets, descente) + hydratation et sodium.` }
      : { tone: 'work', text: `${fmtDur(unplannedStoppedS)} d'arrêts subis (hors ravito prévu) — soigne hydratation/sodium et anticipe pour limiter les pauses.` })
  }
  if (splitPct >= 8) candidates.push({ tone: 'work', text: `Pars plus prudent : ralentissement de ${splitPct.toFixed(0)} % en 2ᵉ moitié. Vise un négatif split.` })
  if (decouplingPct != null && decouplingPct >= 10) candidates.push({ tone: 'work', text: `Dérive cardiaque élevée (+${decouplingPct.toFixed(0)} %) — travaille l'endurance fondamentale et la nutrition en course.` })
  const worstUp = terrain.find((t) => t.kind === 'climb' && t.outcome === 'worse')
  if (worstUp) candidates.push({ tone: 'work', text: `Les montées t'ont coûté du temps — intègre des séances de côtes / renforcement.` })
  const worstTech = terrain.find((t) => t.kind === 'descent_tech' && t.outcome === 'worse')
  if (worstTech) candidates.push({ tone: 'work', text: `Les descentes techniques restent un poste de perte — programme des séances de descente.` })
  if (splitPct <= -2) candidates.push({ tone: 'good', text: `Split négatif maîtrisé — pacing exemplaire, continue comme ça.` })
  if (accuracyPct >= 97 && executionScore >= 75) candidates.push({ tone: 'good', text: `Course très bien gérée et conforme au plan — base solide pour viser plus haut.` })
  if (zones && zones[4] && zones[4].pct >= 40) candidates.push({ tone: 'info', text: `${zones[4].pct} % du temps en zone 5 (FC max) — effort très engagé, pense à la récupération.` })
  if (!candidates.length) candidates.push({ tone: 'info', text: `Course conforme à la projection. Lie d'autres courses pour affiner les conseils.` })
  const takeaways = candidates.slice(0, 3)

  return {
    projTotalS: cmp.projTotalS,
    actualTotalS: realElapsedS,
    deltaS: realElapsedS - cmp.projTotalS,
    deltaPct: cmp.projTotalS > 0 ? ((realElapsedS - cmp.projTotalS) / cmp.projTotalS) * 100 : 0,
    accuracyPct,
    executionScore,
    executionLabel,
    verdict,
    points,
    altMin,
    altMax,
    paceLoS,
    paceHiS,
    thirds,
    firstHalfPaceS,
    secondHalfPaceS,
    splitPct,
    splitVerdict,
    hasHR,
    avgHR,
    maxHR,
    decouplingPct,
    hrDriftPredicted,
    zones,
    sections,
    worst,
    best,
    terrain,
    takeaways,
    raceVamMH,
    stops,
    stopCount,
    stoppedS,
    movingS,
    ravitoStoppedS,
    unplannedStoppedS,
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}
function fmtDelta(deltaS: number): string {
  const t = Math.round(Math.abs(deltaS))
  const m = Math.floor(t / 60), s = t % 60
  const body = m > 0 ? `${m} min ${String(s).padStart(2, '0')}` : `${s} s`
  return `${deltaS >= 0 ? '+' : '−'}${body}`
}
function fmtDeltaShort(deltaS: number): string {
  const t = Math.round(Math.abs(deltaS))
  const m = Math.floor(t / 60), s = t % 60
  return `${deltaS >= 0 ? '+' : '−'}${m > 0 ? `${m}′${String(s).padStart(2, '0')}` : `${s}s`}`
}
