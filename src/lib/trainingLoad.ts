// Port exact de training-load.js
// Charge d'entraînement — charge aiguë 7j, charge de fond 42j, ratio, tendance

import { FC_MAX_FALLBACK } from './fcMax'
import { dayAnchoredNow } from './dayAnchor'

// FCmax = individuelle ; ce repère n'est qu'un dernier recours (cf. fcMax.ts).
const FC_MAX_DEFAULT = FC_MAX_FALLBACK
const TRAIL_TYPES = ['TrailRun', 'Trail Run']
const MS_7D  =  7 * 86_400_000
const MS_14D = 14 * 86_400_000
const MS_42D = 42 * 86_400_000

export interface ActivityForLoad {
  moving_time?: number | null
  average_heartrate?: number | null
  sport_type?: string | null
  type?: string | null
  distance?: number | null
  total_elevation_gain?: number | null
  start_date: string
}

function isRun(type: string | null | undefined): boolean {
  return ['Run', 'TrailRun', 'Trail Run', 'Running'].includes(type ?? '')
}

// ── CLASSIFICATION MULTI-SPORT (couleur par famille, nuance par sport) ──────────
// Familles = liste complète des sport_type Strava regroupés. La famille `montagne`
// réunit ski, alpinisme/escalade, raquettes et glisse neige (même famille demandée).
export type FamilyKey = 'pedestre' | 'velo' | 'aqua' | 'renfo' | 'montagne' | 'cardio'

export interface SportInfo { family: FamilyKey; color: string; label: string }

// Coefficient d'intensité fallback (sans FC), relatif à la course = 1.0
export const FAMILY_COEF: Record<FamilyKey, number> = {
  pedestre: 1.0, velo: 0.7, aqua: 0.85, renfo: 0.6, montagne: 0.85, cardio: 0.7,
}

const SPORT_TYPE_INFO: Record<string, SportInfo> = {
  // Pédestre / Impact
  Run: { family: 'pedestre', color: '#E5562A', label: 'Course' },
  Running: { family: 'pedestre', color: '#E5562A', label: 'Course' },
  TrailRun: { family: 'pedestre', color: '#C0392B', label: 'Trail' },
  'Trail Run': { family: 'pedestre', color: '#C0392B', label: 'Trail' },
  VirtualRun: { family: 'pedestre', color: '#F2784B', label: 'Course virtuelle' },
  Hike: { family: 'pedestre', color: '#D97706', label: 'Rando' },
  Walk: { family: 'pedestre', color: '#EA9A52', label: 'Marche' },
  Wheelchair: { family: 'pedestre', color: '#B85C38', label: 'Fauteuil' },
  // Pédalage
  Ride: { family: 'velo', color: '#3B82F6', label: 'Vélo' },
  VirtualRide: { family: 'velo', color: '#60A5FA', label: 'Vélo virtuel' },
  MountainBikeRide: { family: 'velo', color: '#2563EB', label: 'VTT' },
  GravelRide: { family: 'velo', color: '#1D4ED8', label: 'Gravel' },
  EMountainBikeRide: { family: 'velo', color: '#93C5FD', label: 'VTTAE' },
  EBikeRide: { family: 'velo', color: '#BFDBFE', label: 'Vélo élec.' },
  Velomobile: { family: 'velo', color: '#3B82F6', label: 'Vélomobile' },
  Handcycle: { family: 'velo', color: '#2563EB', label: 'Handbike' },
  // Aquatique / Glisse eau
  Swim: { family: 'aqua', color: '#06B6D4', label: 'Natation' },
  Kayaking: { family: 'aqua', color: '#0891B2', label: 'Kayak' },
  Canoeing: { family: 'aqua', color: '#0E7490', label: 'Canoë' },
  Rowing: { family: 'aqua', color: '#0D9488', label: 'Aviron' },
  VirtualRow: { family: 'aqua', color: '#14B8A6', label: 'Aviron virtuel' },
  StandUpPaddling: { family: 'aqua', color: '#2DD4BF', label: 'Paddle' },
  Surfing: { family: 'aqua', color: '#22D3EE', label: 'Surf' },
  Kitesurf: { family: 'aqua', color: '#5EEAD4', label: 'Kitesurf' },
  Windsurf: { family: 'aqua', color: '#67E8F9', label: 'Windsurf' },
  Sail: { family: 'aqua', color: '#0F766E', label: 'Voile' },
  // Renfo / Force / Mobilité
  WeightTraining: { family: 'renfo', color: '#7C3AED', label: 'Renfo' },
  Crossfit: { family: 'renfo', color: '#6D28D9', label: 'Crossfit' },
  Workout: { family: 'renfo', color: '#8B5CF6', label: 'Workout' },
  HighIntensityIntervalTraining: { family: 'renfo', color: '#9333EA', label: 'HIIT' },
  Pilates: { family: 'renfo', color: '#A78BFA', label: 'Pilates' },
  Yoga: { family: 'renfo', color: '#C4B5FD', label: 'Yoga' },
  PhysicalTherapy: { family: 'renfo', color: '#DDD6FE', label: 'Kiné' },
  // Montagne — ski, alpinisme/escalade, raquettes, glisse neige (même famille)
  AlpineSki: { family: 'montagne', color: '#6366F1', label: 'Ski alpin' },
  BackcountrySki: { family: 'montagne', color: '#4F46E5', label: 'Ski rando' },
  NordicSki: { family: 'montagne', color: '#4338CA', label: 'Ski fond' },
  Snowboard: { family: 'montagne', color: '#6366F1', label: 'Snowboard' },
  RollerSki: { family: 'montagne', color: '#818CF8', label: 'Ski roue' },
  Snowshoe: { family: 'montagne', color: '#818CF8', label: 'Raquettes' },
  IceSkate: { family: 'montagne', color: '#A5B4FC', label: 'Patin' },
  RockClimbing: { family: 'montagne', color: '#3730A3', label: 'Escalade' },
  // Cardio salle & Sports
  Elliptical: { family: 'cardio', color: '#10B981', label: 'Elliptique' },
  StairStepper: { family: 'cardio', color: '#059669', label: 'Stepper' },
  Tennis: { family: 'cardio', color: '#22C55E', label: 'Tennis' },
  Padel: { family: 'cardio', color: '#34D399', label: 'Padel' },
  Squash: { family: 'cardio', color: '#10B981', label: 'Squash' },
  Badminton: { family: 'cardio', color: '#34D399', label: 'Badminton' },
  Pickleball: { family: 'cardio', color: '#6EE7B7', label: 'Pickleball' },
  TableTennis: { family: 'cardio', color: '#22C55E', label: 'Tennis de table' },
  Racquetball: { family: 'cardio', color: '#059669', label: 'Racquetball' },
  Soccer: { family: 'cardio', color: '#16A34A', label: 'Football' },
  Basketball: { family: 'cardio', color: '#15803D', label: 'Basket' },
  Volleyball: { family: 'cardio', color: '#4ADE80', label: 'Volley' },
  Cricket: { family: 'cardio', color: '#65A30D', label: 'Cricket' },
  Golf: { family: 'cardio', color: '#84CC16', label: 'Golf' },
  Dance: { family: 'cardio', color: '#A3E635', label: 'Danse' },
  Skateboard: { family: 'cardio', color: '#84CC16', label: 'Skate' },
  InlineSkate: { family: 'cardio', color: '#A3E635', label: 'Roller' },
}

export function classifySport(type?: string | null, sportType?: string | null): SportInfo {
  return (
    SPORT_TYPE_INFO[sportType ?? ''] ??
    SPORT_TYPE_INFO[type ?? ''] ??
    { family: 'cardio', color: '#22C55E', label: sportType || type || 'Autre' }
  )
}

// Rendement décroissant sur la durée (modèle EPOC-like, cf. charge Garmin) : le
// coût physiologique d'une sortie ne croît pas linéairement avec le temps. Au-delà
// d'un seuil (~90 min), chaque minute supplémentaire ne compte qu'à moitié — sinon
// une sortie longue à intensité modérée gonfle artificiellement l'ATL/le ratio
// (une seule sortie longue ne doit pas se lire comme un « surmenage »).
const DURATION_CAP_MIN = 90
function effectiveMinutes(min: number): number {
  return min <= DURATION_CAP_MIN ? min : DURATION_CAP_MIN + (min - DURATION_CAP_MIN) * 0.5
}

// Load = minutes_effectives × facteur_intensité × facteur_dénivelé × facteur_type
export function computeActivityLoad(activity: ActivityForLoad, fcMax?: number | null): number {
  const maxHR = fcMax || FC_MAX_DEFAULT
  const durationMin = (activity.moving_time || 0) / 60
  if (durationMin < 5) return 0

  // Facteur intensité — poids log-croissants inspirés Bannister TRIMP.
  // Palier intermédiaire à z∈[0.80,0.85[ (3.5) : sur une sortie longue/vallonnée,
  // la FC moyenne est tirée vers le haut par les montées alors que l'effort reste
  // aérobie — on évite de la classer « seuil » (4.5) comme le faisait l'ancien
  // saut brutal à 0.80. Cohérent avec la répartition d'intensité Garmin.
  let intensity: number
  if (activity.average_heartrate && maxHR > 0) {
    const z = activity.average_heartrate / maxHR
    if (z >= 0.90)      intensity = 7.5
    else if (z >= 0.85) intensity = 4.5
    else if (z >= 0.80) intensity = 3.5
    else if (z >= 0.70) intensity = 2.5
    else if (z >= 0.60) intensity = 1.5
    else                intensity = 1.0
  } else {
    const t = activity.sport_type || activity.type || ''
    const fam = classifySport(activity.type, activity.sport_type).family
    if (fam === 'pedestre') {
      // Course/trail : on garde la finesse allure
      const pace = (activity.distance ?? 0) > 100
        ? (activity.moving_time ?? 0) / ((activity.distance ?? 0) / 1000)
        : 0
      if (TRAIL_TYPES.includes(t))      intensity = 3.0
      else if (pace > 0 && pace < 280)  intensity = 3.5 // < 4:40/km → intensif
      else if (pace > 0 && pace < 360)  intensity = 3.0 // < 6:00/km
      else                              intensity = 2.5
    } else {
      // Autres sports sans FC : intensité modérée × coefficient de famille
      intensity = 3.0 * FAMILY_COEF[fam]
    }
  }

  // Facteur dénivelé — D+/km
  let elev = 1.0
  if ((activity.distance ?? 0) > 100 && (activity.total_elevation_gain ?? 0) > 0) {
    const dpKm = (activity.total_elevation_gain ?? 0) / ((activity.distance ?? 0) / 1000)
    if (dpKm >= 40)      elev = 1.30
    else if (dpKm >= 20) elev = 1.15
    else if (dpKm >= 10) elev = 1.05
  }

  // Facteur type
  const typeFactor = TRAIL_TYPES.includes(activity.sport_type || activity.type || '') ? 1.05 : 1.0

  return Math.round(effectiveMinutes(durationMin) * intensity * elev * typeFactor)
}

export function computeLoadTrend(activities: ActivityForLoad[], fcMax?: number | null, asOfMs?: number): string {
  // `asOfMs` = horloge historique injectable (banc). Absent → instant réel (prod).
  const now = asOfMs ?? Date.now()
  const runs = (activities || []).filter(a => isRun(a.sport_type || a.type))

  const load7 = runs
    .filter(a => now - new Date(a.start_date).getTime() <= MS_7D)
    .reduce((s, a) => s + computeActivityLoad(a, fcMax), 0)

  const load7prev = runs
    .filter(a => {
      const age = now - new Date(a.start_date).getTime()
      return age > MS_7D && age <= MS_14D
    })
    .reduce((s, a) => s + computeActivityLoad(a, fcMax), 0)

  if (load7prev === 0 && load7 === 0) return 'unknown'
  if (load7prev === 0) return 'increasing'
  const ratio = load7 / load7prev
  if (ratio > 1.15) return 'increasing'
  if (ratio < 0.85) return 'decreasing'
  return 'stable'
}

// ATL (charge aiguë) τ=7j / CTL (charge chronique) τ=42j — Bannister TRIMP model
export function computeTrainingLoad(activities: ActivityForLoad[], fcMax?: number | null, asOfMs?: number) {
  // Ancré sur la journée (et non l'instant) → charge identique entre dashboard et
  // stratégie, calculés à des moments différents. Cf. dayAnchor.ts.
  // `asOfMs` = horloge historique injectable (banc) : les fenêtres 7 j / 42 j se
  // calculent alors relativement à la COURSE rejouée, pas à l'exécution du script.
  const now = dayAnchoredNow(asOfMs)
  const runs = (activities || []).filter(a => isRun(a.sport_type || a.type))

  const recent42 = runs.filter(a => now - new Date(a.start_date).getTime() <= MS_42D)
  const recent7  = recent42.filter(a => now - new Date(a.start_date).getTime() <= MS_7D)

  const acute = recent7.reduce((acc, a) => {
    const ageDays = (now - new Date(a.start_date).getTime()) / 86_400_000
    const weight = Math.exp(-ageDays / 7)
    const load = computeActivityLoad(a, fcMax)
    return { sum: acc.sum + load * weight, weight: acc.weight + weight }
  }, { sum: 0, weight: 0 })

  const chronic = recent42.reduce((acc, a) => {
    const ageDays = (now - new Date(a.start_date).getTime()) / 86_400_000
    const weight = Math.exp(-ageDays / 42)
    const load = computeActivityLoad(a, fcMax)
    return { sum: acc.sum + load * weight, weight: acc.weight + weight }
  }, { sum: 0, weight: 0 })

  const acuteLoad  = acute.weight   > 0 ? acute.sum   / acute.weight   : 0
  const chronicLoad = chronic.weight > 0 ? chronic.sum / chronic.weight : 0
  const ratio = chronicLoad > 0 ? acuteLoad / chronicLoad : null
  const trend = computeLoadTrend(activities, fcMax, asOfMs)

  return {
    acuteLoad:   Math.round(acuteLoad),
    chronicLoad: Math.round(chronicLoad),
    ratio,
    trend,
    count7:  recent7.length,
    count42: recent42.length,
    hasHR:   recent7.some(a => a.average_heartrate),
  }
}

// ── PMC QUOTIDIEN (Performance Manager Chart — Banister) ────────────────────────
// CTL τ=42j (Fitness), ATL τ=7j (Fatigue), TSB = CTL − ATL (Forme).
// Calculé sur tous les sports importés. On calcule sur une longue fenêtre pour
// fiabiliser le CTL, et on ne renvoie que les `displayDays` derniers jours.

export interface PMCDay {
  date: string            // YYYY-MM-DD
  totalLoad: number       // charge du jour (tous sports)
  byFamily: Partial<Record<FamilyKey, number>>
  atl: number
  ctl: number
  tsb: number
  calibrating: boolean    // true tant que le CTL n'a pas assez d'historique
}

const DECAY_ATL = Math.exp(-1 / 7)
const DECAY_CTL = Math.exp(-1 / 42)

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function computeDailyPMC(
  activities: ActivityForLoad[],
  fcMax?: number | null,
  opts?: { totalDays?: number; displayDays?: number },
): PMCDay[] {
  const totalDays = opts?.totalDays ?? 90
  const displayDays = opts?.displayDays ?? 42
  const today = new Date()
  today.setHours(12, 0, 0, 0)

  // Charge quotidienne (tous sports) + ventilation par famille
  const dailyLoad: Record<string, number> = {}
  const dailyFam: Record<string, Partial<Record<FamilyKey, number>>> = {}
  for (const a of activities || []) {
    const ds = (a.start_date || '').slice(0, 10)
    if (!ds) continue
    const load = computeActivityLoad(a, fcMax)
    if (load <= 0) continue
    const fam = classifySport(a.type, a.sport_type).family
    dailyLoad[ds] = (dailyLoad[ds] ?? 0) + load
    if (!dailyFam[ds]) dailyFam[ds] = {}
    dailyFam[ds][fam] = (dailyFam[ds][fam] ?? 0) + load
  }

  const out: PMCDay[] = []
  let atl = 0, ctl = 0
  let started = false, sinceStart = 0
  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const ds = ymd(d)
    const load = dailyLoad[ds] ?? 0
    if (load > 0) started = true
    if (started) sinceStart++
    // TSB = forme d'AVANT la séance du jour (CTL/ATL de la veille)
    const tsb = ctl - atl
    atl = atl * DECAY_ATL + load * (1 - DECAY_ATL)
    ctl = ctl * DECAY_CTL + load * (1 - DECAY_CTL)
    if (i < displayDays) {
      out.push({
        date: ds,
        totalLoad: Math.round(load),
        byFamily: dailyFam[ds] ?? {},
        atl: Math.round(atl),
        ctl: Math.round(ctl),
        tsb: Math.round(tsb),
        calibrating: !started || sinceStart < 28,
      })
    }
  }
  return out
}

// ── ZONES DE FORME (TSB) — mapping science → 5 couleurs ─────────────────────────
export interface TsbZone { key: string; label: string; sub: string; color: string }

export function getTsbZone(tsb: number): TsbZone {
  if (tsb < -30) return { key: 'surcharge', label: 'SURCHARGE', sub: 'risque blessure', color: 'var(--vl-status-over)' }
  if (tsb < -10) return { key: 'optimal', label: 'OPTIMAL', sub: 'tu progresses', color: 'var(--vl-status-prod)' }
  if (tsb <= 5)  return { key: 'maintien', label: 'MAINTIEN', sub: 'forme stable', color: 'var(--vl-status-watch)' }
  if (tsb <= 25) return { key: 'recuperation', label: 'RÉCUPÉRATION', sub: 'frais & reposé', color: 'var(--vl-status-rest)' }
  return { key: 'desentrainement', label: 'FORME EN BAISSE', sub: 'tu perds en forme', color: 'var(--vl-status-load)' }
}

// ── ACWR multi-sport (Gabbett 2016) — aigu 7j / chronique 28j ───────────────────
export interface ACWRResult { ratio: number | null; label: string; color: string; pct: number }

export function computeACWR(pmc: PMCDay[]): ACWRResult {
  if (pmc.length === 0) return { ratio: null, label: 'calibrage', color: 'var(--vl-text-3)', pct: 0 }
  const today = pmc[pmc.length - 1]
  // Utilise ATL/CTL (déjà exponentiellement lissés τ=7j/42j) plutôt que des
  // moyennes brutes 7j/28j — évite les pics artificiels sur une seule grosse sortie trail.
  if (today.calibrating || today.ctl <= 0) return { ratio: null, label: 'calibrage', color: 'var(--vl-text-3)', pct: 0 }
  const ratio = today.atl / today.ctl
  const pct = Math.max(0, Math.min(100, ((ratio - 0.5) / 1.5) * 100))
  let label = 'zone optimale'
  let color = 'var(--vl-status-prod)'
  if (ratio < 0.8)       { label = 'sous-charge';    color = 'var(--vl-status-rest)' }
  else if (ratio <= 1.3) { label = 'zone optimale';  color = 'var(--vl-status-prod)' }
  else if (ratio <= 1.5) { label = 'charge élevée';  color = 'var(--vl-status-load)' }
  else                   { label = 'risque blessure'; color = 'var(--vl-status-over)' }
  return { ratio, label, color, pct }
}

// Seuils ACWR issus de Gabbett 2016 (Br J Sports Med)
export function getLoadStatus(ratio: number | null) {
  if (ratio === null || ratio === undefined)
    return { label: 'inconnu',            color: 'var(--vl-text-3)', code: 'unknown'  }
  if (ratio < 0.80)
    return { label: 'récupération',       color: 'var(--vl-growth)', code: 'recovery' }
  if (ratio <= 1.30)
    return { label: 'stable',             color: 'var(--vl-growth)', code: 'stable'   }
  if (ratio <= 1.50)
    return { label: 'charge élevée',      color: '#f59e0b',          code: 'elevated' }
  return   { label: 'surcharge probable', color: 'var(--vl-ember)',  code: 'overload' }
}
