// Débrief de course : à partir de la projection et des streams de l'activité réelle,
// produit une analyse de coach — verdict + note d'exécution, courbe allure/profil,
// pacing en 3 actes, dérive cardiaque, bilan terrain, banc d'essai de la projection,
// enseignements, et ce que la course apprend au profil. Calcul PUR (testable).
import type { ProjectionResult } from './computeRaceProjection'
import type { StreamData } from './streams'
import { compareProjectionToActual, type SectionCompare } from './raceComparison'
import { minettiGradePenalty } from './gpxCore'
import { vamBand, VAM_BAND_LABEL } from './coach/sessionAnalysis'
import type { RacePreparation } from './racePreparation'
import type { RaceHeat } from './weather'

// Ré-export pour les consommateurs historiques (RaceResult) — source de vérité = sessionAnalysis.
export { VAM_BAND_LABEL }

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
  // Bande de niveau VAM (cf. knowledge T2) : élite ≥900 · bon ≥700 · correct ≥500 · faible <500.
  vamBand?: 'elite' | 'strong' | 'fair' | 'weak'
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
  decouplingPct: number | null // dérive aérobie (GAP:FC) H1→H2
  // true = découplage ajusté à la pente (course avec relief) ; sur terrain plat l'ajustement
  // est neutre. Cf. knowledge T4/T7 : le découplage allure:FC brut est ininterprétable en D±.
  decouplingGapAdjusted: boolean
  // Dérive « nette » : dérive mesurée MOINS la part attribuable à des facteurs externes
  // (chaleur, départ trop rapide). C'est ELLE qui reflète l'endurance réelle. Sans facteur
  // externe, adjustedDecouplingPct = decouplingPct.
  adjustedDecouplingPct: number | null
  // Facteurs qui gonflent la dérive sans qu'elle traduise un déficit d'endurance.
  driftConfounders: ('heat' | 'fast_start')[]
  // Température de l'air de la course (°C) si connue.
  tempC: number | null
  // Ressenti (apparent_temperature : humidité + vent + soleil) sur la 2ᵉ moitié (°C).
  feelsLikeC: number | null
  // État de préparation (charge d'entraînement AVANT la course) si évaluable.
  preparation: RacePreparation | null
  // Durabilité (knowledge T16) : chute d'efficacité GAP:FC entre 1er et dernier tiers (%).
  durabilityFadePct: number | null
  durabilityBand: 'solid' | 'moderate' | 'weak' | null
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
  // Charge excentrique de la descente (knowledge T14) : D− pondéré par la raideur (m éq.).
  eccLoadEq: number | null
  // Fade de descente : vitesse réelle en descente, 1er vs dernier tiers de course.
  descentFade: 'none' | 'moderate' | 'marked' | null

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

/** Pente (fraction, ex 0,08 = +8 %) au km donné, depuis le profil d'altitude projeté. */
function makeGradeAtKm(samples: { d: number; alt: number | null }[]): (km: number) => number {
  const pts = samples.filter((s): s is { d: number; alt: number } => s.alt != null)
  if (pts.length < 2) return () => 0
  const slope = (a: { d: number; alt: number }, b: { d: number; alt: number }): number => {
    const dm = (b.d - a.d) * 1000
    return dm > 0 ? (b.alt - a.alt) / dm : 0
  }
  return (km: number): number => {
    for (let i = 1; i < pts.length; i++) {
      if (km <= pts[i].d) return slope(pts[i - 1], pts[i])
    }
    return slope(pts[pts.length - 2], pts[pts.length - 1])
  }
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
  meta?: { movingTimeS?: number | null; elapsedTimeS?: number | null; ravitoKms?: number[]; annotations?: RaceAnnotation[]; tempC?: number | null; heat?: RaceHeat | null; preparation?: RacePreparation | null },
): RaceDebrief | null {
  const dist = stream.distance?.data
  const time = stream.time?.data
  if (!dist || !time || dist.length < 2 || dist.length !== time.length) return null

  const cmp = compareProjectionToActual(proj, stream)
  if (!cmp) return null

  const timeAtKm = makeTimeAtKm(dist, time)
  const gradeAtKm = makeGradeAtKm(proj.samples)
  // Relief significatif → on ajuste le découplage à la pente (sinon ajustement neutre).
  const courseHasRelief = (proj.dplus ?? 0) + (proj.dminus ?? 0) > 30
  const idxAtKm = (km: number): number => {
    const target = km * 1000
    if (target <= dist[0]) return 0
    if (target >= dist[dist.length - 1]) return dist.length - 1
    let lo = 0, hi = dist.length - 1
    while (lo + 1 < hi) { const m = (lo + hi) >> 1; if (dist[m] < target) lo = m; else hi = m }
    return hi
  }
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
  // Étiquettes posées par le coureur → elles PILOTENT le débrief (verdict, conseils,
  // part prévue vs subie). Un arrêt étiqueté l'emporte sur la détection auto.
  const annotations = meta?.annotations ?? []
  const annNear = (km: number) => annotations.find((a) => Math.abs(a.km - km) < 0.3)
  const EXPECTED = new Set<string>(['ravito', 'hydratation']) // arrêts « normaux »
  const effLabel = (s: { startKm: number; isRavito: boolean }): IncidentLabel | undefined =>
    annNear(s.startKm)?.label ?? (s.isRavito ? 'ravito' : undefined)
  // Part « prévue » (ravito/hydratation) vs « subie » (crampes, chute, douleur).
  const ravitoStoppedS = stops.filter((s) => effLabel(s) === 'ravito').reduce((a, s) => a + s.durationS, 0)
  const expectedStoppedS = stops.filter((s) => { const l = effLabel(s); return !!l && EXPECTED.has(l) }).reduce((a, s) => a + s.durationS, 0)
  const unplannedStoppedS = Math.max(0, stoppedS - expectedStoppedS)
  // Causes explicitement renseignées
  const hasCramp = annotations.some((a) => a.label === 'crampe')
  const hasFall = annotations.some((a) => a.label === 'chute')
  const hasPain = annotations.some((a) => a.label === 'douleur')

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
  let durabilityFadePct: number | null = null
  let durabilityBand: 'solid' | 'moderate' | 'weak' | null = null
  let zones: { z: number; pct: number }[] | null = null
  if (hasHR && hr) {
    const valid = hr.filter((v) => v > 0)
    avgHR = Math.round(valid.reduce((s, v) => s + v, 0) / valid.length)
    maxHR = Math.max(...valid)

    // Demi-course par index de distance
    const halfM = (totalKm / 2) * 1000
    let mid = 0
    while (mid < dist.length - 1 && dist[mid] < halfM) mid++
    // Efficacité GAP:FC sur un intervalle d'indices : on remplace la vitesse brute par une
    // distance AJUSTÉE À LA PENTE (Minetti) pour que le découplage reste interprétable en
    // terrain vallonné (cf. knowledge T4/T7). Sur du plat, l'ajustement est neutre (×1).
    const gapEff = (lo: number, hi: number): number | null => {
      const dt = time[hi] - time[lo]
      if (dt <= 0) return null
      let gapDist = 0, hsum = 0, hn = 0
      for (let i = lo + 1; i <= hi; i++) {
        const stepD = dist[i] - dist[i - 1]
        if (stepD <= 0) continue
        const midKm = (dist[i] + dist[i - 1]) / 2 / 1000
        gapDist += stepD * (1 + minettiGradePenalty(gradeAtKm(midKm)))
      }
      for (let i = lo; i <= hi; i++) if (hr[i] > 0) { hsum += hr[i]; hn++ }
      if (!hn || gapDist <= 0) return null
      const meanHr = hsum / hn
      return meanHr > 0 ? (gapDist / dt) / meanHr : null
    }
    const e1 = gapEff(0, mid), e2 = gapEff(mid, dist.length - 1)
    if (e1 != null && e2 != null && e1 > 0) decouplingPct = ((e1 - e2) / e1) * 100

    // Durabilité (knowledge T16) : efficacité GAP:FC du 1er vs dernier tiers de course.
    const third = totalKm / 3
    const efA = gapEff(0, idxAtKm(third)), efC = gapEff(idxAtKm(2 * third), dist.length - 1)
    if (efA != null && efC != null && efA > 0) {
      durabilityFadePct = ((efA - efC) / efA) * 100
      durabilityBand = durabilityFadePct <= 5 ? 'solid' : durabilityFadePct <= 10 ? 'moderate' : 'weak'
    }

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
  const decouplingGapAdjusted = decouplingPct != null && courseHasRelief

  // ── Dérive cardiaque : neutraliser les facteurs EXTERNES ──────────────────────
  // La dérive Pa:FC ne traduit un déficit d'endurance/nutrition que « toutes choses
  // égales par ailleurs ». Deux confondants majeurs la gonflent sans que la forme soit
  // en cause : (1) la CHALEUR (dérive cardiovasculaire thermorégulatrice — la FC monte à
  // allure égale ; seuil ~22 °C, cf. Ely 2007, réutilisé dans raceWeather) ; (2) un
  // DÉPART TROP RAPIDE (partir au-dessus du soutenable fait grimper la FC en 2ᵉ moitié).
  // On retire leur part estimée pour obtenir la dérive « nette » — celle qui compte pour
  // juger l'endurance — et on la signale au coureur au lieu de l'accabler à tort.
  const heat = meta?.heat ?? null
  const tempC = meta?.tempC != null && Number.isFinite(meta.tempC) ? meta.tempC : (heat?.avgTempC ?? null)
  // Ressenti (humidité + vent + soleil) de la 2ᵉ moitié : plus fidèle au stress
  // thermique que l'air seul, et calé sur le moment où la dérive apparaît.
  const feelsLikeC = heat?.secondHalfApparentC ?? heat?.avgApparentC ?? null
  const HEAT_T0 = 22
  // On alloue la part « chaleur » sur le RESSENTI quand on l'a (sinon l'air).
  const heatC = feelsLikeC ?? tempC
  const heatAllowancePct = heatC != null && heatC > HEAT_T0 ? Math.min(8, (heatC - HEAT_T0) * 0.7) : 0
  const fastStartAllowancePct = splitPct > 4 ? Math.min(5, (splitPct - 4) * 0.5) : 0
  let adjustedDecouplingPct: number | null = decouplingPct
  const driftConfounders: ('heat' | 'fast_start')[] = []
  if (decouplingPct != null) {
    adjustedDecouplingPct = Math.max(0, decouplingPct - heatAllowancePct - fastStartAllowancePct)
    // On ne « crédite » un confondant que si la dérive est réellement élevée ET que sa part
    // est significative (≥ 2 pts) — sinon rien à expliquer.
    if (decouplingPct >= 8) {
      if (heatAllowancePct >= 2) driftConfounders.push('heat')
      if (fastStartAllowancePct >= 2) driftConfounders.push('fast_start')
    }
  }
  // Dérive de référence pour NOTER l'effort/endurance : la dérive nette (hors confondants).
  const effortDriftPct = adjustedDecouplingPct

  // Préparation : une dérive/fade de fin de course chez un coureur arrivé SOUS-PRÉPARÉ
  // (mois creux) reflète un manque de fond récent, pas une faiblesse à cibler.
  const preparation = meta?.preparation ?? null
  const underprepared = preparation?.status === 'undertrained'

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
      vamBand: actVam != null ? vamBand(Math.round(actVam)) : undefined,
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

  // ── Charge excentrique & fade de descente (knowledge T14) ──
  // Charge excentrique = D− pondéré par la raideur (le freinage raide casse plus les jambes).
  const kEcc = (gradeAbs: number) => gradeAbs >= 0.12 ? 1.8 : gradeAbs >= 0.06 ? 1.0 : gradeAbs >= 0.02 ? 0.5 : 0
  let eccLoadEq: number | null = null
  let accEcc = 0, anyDown = false
  for (const s of proj.sections) {
    if (s.type === 'down' && s.dminus > 0) {
      anyDown = true
      const distM = Math.max(1, (s.endKm - s.startKm) * 1000)
      accEcc += s.dminus * kEcc(s.dminus / distM)
    }
  }
  if (anyDown) eccLoadEq = Math.round(accEcc)
  // Fade de descente : vitesse réelle en descente, 1er vs dernier tiers (descente « subie » en fin).
  let descentFade: 'none' | 'moderate' | 'marked' | null = null
  {
    const thirdKm = totalKm / 3
    const downSpeeds = (lo: number, hi: number): number[] =>
      proj.sections.map((s, i) => ({ s, c: sections[i] }))
        .filter(({ s }) => s.type === 'down' && s.dminus > 0 && (s.startKm + s.endKm) / 2 >= lo && (s.startKm + s.endKm) / 2 < hi)
        .map(({ s, c }) => (c.actualS > 0 ? (s.endKm - s.startKm) / (c.actualS / 3600) : null))
        .filter((v): v is number => v != null && v > 0)
    const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
    const first = downSpeeds(0, thirdKm), last = downSpeeds(2 * thirdKm, totalKm + 1e-6)
    if (first.length && last.length) {
      const v1 = avg(first), v3 = avg(last)
      const fade = v1 > 0 ? ((v1 - v3) / v1) * 100 : 0
      descentFade = fade > 10 ? 'marked' : fade > 5 ? 'moderate' : 'none'
    }
  }

  // ── Note d'exécution (0..100) : pacing + fidélité au plan + maîtrise de l'effort ──
  const splitScore = clamp(100 - Math.max(0, splitPct) * 4, 40, 100)
  const mape = sections.length
    ? sections.reduce((s, c) => s + (c.projS > 0 ? Math.abs(c.deltaS) / c.projS : 0), 0) / sections.length
    : 0
  const adherenceScore = clamp(100 - mape * 180, 40, 100)
  let executionScore: number
  if (decouplingPct != null) {
    // Note d'effort sur la dérive NETTE : la chaleur / un départ rapide ne doivent pas
    // faire chuter le score d'endurance (ce sont des facteurs externes, pas la forme).
    const effortScore = clamp(100 - Math.max(0, effortDriftPct ?? decouplingPct) * 4, 40, 100)
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
  const horsArrets = accuracyPct >= 95 ? 'la projection est quasi parfaite' : `exécution ${executionLabel.toLowerCase()}`
  let verdict: string
  if (hasCramp || hasFall || hasPain) {
    const bits: string[] = []
    if (hasCramp) bits.push('crampes')
    if (hasFall) bits.push('chute')
    if (hasPain) bits.push('douleur')
    const causes = bits.join(' + ')
    verdict = `${causes.charAt(0).toUpperCase()}${causes.slice(1)} en course${stoppedS >= 30 ? ` (${fmtDur(stoppedS)} d'arrêts)` : ''} — hors arrêts, ${horsArrets}.${hasCramp ? ' Endurance et sodium à travailler.' : hasFall ? ' Un incident, pas un déficit de forme.' : ''}`
  } else if (stoppedS >= 45) {
    const head = stopCount > 0 ? `${stopCount} arrêt${stopCount > 1 ? 's' : ''}` : 'Des arrêts'
    const ravBit = ravitoStoppedS >= 30 ? `, dont ${fmtDur(ravitoStoppedS)} au ravito` : ''
    const cause = unplannedStoppedS >= 45 ? 'ravito, hydratation ou douleurs' : 'surtout du ravito prévu'
    verdict = `${head} (${fmtDur(stoppedS)}${ravBit}) — ${cause}. Hors arrêts, ${accuracyPct >= 95 ? 'la projection est quasi parfaite' : `exécution ${executionLabel.toLowerCase()}`}. L'analyse ci-dessous les exclut.`
  } else if (underprepared && ((decouplingPct != null && decouplingPct >= 10) || durabilityBand === 'weak' || descentFade === 'marked')) {
    // Symptôme de fatigue de fin + arrivé sous-préparé → c'est le fond récent, pas une faiblesse.
    verdict = `Ta fin de course a lâché, mais tu l'abordais avec une préparation légère (charge ~${preparation!.loadRatioPct} % de ton habitude) — c'est le fond récent qui manquait, pas ta capacité d'endurance.`
  } else if (executionScore >= 80 && Math.abs(splitPct) < 5) {
    verdict = `Course bien gérée — allure tenue et effort maîtrisé, ${fmtDelta(cmp.deltaS)} (${fasterSlower}) que la projection.`
  } else if (splitPct >= 9) {
    verdict = `Départ trop ambitieux : tu as payé la facture en 2ᵉ moitié (+${splitPct.toFixed(0)} % d'allure).`
  } else if (decouplingPct != null && decouplingPct >= 10) {
    const dispHeatC = feelsLikeC ?? tempC
    if (driftConfounders.length && (adjustedDecouplingPct ?? decouplingPct) < 8) {
      verdict = `Ta FC a grimpé en fin de course, mais surtout à cause de ${driftConfounders.includes('heat') ? `la chaleur (${dispHeatC != null ? `${dispHeatC.toFixed(0)} °C` : 'conditions chaudes'})` : ''}${driftConfounders.length === 2 ? ' et ' : ''}${driftConfounders.includes('fast_start') ? 'un départ rapide' : ''} — hors ce contexte, ton endurance a tenu.`
    } else {
      verdict = `L'effort a dérivé en fin de course (FC qui grimpe à allure égale) — endurance ou nutrition à renforcer.`
    }
  } else {
    verdict = `Course ${fasterSlower === 'plus lent' ? 'en deçà' : 'au-dessus'} de la projection (${fmtDelta(cmp.deltaS)}), exécution ${executionLabel.toLowerCase()}.`
  }

  // ── Enseignements (priorisés, 2-3) ──
  const candidates: DebriefTakeaway[] = []
  // Causes étiquetées par le coureur → conseils CIBLÉS (priment sur la détection auto).
  if (hasCramp) candidates.push({ tone: 'work', text: `Crampes confirmées — renfo excentrique (mollets, descente) + hydratation et sodium ; teste ta stratégie nutrition à l'entraînement.` })
  if (hasFall) { const f = annotations.find((a) => a.label === 'chute')!; candidates.push({ tone: 'info', text: `Chute à km ${f.km.toFixed(1)} — un incident, pas un déficit de forme. Travaille l'aisance et la lecture de terrain en descente.` }) }
  if (hasPain) { const p = annotations.find((a) => a.label === 'douleur')!; candidates.push({ tone: 'work', text: `Douleur signalée (km ${p.km.toFixed(1)}) — surveille la récupération et consulte si elle persiste.` }) }
  // Repli auto UNIQUEMENT si aucune cause subie n'a été renseignée à la main.
  if (unplannedStoppedS >= 45 && !hasCramp && !hasFall && !hasPain) {
    const crampLikely = splitPct >= 6 || terrain.some((t) => t.kind === 'descent_tech' && t.outcome === 'worse')
    candidates.push(crampLikely
      ? { tone: 'work', text: `Arrêts subis en fin de course / descente (${fmtDur(unplannedStoppedS)}, hors ravito) — souvent des crampes : renfo excentrique (mollets, descente) + hydratation et sodium.` }
      : { tone: 'work', text: `${fmtDur(unplannedStoppedS)} d'arrêts subis (hors ravito prévu) — soigne hydratation/sodium et anticipe pour limiter les pauses.` })
  }
  // Contexte préparation (prioritaire) : recadre la dérive/durabilité comme un manque
  // de fond récent plutôt qu'une faiblesse à cibler.
  if (underprepared) candidates.push({ tone: 'info', text: `Tu abordais cette course avec une préparation légère : charge des 6 dernières semaines ~${preparation!.loadRatioPct} % de ton habitude${preparation!.runCount42 ? `, ${preparation!.runCount42} sortie${preparation!.runCount42 > 1 ? 's' : ''}` : ''}. La dérive et la fatigue de fin reflètent surtout ce manque de fond récent, pas une faiblesse structurelle — priorité : retrouver de la régularité (volume aérobie) avant de cibler une qualité.` })
  if (splitPct >= 8) candidates.push({ tone: 'work', text: `Pars plus prudent : ralentissement de ${splitPct.toFixed(0)} % en 2ᵉ moitié. Vise un négatif split.` })
  const heatLabel = () => {
    if (heatC == null) return 'la chaleur'
    const felt = heat?.source === 'api' && feelsLikeC != null
    return `la chaleur (${felt ? 'ressenti ' : ''}${heatC.toFixed(0)} °C)`
  }
  const confounderPhrase = () => {
    const bits: string[] = []
    if (driftConfounders.includes('heat')) bits.push(heatLabel())
    if (driftConfounders.includes('fast_start')) bits.push('un départ trop rapide')
    return bits.join(' et ')
  }
  if (decouplingPct != null && decouplingPct >= 10) {
    // Sous-préparation → couverte par le message de préparation (pas de « travailler
    // l'endurance » redondant). Sinon, on regarde les facteurs externes.
    if (underprepared) {
      /* déjà expliqué par la préparation légère */
    } else if (driftConfounders.length && (adjustedDecouplingPct ?? decouplingPct) < 8) {
      candidates.push({ tone: 'info', text: `Dérive cardiaque +${decouplingPct.toFixed(0)} %, mais en grande partie due à ${confounderPhrase()} — hors ce contexte elle retombe à ~+${(adjustedDecouplingPct ?? 0).toFixed(0)} %. Ton endurance n'est pas en cause.${driftConfounders.includes('fast_start') ? ' Un départ plus prudent la réduirait nettement.' : ''}${driftConfounders.includes('heat') ? ' Par forte chaleur, revois à la baisse tes attentes d\'allure et anticipe l\'hydratation.' : ''}` })
    } else {
      const nuance = driftConfounders.length ? ` (dont une part liée à ${confounderPhrase()})` : ''
      candidates.push({ tone: 'work', text: `Dérive cardiaque élevée (+${decouplingPct.toFixed(0)} %)${nuance} — travaille l'endurance fondamentale et la nutrition en course.` })
    }
  } else if (decouplingPct != null && decouplingPct >= 5 && !underprepared) candidates.push({ tone: 'info', text: `Légère dérive cardiaque (+${decouplingPct.toFixed(0)} %)${driftConfounders.length ? `, en partie liée à ${confounderPhrase()}` : ''} — entretiens l'endurance fondamentale ; vise un découplage < 5 % avant d'ajouter de l'intensité.` })
  if (durabilityBand === 'weak' && !underprepared) candidates.push({ tone: 'work', text: `Durabilité en baisse en fin de course (efficacité GAP:FC −${durabilityFadePct!.toFixed(0)} % au dernier tiers) — volume aérobie long + résistance à la fatigue (intensité/renfo en fin de longue).` })
  if (descentFade === 'marked') candidates.push({ tone: 'work', text: `Tes descentes se sont effondrées en fin de course${eccLoadEq ? ` (charge excentrique ~${eccLoadEq} m éq.)` : ''} — renfo excentrique + habituation à la descente ≥ 6-8 sem avant la prochaine.` })
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
    decouplingGapAdjusted,
    adjustedDecouplingPct,
    driftConfounders,
    tempC,
    feelsLikeC,
    preparation,
    durabilityFadePct,
    durabilityBand,
    hrDriftPredicted,
    zones,
    sections,
    worst,
    best,
    terrain,
    takeaways,
    raceVamMH,
    eccLoadEq,
    descentFade,
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
