// Pure computation wrapper around gpx-core.js and race-predictor.js algorithms.
// No DOM, no VLState, no external API calls — fully synchronous.
// Imported by RaceStrategyPage via allowJs: true in tsconfig.

// @ts-ignore — JS files typed as any via allowJs; checkJs: false keeps them unchecked
import { hav, minettiGradePenalty, buildDetailedSections, sectionTurnDegPerKm } from './gpxCore'
import { terrainTimePenalty, slipRisk, type TerrainWeather } from './terrain'
// @ts-ignore
import { computeProgressionFactor, computeFreshnessAdjustment, type RaceActivity } from './racePredictor'
import type { PostClimbRecoveryByBucket, PostDownhillRecoveryByBucket } from './runnerProfile'
import { deriveAutoPrs } from './runnerPaces'
import { resolveFcMax, ageFromBirthdate } from './fcMax'
import { dayAnchoredNow } from './dayAnchor'
import { smoothElevationProfile } from './elevationProfile'
import { computePersonalSteepnessCalibration, type SteepnessCalibrationResult } from './steepnessCalibration'
import { isEligiblePersonalCalibrationRace, selectActivitiesForTrainingLoad, type EngineActivity } from './engineHistory'
import { assessBestEffortQuality, type MergedBestEffort } from './bestEfforts'
import { fitFadeExponent } from './fadeModel'

export interface GpxPoint { lat: number; lon: number; ele: number | null }

/**
 * Contexte temporel de la projection. `asOfMs` = date de référence (« horloge »)
 * à laquelle le moteur se replace : récence des entraînements, fenêtres 7 j / 42 j,
 * ACWR, fraîcheur, récence des PR, fenêtres de confiance en découlent toutes.
 *
 * PRODUCTION : absent → instant réel (`dayAnchoredNow()` / `Date.now()`), comportement
 * strictement inchangé. BANC HISTORIQUE : `asOfMs = Date.parse(race.start_date)` pour
 * un backtest réellement historique et déterministe (une course de mars n'est plus
 * calculée comme si ses entraînements dataient de juillet).
 */
export interface ProjectionTimeContext {
  asOfMs?: number
  /**
   * Nettoie/lisse le profil altimétrique d'entrée avant projection (anti-bruit
   * barométrique/GPS). Recommandé en PRODUCTION sur les GPX importés (dont
   * l'altitude brute peut fortement surestimer le D+ et faire passer un parcours
   * plat pour un trail). Absent → aucune modification (comportement inchangé ;
   * le banc gère son propre lissage avec recalage Strava en amont).
   */
  smoothElevation?: boolean
}

export interface Section {
  type: 'up' | 'down' | 'flat'
  startKm: number
  endKm: number
  dplus: number
  dminus: number
  dist: number
  grade: number
  /** Sinuosité (° de changement de cap / km) — élevée = lacets/virages serrés. */
  turnDegPerKm?: number
  /** Descente technique (lacets) : freinage constant, pas d'accélération franche. */
  technical?: boolean
  /** Longueur réellement en lacets dans la descente (km), pour ne pas sur-annoncer. */
  technicalKm?: number
  /** Surface OSM dominante (asphalt, gravel, path…) si disponible. */
  surface?: string | null
  /** Multiplicateur de temps lié à la surface + météo (≥ 1). */
  surfaceFactor?: number
  /** Risque de glisse (texte) si pertinent. */
  slip?: string | null
}

/** Micro-tronçon (~150 m) : pente locale + sinuosité locale, pour une lecture fine. */
export interface MicroSeg {
  startKm: number
  endKm: number
  grade: number
  turnDegPerKm: number
  type: 'up' | 'down' | 'flat'
}

export interface ProjectionResult {
  points: GpxPoint[]
  samples: { d: number; alt: number | null }[]
  sections: Section[]
  /** Micro-tronçons ~150 m (pente + sinuosité locales) — pour peindre l'effort au juste. */
  microSegments: MicroSeg[]
  sectionTimes: number[]
  totalDistM: number
  dplus: number
  dminus: number
  altMin: number
  altMax: number
  estTimeS: number
  timeMin: number
  timeMax: number
  confidence: 'good' | 'medium' | 'low'
  basePaceS: number
  isTrail: boolean
  goalLabel?: string
  goalCompareColor?: string
  goalCompareStr?: string
  personalAdjustments: { label: string; detail: string; color: string }[]
  /**
   * Vrai si la projection s'est appuyée sur au moins un repli générique (allure
   * route/trail générique, absence totale de profil/PR historique, section sans
   * bucket exploitable). Reflète les VRAIES sources utilisées, pas un simple compte
   * de buckets. Cf. `fallbackSources` pour le détail machine.
   */
  usedFallback: boolean
  /** Codes machine des replis réellement mobilisés (pour rapport/explicabilité). */
  fallbackSources: string[]
  /** Calibration de pente PERSONNELLE réellement appliquée (ralentissement). */
  steepness_calibration_active: boolean
  /** Nombre de compétitions confirmées ayant alimenté la calibration de pente. */
  steepness_calibration_race_count: number
  /** Étalement de D+/km sur ces compétitions (m par km). */
  steepness_calibration_spread_dplus_per_km: number
  /** Code d'état de la calibration de pente (cf. SteepnessCalibrationResult.reason). */
  steepness_calibration_reason: SteepnessCalibrationResult['reason']
  /** Vrai si l'allure s'est appuyée sur des records AUTO détectés depuis les streams
   *  (toutes sorties), et non seulement sur des courses étiquetées / PR manuels. */
  used_stream_best_efforts: boolean
  /** Vrai si le fade d'endurance a utilisé l'exposant PERSONNEL (appris), pas le fixe. */
  used_personal_fade: boolean
  /** Exposant d'endurance personnel appliqué (ou null si non appris/fiable). */
  personal_fade_exponent: number | null
  /** R² de la régression log-log de durabilité (garde-fou de qualité). */
  personal_fade_r2: number | null
  /** Confiance du modèle de durabilité personnel : none/low/medium/high. */
  personal_fade_confidence: 'none' | 'low' | 'medium' | 'high'
  /** Nombre d'efforts (distances repères) retenus pour l'ajustement. */
  personal_fade_effort_count: number
  /** Nombre d'activités DISTINCTES ayant fourni ces efforts (anti-mono-sortie). */
  personal_fade_distinct_activity_count: number
  /** Étalement de distance (max/min) de la courbe de records. */
  personal_fade_spread_ratio: number
  /** Raison machine de l'(in)activation de la durabilité personnelle. */
  personal_fade_reason: string
  /** Fatigue GLOBALE de montée v1 (population, non personnelle) réellement active. */
  global_climb_fatigue_active: boolean
  /** Multiplicateur maximal atteint (1..1.18) — borné, valeurs inchangées cette PR. */
  global_climb_fatigue_max_multiplier: number
  /** Secondes réellement ajoutées par la fatigue globale de montée (diagnostic). */
  global_climb_fatigue_seconds_added: number
}

export function computeRaceProjection(
  points: GpxPoint[],
  activities: Record<string, unknown>[],
  profile: Record<string, unknown>,
  race: { type?: string | null; goal_time?: string | null } | null,
  terrain?: { surfaces: (string | null)[]; weather?: TerrainWeather } | null,
  ctx?: ProjectionTimeContext,
): ProjectionResult {
  // Horloge de référence. Absent → instant réel (production inchangée). Présent →
  // date historique (banc). Toutes les fenêtres de récence en découlent.
  const asOfMs = ctx?.asOfMs

  // Nettoyage altimétrique optionnel (production) : écrase le bruit baro/GPS qui
  // gonfle le D+. Sans cible Strava ici (GPX importé) → lissage seul, pas de recalage.
  if (ctx?.smoothElevation) {
    points = smoothElevationProfile({ points }).points
  }
  // Replis génériques réellement mobilisés (renseigné au fil du calcul).
  const fallbackSources: string[] = []
  const addFallback = (code: string) => { if (!fallbackSources.includes(code)) fallbackSources.push(code) }

  // ── 1. Cumulative distances & elevation stats ──────────────────────────────
  const cumDist = [0]
  let dplus = 0, dminus = 0
  for (let i = 1; i < points.length; i++) {
    cumDist.push(cumDist[i - 1] + hav(points[i - 1], points[i]))
    if (points[i].ele != null && points[i - 1].ele != null) {
      const diff = (points[i].ele as number) - (points[i - 1].ele as number)
      if (diff > 0) dplus += diff
      else dminus += Math.abs(diff)
    }
  }
  const totalDistM = cumDist[cumDist.length - 1]

  const eles = points.map((p) => p.ele).filter((e): e is number => e != null)
  const altMin = eles.length ? Math.min(...eles) : 0
  const altMax = eles.length ? Math.max(...eles) : 0

  // ── 2. Altitude samples every 100m (for chart) ────────────────────────────
  const samples: { d: number; alt: number | null }[] = []
  let target = 0
  for (let i = 0; i < points.length; i++) {
    if (cumDist[i] >= target) {
      samples.push({ d: +(cumDist[i] / 1000).toFixed(2), alt: points[i].ele != null ? Math.round(points[i].ele as number) : null })
      target += 100
    }
  }
  samples.push({ d: +(totalDistM / 1000).toFixed(2), alt: eles.length ? Math.round(eles[eles.length - 1]) : null })

  // ── 3. 500m segments ──────────────────────────────────────────────────────
  interface KmSec { km: number; startKm: number; dist: number; dplus: number; dminus: number; grade: number; altEnd: number | null }
  const kmSecs: KmSec[] = []
  let segTarget = 500, prevIdx = 0

  for (let i = 0; i < cumDist.length; i++) {
    if (cumDist[i] >= segTarget || i === cumDist.length - 1) {
      let sdp = 0, sdm = 0
      for (let j = prevIdx + 1; j <= i; j++) {
        if (points[j].ele != null && points[j - 1].ele != null) {
          const diff = (points[j].ele as number) - (points[j - 1].ele as number)
          if (diff > 0) sdp += diff
          else sdm += Math.abs(diff)
        }
      }
      const segDist = cumDist[i] - cumDist[prevIdx]
      const elevChange = (points[i].ele != null && points[prevIdx].ele != null)
        ? (points[i].ele as number) - (points[prevIdx].ele as number) : 0
      const grade = segDist > 0 ? (elevChange / segDist) * 100 : 0
      kmSecs.push({
        km: +(cumDist[i] / 1000).toFixed(2),
        startKm: +(cumDist[prevIdx] / 1000).toFixed(2),
        dist: segDist,
        dplus: Math.round(sdp),
        dminus: Math.round(sdm),
        grade: +grade.toFixed(1),
        altEnd: points[i].ele != null ? Math.round(points[i].ele as number) : null,
      })
      prevIdx = i
      segTarget = cumDist[i] + 500
    }
  }

  // ── 4. Sections (buildDetailedSections from gpx-core.js) ──────────────────
  const sections: Section[] = (buildDetailedSections(kmSecs) as Section[])

  // ── 5. isTrail from race type or D+/km heuristic ──────────────────────────
  const raceType = race?.type
  let isTrail: boolean
  if (raceType) {
    isTrail = ['Trail', 'TrailRun', 'trail'].includes(raceType)
  } else {
    isTrail = totalDistM > 0 && (dplus / (totalDistM / 1000)) > 20
  }

  // ── Séparation multisport de l'historique (décision produit) ────────────────
  // La CHARGE GÉNÉRALE (fraîcheur / fatigue / ACWR) compte TOUTES les activités
  // sportives éligibles : le cross-training (vélo, natation…) crée une fatigue réelle
  // qui pèse sur la course, et le moteur en tient déjà compte (computeTrainingLoad
  // applique un coefficient par famille de sport). Les signaux SPÉCIFIQUES au running
  // (allure de base, VAM, PR, progression, FIC, ancrage, calibration de pente) restent
  // calculés sur les seules activités course à pied / trail — chaque calcul filtre déjà
  // en interne. Une sortie vélo n'alimente donc JAMAIS l'allure, la VAM ni les PR.
  const loadActivities = selectActivitiesForTrainingLoad(
    activities as unknown as EngineActivity[],
  ) as unknown as Record<string, unknown>[]

  // ── 6. Base pace ──────────────────────────────────────────────────────────
  const profileAge = (typeof profile.age === 'number' ? profile.age : undefined) ?? ageFromBirthdate(profile.birthdate)
  const FC_MAX = resolveFcMax(profile.fc_max, activities, profileAge)
  const TRAIL_TYPES = ['TrailRun', 'Trail Run']
  const progressionFactor = computeProgressionFactor(activities as unknown as RaceActivity[], FC_MAX, isTrail)

  // Records AUTO détectés depuis les streams de TOUTES tes sorties (pas seulement les
  // courses étiquetées), fournis par le profil s'ils ont été calculés. Servent à la
  // DURABILITÉ (courbe → exposant d'endurance) et à l'affichage des records — PAS à
  // l'allure (le benchmark a montré que ça la dégrade). Cf. streamPrs plus bas.
  const streamBestEfforts =
    ((profile.runner_profile as { bestEfforts?: MergedBestEffort[] } | undefined)?.bestEfforts) ?? []

  // Durabilité INTER-distances (Étape 2) : exposant d'endurance PERSONNEL appris sur ta
  // courbe de meilleures perfs (valeur équivalent-plat). Remplace l'exposant fixe du fade
  // d'endurance quand il est fiable. ABSENT si le profil ne fournit pas de records
  // (production actuelle) → fade inchangé. Cf. fadeModel.ts.
  // Qualité des records (§8) : on DÉPONDÈRE/exclut les records douteux (descente suspecte,
  // trou temporel, altitude incomplète, vitesse invraisemblable, hors running) AVANT de les
  // laisser activer la durabilité personnelle. Filtrage sur l'éligibilité, provenance
  // conservée pour compter les activités DISTINCTES.
  const eligibleFadeEfforts = streamBestEfforts
    .filter((r) => assessBestEffortQuality(r).eligibleForFade)
    .map((r) => ({ distM: r.distanceM, timeSec: r.gapTimeSec, activityId: r.gapSource?.activityId }))
  const personalFade = fitFadeExponent(eligibleFadeEfforts)
  // Le moteur n'utilise l'exposant personnel QUE pour une confiance medium ou high (§6).
  const usePersonalFade = personalFade.confidence === 'medium' || personalFade.confidence === 'high'

  function computeBasePaceS(): number {
    const raceDpKm = dplus / (totalDistM / 1000)
    const now = dayAnchoredNow(asOfMs)

    if (isTrail) {
      const trailRuns = activities
        .filter((a: Record<string, unknown>) => {
          const t = a.type as string
          const st = a.sport_type as string
          return (TRAIL_TYPES.includes(t) || TRAIL_TYPES.includes(st) || st === 'TrailRun') && (a.distance as number) > 5000 && (a.average_speed as number) > 0
        })
        .sort((a: Record<string, unknown>, b: Record<string, unknown>) => new Date(b.start_date as string).getTime() - new Date(a.start_date as string).getTime())
        .slice(0, 20)

      if (trailRuns.length >= 1) {
        const top = trailRuns.slice(0, 10)
        let scored = top.map((a: Record<string, unknown>) => {
          const aDpKm = ((a.total_elevation_gain as number) || 0) / ((a.distance as number) / 1000)
          const similarity = 1 - Math.min(1, Math.abs(aDpKm - raceDpKm) / (raceDpKm + 1))
          // Récence CONTINUE (demi-vie ~60 j) : l'ancien palier ×2/×1 faisait sauter
          // la projection le jour où une sortie franchissait 60 jours, sans rien faire.
          const ageDays = Math.max(0, (now - new Date(a.start_date as string).getTime()) / 86_400_000)
          const recency = 1 + Math.exp(-ageDays / 60)
          return { paceS: 1000 / (a.average_speed as number), weight: (0.4 + 0.6 * similarity) * recency }
        })
        // Filtre anti-récup : une sortie nettement plus lente que TA médiane trail
        // (footing, rando-course) ne doit pas tirer la projection — on l'écarte.
        if (scored.length >= 4) {
          const sortedPaces = scored.map((x) => x.paceS).sort((a, b) => a - b)
          const median = sortedPaces[Math.floor(sortedPaces.length / 2)]
          const kept = scored.filter((x) => x.paceS <= median * 1.35)
          if (kept.length >= 3) scored = kept
        }
        const totalW = scored.reduce((s: number, x: { weight: number }) => s + x.weight, 0)
        return scored.reduce((s: number, x: { paceS: number; weight: number }) => s + x.paceS * x.weight, 0) / totalW / progressionFactor
      }
      addFallback('generic_trail_pace') // 7:00/km : aucune sortie trail exploitable
      return 420 // 7:00/km fallback
    }

    // Road : PR MANUELS prioritaires, COMPLÉTÉS par les courses ÉTIQUETÉES de
    // l'athlète (convergence avec le coach — même source de capacité que #340 :
    // sans aucune saisie, on dérive le PR des courses route étiquetées au lieu de
    // retomber sur un générique. Manuel > auto. La récence est déjà gérée par
    // deriveAutoPrs (couperet 18 mois + décote douce) → jamais d'optimisme.
    const manualPrs = profile.prs as Record<string, { timeS: number; dist: number }> | undefined
    // deriveAutoPrs : `nowMs` = horloge historique (banc) pour une récence des PR
    // calculée par rapport à la course rejouée, pas à l'exécution du script.
    const autoPrs = deriveAutoPrs(activities as unknown as Parameters<typeof deriveAutoPrs>[0], asOfMs)
    // NOTE (benchmark réel) : alimenter l'allure route avec les records auto (streams)
    // DÉGRADE la précision (route 4.6 %→6.3 % en A/B). On ne les utilise donc PAS pour
    // l'allure — seulement pour la DURABILITÉ et l'affichage des records.
    const prs = { ...(autoPrs ?? {}), ...(manualPrs ?? {}) } as Record<string, { timeS: number; dist: number }>
    const candidates = ['semi', '10k', '15k', 'marathon', '5k'].filter((k) => prs[k]?.timeS && prs[k]?.dist)
    if (candidates.length) {
      const pr = prs[candidates[0]]
      return (pr.timeS / pr.dist * 1000) / progressionFactor
    }
    addFallback('generic_road_pace') // 5:20/km : ni PR manuel, ni course route étiquetée
    return 320 // 5:20/km fallback for road
  }

  const basePaceS = computeBasePaceS()

  // ── 7. Runner profile bucket lookup ──────────────────────────────────────────
  const runnerProfile = profile.runner_profile as Record<string, unknown> | undefined
  const rBuckets = runnerProfile?.buckets as Record<string, {
    avgSpeedKmH: number | null
    vamMH: number | null
    confidence: string
    cardioCost: string
    status: string
  }> | undefined

  // Helper: map section grade to bucket key
  function sectionBucketKey(grade: number, type: string): string | null {
    if (type === 'up') {
      if (grade >= 12) return 'steep_up'
      if (grade >= 6)  return 'mod_up'
      if (grade >= 2)  return 'mild_up'
    } else if (type === 'down') {
      const g = Math.abs(grade)
      if (g >= 12) return 'steep_down'
      if (g >= 6)  return 'mod_down'
      if (g >= 2)  return 'mild_down'
    }
    return 'flat'
  }

  // ── Descentes techniques (lacets) : pénalité de temps. Priorité = TON historique.
  // Cascade : facteur perso par tranche de pente → facteur perso global → générique.
  // (la sinuosité vient du tracé GPS ; le ralentissement vient de tes descentes passées)
  const TECH_T0 = 150, SIN_TWISTY = 250, GEN_FULL = 600, GEN_CAP = 0.22
  const tdProfile = runnerProfile?.technicalDescent as {
    byBucket?: Record<string, { factor: number; confidence: string }>
    global?: { factor: number; confidence: string }
  } | undefined
  const okConf = (c?: string) => c === 'high' || c === 'medium'
  function personalTechFactor(grade: number): number | null {
    if (!tdProfile) return null
    const bk = sectionBucketKey(grade, 'down')
    const b = bk ? tdProfile.byBucket?.[bk] : undefined
    if (b && okConf(b.confidence)) return b.factor
    if (tdProfile.global && okConf(tdProfile.global.confidence)) return tdProfile.global.factor
    return null
  }
  // Micro-tronçons ~150 m : pente locale + sinuosité locale. Sert à (a) peindre l'effort
  // au juste, (b) ne pénaliser/marquer « technique » QUE les portions réellement en lacets
  // (avant : une descente de 5 km était marquée technique en entier dès qu'un bout l'était).
  const eleFilled: number[] = new Array(points.length)
  { let last = points[0]?.ele ?? 0; for (let i = 0; i < points.length; i++) { if (points[i].ele != null) last = points[i].ele as number; eleFilled[i] = last } }
  const MICRO_M = 150
  const microSegments: MicroSeg[] = []
  {
    let segStart = 0
    for (let i = 1; i < points.length; i++) {
      const span = cumDist[i] - cumDist[segStart]
      if (span >= MICRO_M || i === points.length - 1) {
        if (span < 5) { segStart = i; continue }
        const startKm = cumDist[segStart] / 1000, endKm = cumDist[i] / 1000
        const grade = +(((eleFilled[i] - eleFilled[segStart]) / span) * 100).toFixed(1)
        const turn = Math.round(sectionTurnDegPerKm(points, cumDist, startKm, endKm))
        const type: 'up' | 'down' | 'flat' = grade > 1.5 ? 'up' : grade < -1.5 ? 'down' : 'flat'
        microSegments.push({ startKm: +startKm.toFixed(3), endKm: +endKm.toFixed(3), grade, turnDegPerKm: turn, type })
        segStart = i
      }
    }
  }

  // ── Facteur d'Intensité de Course (FIC) ────────────────────────────────────
  // Les buckets sont appris sur tout l'historique (surtout footings) → ils encodent
  // l'allure d'ENTRAÎNEMENT par pente. On les recale à l'effort de COURSE via le
  // rapport, mesuré sur les courses ÉTIQUETÉES de l'athlète, entre son allure de
  // course (plat-équivalente, Minetti) et son allure apprise sur plat.
  // Aucune course étiquetée → FIC = 1 → comportement inchangé (pas de régression).
  // Science vérifiable uniquement : sa vraie course vs son vrai historique.
  function meanGradeFactor(dpkm: number): number {
    // Boucle : ~moitié en montée +g, moitié en descente −g, g ≈ (D+/km)/500.
    const g = Math.min(0.45, Math.max(0, dpkm / 500))
    if (g === 0) return 1
    return 1 + 0.5 * (minettiGradePenalty(g) + minettiGradePenalty(-g))
  }
  // Une activité ne nourrit le FIC, l'ancrage et la calibration de pente que si c'est
  // une COMPÉTITION CONFIRMÉE (mêmes règles que le banc : running/trail, étiquetée course,
  // distance/temps/vitesse plausibles, ni échauffement/décrassage/footing, ni pending).
  // L'étiquette `is_race`/`workout_type=1` seule ne suffit PLUS (un footing étiqueté par
  // erreur, un échauffement, un « à confirmer » ne doivent pas caler ta projection).
  function isRaceEffort(a: Record<string, unknown>): boolean {
    return isEligiblePersonalCalibrationRace(a as unknown as EngineActivity)
  }
  function computeRaceIntensityFactor(): { factor: number; pct: number } {
    const flat = rBuckets?.flat
    if (!flat || flat.avgSpeedKmH == null || !okConf(flat.confidence)) return { factor: 1, pct: 0 }
    const races = activities.filter((a) => {
      const t = a.type as string, st = a.sport_type as string
      const run = ['Run', 'TrailRun', 'Trail Run'].includes(t) || ['Run', 'TrailRun', 'Trail Run'].includes(st)
      return isRaceEffort(a) && run && (a.distance as number) > 3000 && (a.average_speed as number) > 0
    })
    // Pour un trail, seules les courses trail comptent (route ≠ trail, musculairement).
    const pool = isTrail
      ? races.filter((a) => TRAIL_TYPES.includes(a.type as string) || (a.sport_type as string) === 'TrailRun')
      : races
    if (!pool.length) return { factor: 1, pct: 0 }
    const now = dayAnchoredNow(asOfMs)
    let num = 0, den = 0
    for (const a of pool) {
      const kmh = (a.average_speed as number) * 3.6
      const dpkm = ((a.total_elevation_gain as number) || 0) / ((a.distance as number) / 1000)
      const flatEquiv = kmh * meanGradeFactor(dpkm)            // neutralise le D+ de la course
      const ratio = flatEquiv / (flat.avgSpeedKmH as number)   // course vs entraînement (plat)
      const ageDays = (now - new Date(a.start_date as string).getTime()) / 86_400_000
      const w = 1 / (1 + Math.max(0, ageDays) / 180)           // récence (demi-vie ~6 mois)
      num += ratio * w; den += w
    }
    const raw = den > 0 ? num / den : 1
    // Prudent : jamais plus lent que l'entraînement (≥1), plafonné (≤1.5).
    const factor = Math.min(1.5, Math.max(1.0, raw))
    return { factor, pct: Math.round((factor - 1) * 100) }
  }
  const rif = computeRaceIntensityFactor()
  // Buckets recalés à l'effort de course (vitesses & VAM × FIC), sinon inchangés.
  const rBucketsScaled = (rif.factor !== 1 && rBuckets
    ? Object.fromEntries(Object.entries(rBuckets).map(([k, b]) => [k, {
        ...b,
        avgSpeedKmH: b.avgSpeedKmH != null ? b.avgSpeedKmH * rif.factor : b.avgSpeedKmH,
        vamMH: b.vamMH != null ? b.vamMH * rif.factor : b.vamMH,
      }]))
    : rBuckets) as typeof rBuckets

  // ── 8. Section times (bucket-based when data available, else Minetti) ───────
  const sectionTimes: number[] = []
  let estTimeS = 0
  const _vam = (profile.vam_avg as number | undefined) ?? 0
  const _cu = (profile.coeff_uphill as number | undefined) ?? 0
  const _cd = (profile.coeff_downhill as number | undefined) ?? 0
  const _cf = (profile.coeff_flat as number | undefined) ?? 0
  const personalAdjustments: { label: string; detail: string; color: string }[] = []
  // Calibration de pente PERSONNELLE (renseignée dans le bloc d'ancrage ci-dessous).
  let steepnessCalibration: SteepnessCalibrationResult | null = null
  if (rif.pct > 0) personalAdjustments.push({
    label: `Allure de course : +${rif.pct}%`,
    detail: 'calée sur tes courses étiquetées (vs allure d\'entraînement)',
    color: 'var(--vl-growth)',
  })

  // Pre-compute some profile-level signals
  const hrDriftStatus = (runnerProfile?.hrDriftStatus as string | undefined) ?? 'unknown'
  const hrDriftPct    = (runnerProfile?.hrDriftPct as number | undefined) ?? 0
  const hrDriftConf   = (runnerProfile?.hrDriftConfidence as string | undefined) ?? 'none'
  const postClimbStatus = (runnerProfile?.postClimbRecoveryStatus as string | undefined) ?? 'unknown'
  const streamCoverage  = (runnerProfile?.streamCoverage as number | undefined) ?? 0

  // Count high-cardioCost buckets
  let highCostBuckets = 0
  let streamBuckets = 0
  if (rBuckets) {
    for (const b of Object.values(rBuckets)) {
      if (b.confidence !== 'none') {
        streamBuckets++
        if (b.cardioCost === 'high') highCostBuckets++
      }
    }
  }
  const avgCardioCostHigh = streamBuckets > 0 && highCostBuckets / streamBuckets > 0.5

  // Track previous section for post-climb / post-downhill recovery corrections.
  // Correction applies to the section AFTER the significant climb/descent.
  let prevClimbGrade = 0
  let prevClimbBucket: string | null = null     // 'mild_up' / 'mod_up' / 'steep_up'
  let prevDownhillBucket: string | null = null  // 'mild_down' / 'mod_down' / 'steep_down'

  const postClimbByBucket = runnerProfile?.postClimbRecoveryByBucket as PostClimbRecoveryByBucket | undefined
  const postDownhillByBucket = runnerProfile?.postDownhillRecoveryByBucket as PostDownhillRecoveryByBucket | undefined

  // Flags for Race Strategy personalAdjustments explanations
  let usedVamForSections = false
  const weakClimbRecoveryApplied = new Set<string>()
  const weakDownhillRecoveryApplied = new Set<string>()
  // Suivi des replis par section : combien de sections n'ont trouvé aucun bucket
  // exploitable et sont retombées sur le modèle générique (Minetti + coeffs legacy).
  let sectionsUsingBucket = 0
  let sectionsUsingFallback = 0
  // Aucun profil coureur exploitable du tout (ni buckets appris, ni streams) → repli.
  if (!rBuckets || Object.values(rBuckets).every((b) => b.confidence === 'none')) {
    addFallback('no_runner_profile')
  }

  // Fatigue de montée INTRA-course : à mesure que le D+ s'accumule, tes jambes montent
  // plus lentement (la VAM d'entraînement, apprise sur des côtes fraîches et courtes,
  // surestime la fin d'un gros trail vertical). Le banc réel montre une sous-estimation
  // systématique des longs trails raides (biais −20 à −40 min). Facteur BORNÉ, croissant
  // avec le D+ déjà grimpé, appliqué aux seules montées VAM. Nul en début de course et
  // sur un trail peu vertical → pas de régression sur le court.
  // ⚠️ Coefficient GLOBAL (niveau population), PAS personnel : il ne dépend d'aucune donnée
  // de l'athlète, seulement du D+ déjà grimpé dans LA course. Nommé explicitement
  // `global_climb_fatigue_v1` pour ne pas le confondre avec la durabilité personnelle
  // (fadeModel) ou les buckets appris. Valeurs INCHANGÉES dans cette PR (pas de hausse).
  let cumClimbDplus = 0
  const GLOBAL_CLIMB_FATIGUE_V1_PER_1000M = 0.09 // +9 % de temps de montée par 1000 m déjà grimpés
  const GLOBAL_CLIMB_FATIGUE_V1_MAX = 0.18
  // Diagnostics (explicabilité) — n'altèrent PAS le temps calculé.
  let globalClimbFatigueActive = false
  let globalClimbFatigueMaxMultiplier = 1
  let globalClimbFatigueSecondsAdded = 0

  for (let si = 0; si < sections.length; si++) {
    const s = sections[si]
    const g = s.grade / 100
    const progressRatio = s.startKm / (totalDistM / 1000) // 0..1 through race
    const climbFatigue = 1 + Math.min(GLOBAL_CLIMB_FATIGUE_V1_MAX, (cumClimbDplus / 1000) * GLOBAL_CLIMB_FATIGUE_V1_PER_1000M)
    if (climbFatigue > 1) {
      globalClimbFatigueActive = true
      globalClimbFatigueMaxMultiplier = Math.max(globalClimbFatigueMaxMultiplier, climbFatigue)
    }
    cumClimbDplus += s.dplus

    const bkey = sectionBucketKey(s.grade, s.type)
    const bdata = bkey && rBucketsScaled ? rBucketsScaled[bkey] : null
    const bConf = bdata?.confidence ?? 'none'
    const hasGoodBucket = (bConf === 'high' || bConf === 'medium') && bdata != null

    let pente: number

    if (hasGoodBucket && bdata!.avgSpeedKmH != null && bdata!.avgSpeedKmH > 0) {
      sectionsUsingBucket++
      // Use learned speed directly: pace from bucket speed
      const bucketSpeedMs = bdata!.avgSpeedKmH / 3.6
      const bucketPaceS = 1000 / bucketSpeedMs

      let penaltyFactor = 1.0

      // mild_up (2–6%): uses avgSpeedKmH — rolling terrain, stride dynamics similar to flat.
      // VAM is less meaningful here; vertical gain is minor vs total effort.
      // mod_up (6–12%) and steep_up (>12%): VAM is primary metric (vertical dominates).

      // VAM-based time for moderate/steep uphill sections
      if ((bkey === 'mod_up' || bkey === 'steep_up') && bdata!.vamMH != null && bdata!.vamMH > 0 && s.dplus >= 15) {
        const vamTimeS = (s.dplus / bdata!.vamMH) * 3600
        const speedTimeS = bdata!.avgSpeedKmH ? s.dist / (bdata!.avgSpeedKmH / 3.6) : vamTimeS
        // Blend: steep = 85% VAM, mod = 70% VAM
        const vamWeight = bkey === 'steep_up' ? 0.85 : 0.70
        // Fatigue de montée intra-course (croît avec le D+ déjà grimpé).
        const baseTimeNoFatigueS = (vamTimeS * vamWeight + speedTimeS * (1 - vamWeight))
        const baseTimeS = baseTimeNoFatigueS * climbFatigue
        // Apply drift/recovery penalties to baseTimeS directly, then push and continue
        let missionOnePenalty = 1.0

        // hrDrift penalty (same logic)
        if (hrDriftStatus === 'marked' && hrDriftPct > 10 &&
            (hrDriftConf === 'high' || hrDriftConf === 'medium') &&
            progressRatio >= 0.5) {
          const driftFactor = 1 + 0.03 + (progressRatio - 0.5) / 0.3 * 0.05
          missionOnePenalty = Math.max(missionOnePenalty, Math.min(1.08, driftFactor))
        }

        // Mission 3 — cardioCost high penalty only if recovery also weak
        if (bdata!.cardioCost === 'high' && postClimbStatus === 'weak' && progressRatio >= 0.5) {
          missionOnePenalty = Math.max(missionOnePenalty, 1.03)
        }

        // Post-downhill recovery on this climb section (simple fixed penalty)
        if (prevDownhillBucket && postDownhillByBucket) {
          const recKey = `after_${prevDownhillBucket}` as keyof typeof postDownhillByBucket
          const rec = postDownhillByBucket[recKey]
          if (rec && rec.confidence !== 'none' && rec.sampleCount >= 2 && rec.status === 'weak') {
            missionOnePenalty = Math.max(missionOnePenalty, 1.03)
            weakDownhillRecoveryApplied.add(prevDownhillBucket)
          }
        }

        missionOnePenalty = Math.min(missionOnePenalty, 1.10)
        const t = baseTimeS * missionOnePenalty
        // Secondes réellement ajoutées par la fatigue globale (diagnostic seul).
        globalClimbFatigueSecondsAdded += baseTimeNoFatigueS * (climbFatigue - 1) * missionOnePenalty
        sectionTimes.push(t)
        estTimeS += t
        usedVamForSections = true

        // Record significant climb; reset downhill tracking
        prevClimbGrade = s.grade
        prevClimbBucket = bkey
        prevDownhillBucket = null
        continue
      }

      // Mission 3 — Remove cardioCost auto-penalty; only penalize if recovery also weak
      // (replaces the old always-on 4.5% penalty)
      if (bdata!.cardioCost === 'high' && postClimbStatus === 'weak' && progressRatio >= 0.5) {
        penaltyFactor = Math.max(penaltyFactor, 1.03)
      }

      // hrDrift penalty: graduated, second half only, confirmed drift only
      if (hrDriftStatus === 'marked' && hrDriftPct > 10 &&
          (hrDriftConf === 'high' || hrDriftConf === 'medium') &&
          progressRatio >= 0.5) {
        // +3% at 50% → +8% at last 20%
        const driftFactor = 1 + 0.03 + (progressRatio - 0.5) / 0.3 * 0.05
        penaltyFactor = Math.max(penaltyFactor, Math.min(1.08, driftFactor))
      }

      // Post-climb recovery: real resume speed from by-bucket data
      if (prevClimbBucket && postClimbByBucket) {
        const recKey = `after_${prevClimbBucket}` as keyof typeof postClimbByBucket
        const rec = postClimbByBucket[recKey]
        if (rec && rec.confidence !== 'none' && rec.sampleCount >= 2 && rec.resumeSpeedKmH != null) {
          if (rec.status === 'weak') {
            const resumeMs = rec.resumeSpeedKmH / 3.6
            const normalMs = (bdata?.avgSpeedKmH ?? 8) / 3.6
            if (resumeMs > 0 && normalMs > 0) {
              const resumeDist = Math.min(s.dist * 0.3, 400)
              const normalDist = s.dist - resumeDist
              const blendedTimeS = resumeDist / resumeMs + normalDist / normalMs
              const baseTimeS2 = s.dist / normalMs
              const realPenalty = baseTimeS2 > 0 ? blendedTimeS / baseTimeS2 : 1.0
              penaltyFactor = Math.max(penaltyFactor, Math.min(realPenalty, 1.10))
              weakClimbRecoveryApplied.add(prevClimbBucket)
            }
          } else if (rec.status === 'good') {
            penaltyFactor = Math.min(penaltyFactor, 1.0)
          }
        }
      }

      // Fallback post-climb recovery: global signal (when no by-bucket data)
      if (postClimbStatus === 'weak' && prevClimbGrade > 0 && !prevClimbBucket) {
        const recoveryPenalty = prevClimbGrade >= 12 ? 0.06 : 0.03
        penaltyFactor = Math.min(penaltyFactor + recoveryPenalty, 1.10)
      }

      // Post-downhill recovery: real resume speed (only on non-descent sections)
      if (prevDownhillBucket && postDownhillByBucket && s.type !== 'down') {
        const recKey = `after_${prevDownhillBucket}` as keyof typeof postDownhillByBucket
        const rec = postDownhillByBucket[recKey]
        if (rec && rec.confidence !== 'none' && rec.sampleCount >= 2 && rec.resumeSpeedKmH != null) {
          if (rec.status === 'weak') {
            const resumeMs = rec.resumeSpeedKmH / 3.6
            const normalMs = (bdata?.avgSpeedKmH ?? 8) / 3.6
            if (resumeMs > 0 && normalMs > 0) {
              const resumeDist = Math.min(s.dist * 0.3, 400)
              const normalDist = s.dist - resumeDist
              const blendedTimeS = resumeDist / resumeMs + normalDist / normalMs
              const baseTimeS2 = s.dist / normalMs
              const realPenalty = baseTimeS2 > 0 ? blendedTimeS / baseTimeS2 : 1.0
              penaltyFactor = Math.max(penaltyFactor, Math.min(realPenalty, 1.08))
              weakDownhillRecoveryApplied.add(prevDownhillBucket)
            }
          } else if (rec.status === 'good') {
            // Good post-downhill recovery — no penalty
          }
          // moderate/unknown: no penalty applied
        } else if (!rec || rec.sampleCount < 2) {
          // Insufficient data: small fallback for steep descents only
          if (prevDownhillBucket === 'steep_down') penaltyFactor = Math.max(penaltyFactor, 1.02)
        }
      }

      // Cap total penalty at +10%
      penaltyFactor = Math.min(penaltyFactor, 1.10)

      const adjPaceS = bucketPaceS * penaltyFactor
      const t = adjPaceS * s.dist / 1000
      sectionTimes.push(t)
      estTimeS += t
    } else {
      // Fallback: Minetti + legacy coefficients
      sectionsUsingFallback++
      if (s.type === 'up' && _vam > 0 && g > 0.01) {
        pente = Math.max(0, (3_600_000 * g / _vam) / basePaceS - 1)
      } else if (s.type === 'up' && _cu > 0) {
        pente = minettiGradePenalty(g) * _cu
      } else if (s.type === 'down' && _cd > 0) {
        pente = minettiGradePenalty(g) * _cd
      } else if (s.type === 'flat' && _cf > 0) {
        pente = minettiGradePenalty(g) * _cf
      } else {
        pente = minettiGradePenalty(g)
      }
      const t = basePaceS * (1 + pente) * s.dist / 1000
      sectionTimes.push(t)
      estTimeS += t
    }

    // Track significant climbs for next section's post-climb recovery
    if (s.type === 'up' && s.dplus >= 30 && s.grade >= 6) {
      prevClimbGrade = s.grade
      prevClimbBucket = bkey && (bkey === 'mild_up' || bkey === 'mod_up' || bkey === 'steep_up') ? bkey : null
      prevDownhillBucket = null // leaving a climb resets descent tracking
    } else {
      prevClimbGrade = 0
      prevClimbBucket = null
    }

    // Track significant descents for next section's post-downhill recovery
    if (s.type === 'down' && s.dminus >= 25 && Math.abs(s.grade) >= 6) {
      prevDownhillBucket = bkey && (bkey === 'mild_down' || bkey === 'mod_down' || bkey === 'steep_down') ? bkey : null
    } else if (s.type !== 'down') {
      prevDownhillBucket = null
    }
  }

  // Pénalité « descente technique » (lacets), AU MICRO-TRONÇON : on ne pénalise et on ne
  // marque « technique » QUE les portions réellement sinueuses (≥ 250 °/km), pas la section
  // entière. `technicalKm` = longueur réelle en lacets (pour ne pas sur-annoncer « 5 km »).
  let techExtraTotal = 0
  let anyTechnical = false
  for (let si = 0; si < sections.length; si++) {
    const s = sections[si]
    s.turnDegPerKm = Math.round(sectionTurnDegPerKm(points, cumDist, s.startKm, s.endKm))
    if (s.type !== 'down') continue
    const sectKm = s.dist / 1000
    if (sectKm <= 0) continue
    let extra = 0, sinuousKm = 0
    const personal = personalTechFactor(s.grade)
    for (const m of microSegments) {
      const overlap = Math.min(m.endKm, s.endKm) - Math.max(m.startKm, s.startKm)
      if (overlap <= 0 || m.turnDegPerKm < TECH_T0) continue
      let pen: number
      if (personal != null) {
        const scale = Math.max(0, Math.min(1.4, (m.turnDegPerKm - TECH_T0) / (SIN_TWISTY - TECH_T0)))
        pen = 1 + (personal - 1) * scale
      } else {
        const f = Math.max(0, Math.min(1, (m.turnDegPerKm - TECH_T0) / (GEN_FULL - TECH_T0)))
        pen = 1 + f * GEN_CAP
      }
      extra += sectionTimes[si] * (overlap / sectKm) * (pen - 1)
      if (m.turnDegPerKm >= SIN_TWISTY) sinuousKm += overlap
    }
    if (sinuousKm >= 0.4) { s.technical = true; s.technicalKm = +sinuousKm.toFixed(1); anyTechnical = true }
    sectionTimes[si] += extra
    techExtraTotal += extra
  }
  estTimeS += techExtraTotal
  if (anyTechnical) {
    const techSec = sections.find((s) => s.technical)!
    const perso = personalTechFactor(techSec.grade) != null
    personalAdjustments.push({
      label: 'Descente technique',
      detail: perso
        ? 'Lacets détectés — ralentissement calé sur TES descentes sinueuses passées.'
        : 'Lacets détectés — estimation générique (pas encore de descente sinueuse dans ton historique).',
      color: 'var(--vl-amber)',
    })
  }

  // ── Terrain (surface OSM + météo) : malus de temps par section. Calibration perso
  // (runner_profile.terrainCalibration) appliquée si présente, sinon facteurs génériques.
  if (terrain?.surfaces?.length) {
    let terrainExtra = 0
    let worstSlip: string | null = null
    for (let si = 0; si < sections.length; si++) {
      const s = sections[si]
      const surf = terrain.surfaces[si] ?? null
      s.surface = surf
      if (!surf) continue
      const f = terrainTimePenalty(surf, terrain.weather, s.grade, s.type, runnerProfile as { terrainCalibration?: Record<string, number> } | null)
      s.surfaceFactor = +f.toFixed(3)
      s.slip = slipRisk(surf, terrain.weather, s.grade)
      if (s.slip && !worstSlip) worstSlip = s.slip
      if (f > 1) { const extra = sectionTimes[si] * (f - 1); sectionTimes[si] += extra; terrainExtra += extra }
    }
    estTimeS += terrainExtra
    if (terrainExtra > 1) {
      personalAdjustments.push({
        label: 'Terrain',
        detail: `+${Math.round((terrainExtra / Math.max(1, estTimeS - terrainExtra)) * 100)}% — surfaces meubles/techniques${worstSlip ? ` · ${worstSlip}` : ''}.`,
        color: 'var(--vl-amber)',
      })
    }
  }

  // ── 9. Freshness adjustment (CHARGE GÉNÉRALE = tous sports éligibles) ───────
  const freshness = computeFreshnessAdjustment(loadActivities as unknown as RaceActivity[], FC_MAX, asOfMs)
  if (freshness.multiplier !== 1 && freshness.label) {
    estTimeS *= freshness.multiplier
    personalAdjustments.push({
      label: `Charge : ${freshness.label}`,
      detail: `${freshness.multiplier > 1 ? '+' : ''}${((freshness.multiplier - 1) * 100).toFixed(0)}%`,
      color: freshness.multiplier > 1 ? 'var(--vl-ember)' : 'var(--vl-growth)',
    })
  }

  // ── Personal adjustments from runner profile signals ───────────────────────

  // Data-driven explanations: show only when signals actually affected the computation
  if (usedVamForSections) {
    personalAdjustments.push({
      label: 'VAM historique utilisée',
      detail: 'Temps sur montées raides basé sur ta VAM trail observée, pas sur la vitesse horizontale.',
      color: 'var(--vl-growth)',
    })
  }

  if (weakClimbRecoveryApplied.size > 0) {
    const bucketNames: Record<string, string> = { mild_up: 'légère', mod_up: 'modérée', steep_up: 'raide' }
    const names = [...weakClimbRecoveryApplied].map((b) => bucketNames[b] ?? b).join(', ')
    personalAdjustments.push({
      label: 'Relance post-montée prudente',
      detail: `Vitesse de relance observée réduite après montée ${names} — appliqué aux premières centaines de mètres suivant chaque montée.`,
      color: 'var(--vl-amber)',
    })
  }

  if (weakDownhillRecoveryApplied.size > 0) {
    const bucketNames: Record<string, string> = { mild_down: 'légère', mod_down: 'modérée', steep_down: 'raide' }
    const names = [...weakDownhillRecoveryApplied].map((b) => bucketNames[b] ?? b).join(', ')
    personalAdjustments.push({
      label: 'Relance post-descente prudente',
      detail: `Vitesse de relance réduite observée après descente ${names} — quadriceps contractés, reprise progressive.`,
      color: 'var(--vl-amber)',
    })
  }

  if (avgCardioCostHigh) {
    personalAdjustments.push({
      label: 'Sections coûteuses',
      detail: `FC élevée détectée sur ${highCostBuckets} gradient(s) — pacing prudent recommandé.`,
      color: 'var(--vl-amber)',
    })
  }

  if (hrDriftStatus === 'marked' && hrDriftPct > 10 &&
      (hrDriftConf === 'high' || hrDriftConf === 'medium')) {
    personalAdjustments.push({
      label: 'Dérive cardiaque (estimée)',
      detail: `+${hrDriftPct.toFixed(0)}% FC H1→H2 — biais possible terrain/chaleur — deuxième moitié plus conservative.`,
      color: 'var(--vl-amber)',
    })
  }

  // Only show generic post-climb fallback if by-bucket data didn't cover it
  if (postClimbStatus === 'weak' && weakClimbRecoveryApplied.size === 0) {
    personalAdjustments.push({
      label: 'Récupération post-montée limitée',
      detail: 'Relances après montées prudentes (donnée globale — affiner le profil avec plus de sorties).',
      color: 'var(--vl-amber)',
    })
  }

  // ── 9.5 Ancrage sur tes courses réelles + fade d'endurance ────────────────────
  // Deux corrections, ACTIVES uniquement quand la donnée existe (sinon comportement
  // strictement inchangé — la fiabilité grandit avec l'historique) :
  //  (a) ANCRAGE : la projection additionne des allures par pente apprises surtout à
  //      l'ENTRAÎNEMENT → elle peut sortir plus rapide que ta perf réelle. On réaligne
  //      son allure PLAT-ÉQUIVALENTE (Minetti neutralise le D+) sur celle de TES courses
  //      étiquetées, pondérées par récence + proximité de distance. L'ancrage ne fait que
  //      RALENTIR (calib ≥ 1) : l'accélération (coureur qui performe > entraînement) est
  //      déjà gérée par le FIC (plafonné), non doublonnée ici ; le trou que le FIC ne sait
  //      pas combler — son plancher ≥1 — est le cas « 30 km projeté plus vite au km que ton
  //      vrai 22 km », que l'ancrage corrige. FIC (accélère) + ancrage (ralentit) = bidir.
  //  (b) FADE D'ENDURANCE (Riegel) : au-delà de la plus longue sortie que tu as
  //      couverte, le temps s'allonge un peu plus que proportionnellement (fatigue).
  const raceDpKm2 = totalDistM > 0 ? dplus / (totalDistM / 1000) : 0

  function labeledRacePool(): Record<string, unknown>[] {
    const races = activities.filter((a) => {
      const t = a.type as string, st = a.sport_type as string
      const run = ['Run', 'TrailRun', 'Trail Run'].includes(t) || ['Run', 'TrailRun', 'Trail Run'].includes(st)
      return isRaceEffort(a) && run && (a.distance as number) > 3000 && (a.average_speed as number) > 0
    })
    // Un trail se cale sur tes trails uniquement (route ≠ trail, musculairement).
    return isTrail
      ? races.filter((a) => TRAIL_TYPES.includes(a.type as string) || (a.sport_type as string) === 'TrailRun')
      : races
  }

  // (a) Allure plat-équivalente démontrée (s/km) sur tes courses réelles.
  const anchorPool = labeledRacePool()
  if (anchorPool.length && totalDistM > 0) {
    const now = dayAnchoredNow(asOfMs)
    let num = 0, den = 0
    // Points pour la CALIBRATION DE PENTE INDIVIDUELLE (apprise, pas codée en dur) :
    // si Minetti neutralisait parfaitement le D+, ton allure plat-équivalente serait
    // constante quelle que soit la pente. Si elle DÉRIVE avec le D+/km sur tes courses,
    // c'est TON écart personnel à Minetti (tu encaisses plus/moins la pente que la
    // moyenne). On l'apprend par régression et on l'applique à la pente de LA course.
    const pts: { dpkm: number; flatPaceS: number; w: number }[] = []
    for (const a of anchorPool) {
      const dpkm = ((a.total_elevation_gain as number) || 0) / ((a.distance as number) / 1000)
      const flatPaceS = (1000 / (a.average_speed as number)) / meanGradeFactor(dpkm)
      const ageDays = Math.max(0, (now - new Date(a.start_date as string).getTime()) / 86_400_000)
      const wRec = 1 / (1 + ageDays / 180)                            // récence (demi-vie ~6 mois)
      const dist = a.distance as number
      const sim = 1 - Math.min(1, Math.abs(dist - totalDistM) / Math.max(totalDistM, dist)) // 1 = même distance
      const w = wRec * (0.4 + 0.6 * sim)
      num += flatPaceS * w; den += w
      pts.push({ dpkm, flatPaceS, w })
    }
    if (den > 0) {
      const wAvgFlatPaceS = num / den
      const n = anchorPool.length

      // Régression pondérée allure-plat ~ D+/km (fonction PURE, testable) : ne s'active
      // qu'avec ≥ 3 courses ET un ÉTALEMENT de pente suffisant (≥ 12 m/km entre la plus
      // plate et la plus raide) — sinon la pente de la droite serait du bruit. Elle est
      // NULLE sur ta pente habituelle (la droite passe par tes données) → ne touche pas
      // les terrains déjà bien calés ; elle n'extrapole (prudemment) que vers une pente
      // inhabituelle, et RALENTIT seulement (plancher = ta moyenne).
      steepnessCalibration = computePersonalSteepnessCalibration(
        pts.map((p) => ({ dplusPerKm: p.dpkm, flatEquivalentPaceS: p.flatPaceS, weight: p.w })),
        { targetDplusPerKm: raceDpKm2 },
      )
      const demoFlatPaceS = steepnessCalibration.predictedFlatEquivalentPaceS ?? wAvgFlatPaceS
      const slopeApplied = steepnessCalibration.active

      // Confiance : JAMAIS 100 % (résumé de course, pas la trace GPS) — croît avec le nb de courses.
      const trust = n >= 3 ? 0.9 : n === 2 ? 0.7 : 0.45
      const projFlatPaceS = (estTimeS / (totalDistM / 1000)) / meanGradeFactor(raceDpKm2)
      if (projFlatPaceS > 0) {
        const targetFlat = projFlatPaceS * (1 - trust) + demoFlatPaceS * trust
        // Ralentissement seul (≥1) : ne double pas l'accélération du FIC. Plafonné +50 %.
        const calib = Math.min(1.5, Math.max(1.0, targetFlat / projFlatPaceS))
        estTimeS *= calib
        const pct = Math.round((calib - 1) * 100)
        if (pct >= 1) personalAdjustments.push({
          label: slopeApplied ? `Calé sur tes courses (pente) : +${pct}%` : `Calé sur tes courses : +${pct}%`,
          detail: slopeApplied
            ? 'Projection ramenée à ton allure réelle, en tenant compte de ta sensibilité PERSONNELLE à la pente apprise sur tes courses (au-delà de Minetti) — s\'affine à chaque nouvelle course.'
            : 'Projection ramenée à l\'allure plat-équivalente de tes courses réelles (Minetti neutralise le D+ de chacune) — corrige un excès d\'optimisme.',
          color: 'var(--vl-ember)',
        })
      }
    }
  }

  // (b) Fade d'endurance au-delà de ta plus longue sortie (même famille trail/route).
  let demoDurationS = 0
  for (const a of activities) {
    const t = a.type as string, st = a.sport_type as string
    const run = ['Run', 'TrailRun', 'Trail Run', 'Running'].includes(t) || ['Run', 'TrailRun', 'Trail Run', 'Running'].includes(st)
    if (!run) continue
    if (isTrail && !(TRAIL_TYPES.includes(t) || st === 'TrailRun')) continue
    const mt = (a.moving_time as number) || 0
    if ((a.distance as number) > 3000 && mt > 1800) demoDurationS = Math.max(demoDurationS, mt)
  }
  // Durabilité individuelle : ta dérive cardiaque apprise (hrDrift, H1→H2) EST un signal
  // de durabilité. Une dérive marquée = tu décroches sur la durée → le fade doit être plus
  // raide ; une dérive stable = tu tiens l'allure → fade plus doux. Modulateur borné,
  // appliqué uniquement quand le signal est fiable (sinon neutre → pas de régression).
  let durabilityMult = 1
  let durabilityNote: string | null = null
  if (hrDriftConf === 'high' || hrDriftConf === 'medium') {
    if (hrDriftStatus === 'marked' && hrDriftPct > 8) { durabilityMult = 1.30; durabilityNote = 'faible' }
    else if (hrDriftStatus === 'stable') { durabilityMult = 0.80; durabilityNote = 'solide' }
    else if (hrDriftStatus === 'moderate') { durabilityMult = 1.10 }
  }
  let extrapolationRatio = 1
  if (demoDurationS > 0 && estTimeS > demoDurationS) {
    extrapolationRatio = estTimeS / demoDurationS
    // Exposant Riegel : base 1.06 (k≈0.06) sur le domaine « classique », OU ton exposant
    // d'endurance PERSONNEL appris sur ta courbe de perfs (Étape 2) quand il est fiable
    // (k = b − 1, borné). Plus raide quand on extrapole très au-delà du vécu (Riegel
    // sous-estime les ultras) → +0.06 ; puis modulé par TA durabilité (dérive cardiaque).
    const baseK = usePersonalFade
      ? Math.min(0.14, Math.max(0.03, personalFade.exponent - 1))
      : 0.06
    const k = (baseK + 0.06 * Math.min(1, Math.max(0, (extrapolationRatio - 1.5) / 2))) * durabilityMult
    const fade = Math.min(1.40, Math.pow(extrapolationRatio, k))
    estTimeS *= fade
    const pct = Math.round((fade - 1) * 100)
    if (pct >= 1) personalAdjustments.push({
      label: `Endurance longue distance : +${pct}%`,
      detail: `Course plus longue que ta plus grande sortie (×${extrapolationRatio.toFixed(1)}) — allongement d'allure attendu${durabilityNote ? `, ajusté à ta durabilité ${durabilityNote} (dérive cardiaque)` : ''}.`,
      color: 'var(--vl-amber)',
    })
  }

  // (c) Fade « fatigue du dénivelé » — INDIVIDUEL, jamais universel. Au-delà du D+ que
  // TU encaisses d'habitude (ta plus grosse sortie en D+, même famille trail/route), les
  // montées coûtent plus cher : le modèle VAM, appris surtout à l'ENTRAÎNEMENT (frais,
  // côtes courtes), surestime ta vitesse d'ascension sur un GROS cumul. Le banc réel l'a
  // mesuré : plus le D+/km est élevé, plus la projection est optimiste (~−0,3 %/(m/km)).
  // Ampleur = combien le D+ dépasse TON habituel × TA durabilité (dérive cardiaque apprise).
  // Nul si D+ ≤ ton habituel (donc aucune pénalité sur un trail court), borné, et neutre
  // sans données fiables → pas de régression, rien d'imposé.
  let demoDplus = 0
  for (const a of activities) {
    const t = a.type as string, st = a.sport_type as string
    const run = ['Run', 'TrailRun', 'Trail Run', 'Running'].includes(t) || ['Run', 'TrailRun', 'Trail Run', 'Running'].includes(st)
    if (!run) continue
    if (isTrail && !(TRAIL_TYPES.includes(t) || st === 'TrailRun')) continue
    const dp = (a.total_elevation_gain as number) || 0
    if ((a.distance as number) > 3000 && dp > 50) demoDplus = Math.max(demoDplus, dp)
  }
  if (demoDplus > 0 && dplus > demoDplus) {
    const vRatio = dplus / demoDplus // D+ de la course vs ton plus gros D+ vécu
    const vExtra = Math.min(0.20, Math.max(0, vRatio - 1) * 0.30 * durabilityMult)
    if (vExtra > 0) {
      estTimeS *= 1 + vExtra
      const pct = Math.round(vExtra * 100)
      if (pct >= 1) personalAdjustments.push({
        label: `Fatigue du dénivelé : +${pct}%`,
        detail: `Dénivelé (${Math.round(dplus)} m) au-delà de ta plus grosse sortie (${Math.round(demoDplus)} m, ×${vRatio.toFixed(1)}) — montées plus coûteuses sur la durée${durabilityNote ? `, ajusté à ta durabilité ${durabilityNote}` : ''}.`,
        color: 'var(--vl-ember)',
      })
    }
  }

  // Scale section times to match final estTimeS
  const rawSum = sectionTimes.reduce((s, t) => s + t, 0)
  const sf = rawSum > 0 ? estTimeS / rawSum : 1
  const scaledTimes = sectionTimes.map((t) => Math.round(t * sf))

  // ── 10. Confidence ─────────────────────────────────────────────────────────
  const isRunType = (t: string) => ['Run', 'TrailRun', 'Trail Run', 'Running'].includes(t)
  const cutoff90 = dayAnchoredNow(asOfMs) - 90 * 24 * 3600_000
  const recentRuns = activities.filter((a: Record<string, unknown>) =>
    (isRunType(a.type as string) || isRunType(a.sport_type as string)) && new Date(a.start_date as string).getTime() >= cutoff90 && (a.distance as number) > 0
  )
  const trailCount = activities.filter((a: Record<string, unknown>) => {
    const t = a.type as string
    const st = a.sport_type as string
    return (TRAIL_TYPES.includes(t) || TRAIL_TYPES.includes(st) || st === 'TrailRun') && (a.distance as number) > 5000
  }).length
  const recentCount = recentRuns.length
  const hasHR = activities.some((a: Record<string, unknown>) => (a.average_heartrate as number) > 0)

  let confScore = 0
  if (isTrail) { if (trailCount >= 5) confScore += 2; else if (trailCount >= 2) confScore += 1 }
  else { if (recentCount >= 3) confScore += 2; else if (recentCount >= 1) confScore += 1 }
  if (recentCount >= 3) confScore += 1
  if (hasHR) confScore += 1
  if (totalDistM > 5000 && sections.length >= 5) confScore += 1
  // stream coverage: GPS data quality boosts confidence
  if (streamCoverage >= 0.6) confScore += 2
  else if (streamCoverage >= 0.3) confScore += 1
  confScore = Math.max(0, confScore)
  let confidence: 'good' | 'medium' | 'low' = confScore >= 7 ? 'good' : confScore >= 3 ? 'medium' : 'low'
  // Extrapolation : une distance très au-delà de ton vécu ne peut pas être « good ».
  // La fourchette s'élargit d'elle-même (elle est indexée sur la confiance).
  if (extrapolationRatio > 1.6) confidence = 'low'
  else if (extrapolationRatio > 1.25 && confidence === 'good') confidence = 'medium'

  // ── 11. Range (intervalle de confiance) — CALIBRÉ sur le banc réel ─────────
  // Le banc historique a montré que les intervalles étaient bien trop étroits
  // (couverture ~27 % au lieu de la cible >75 %) : le resserrage agressif sur
  // « bonne couverture stream » écrasait la fourchette (±4-6 %) alors que les
  // erreurs réelles en trail sont de ±10-23 %. On dimensionne donc la demi-largeur
  // à partir de la confiance, du TERRAIN (le trail ajoute de l'incertitude,
  // croissante avec le D+/km) et de l'EXTRAPOLATION au-delà du vécu. Une bonne
  // couverture stream ne resserre plus que légèrement (la précision terrain ne
  // dépend pas que de la qualité GPS). La route reste serrée (erreurs ~±5 %).
  const halfBase = confidence === 'good' ? 0.08 : confidence === 'medium' ? 0.11 : 0.15
  const raceDpKmRange = totalDistM > 0 ? dplus / (totalDistM / 1000) : 0
  const terrainExtra = isTrail ? Math.min(0.13, 0.03 + raceDpKmRange * 0.0025) : 0.01
  const extrapExtra = Math.max(0, extrapolationRatio - 1) * 0.12
  let halfWidth = halfBase + terrainExtra + extrapExtra
  // Effort maîtrisé + bonne couverture stream : léger resserrage seulement.
  if (streamCoverage >= 0.6 && !avgCardioCostHigh && hrDriftStatus !== 'marked') halfWidth *= 0.92
  halfWidth = Math.min(0.30, halfWidth)

  const timeMin = estTimeS * (1 - halfWidth)
  const timeMax = estTimeS * (1 + halfWidth)

  // ── 11. Goal comparison ───────────────────────────────────────────────────
  let goalLabel: string | undefined
  let goalCompareColor: string | undefined
  let goalCompareStr: string | undefined

  if (race?.goal_time) {
    const m = race.goal_time.match(/(\d+)[hH](\d*)/)
    if (m) {
      const goalSec = parseInt(m[1]) * 3600 + (parseInt(m[2]) || 0) * 60
      const absDiff = Math.abs(goalSec - Math.round(estTimeS))
      const diffH = Math.floor(absDiff / 3600)
      const diffM = Math.floor((absDiff % 3600) / 60)
      const diffStr = `${diffH > 0 ? diffH + 'h' : ''}${String(diffM).padStart(diffH > 0 ? 2 : 1, '0')}min`
      const ratio = Math.round(estTimeS) / goalSec
      if (ratio < 0.94) { goalLabel = 'Très conservateur'; goalCompareColor = 'var(--vl-text-3)'; goalCompareStr = `Projection ${diffStr} plus rapide que ton objectif` }
      else if (ratio < 0.97) { goalLabel = 'Conservateur'; goalCompareColor = 'var(--vl-growth)'; goalCompareStr = `Projection ${diffStr} plus rapide que ton objectif` }
      else if (ratio <= 1.03) { goalLabel = 'Réaliste'; goalCompareColor = 'var(--vl-growth)'; goalCompareStr = 'Objectif aligné avec la projection Vorcelab' }
      else if (ratio <= 1.10) { goalLabel = 'Ambitieux'; goalCompareColor = 'var(--vl-amber)'; goalCompareStr = `Objectif ${diffStr} plus rapide que la projection Vorcelab` }
      else { goalLabel = 'Très ambitieux'; goalCompareColor = 'var(--vl-ember)'; goalCompareStr = `Objectif ${diffStr} plus rapide que la projection Vorcelab` }
    }
  }

  // Repli si TOUTES (ou l'écrasante majorité) des sections sont retombées sur le
  // modèle générique faute de bucket appris. Seuil : > 50 % des sections chronométrées.
  const totalScoredSections = sectionsUsingBucket + sectionsUsingFallback
  if (totalScoredSections > 0 && sectionsUsingFallback / totalScoredSections > 0.5) {
    addFallback('sections_generic_model')
  }
  const usedFallback = fallbackSources.length > 0

  return {
    points,
    samples,
    sections,
    microSegments,
    sectionTimes: scaledTimes,
    totalDistM,
    dplus,
    dminus,
    altMin,
    altMax,
    estTimeS,
    timeMin,
    timeMax,
    confidence,
    basePaceS,
    isTrail,
    goalLabel,
    goalCompareColor,
    goalCompareStr,
    personalAdjustments,
    usedFallback,
    fallbackSources,
    steepness_calibration_active: steepnessCalibration?.active ?? false,
    steepness_calibration_race_count: steepnessCalibration?.sampleCount ?? 0,
    steepness_calibration_spread_dplus_per_km: steepnessCalibration
      ? +steepnessCalibration.spread.toFixed(1)
      : 0,
    steepness_calibration_reason: steepnessCalibration?.reason ?? 'not_enough_races',
    used_stream_best_efforts: false, // records auto non utilisés pour l'allure (cf. benchmark)
    used_personal_fade: usePersonalFade,
    personal_fade_exponent: usePersonalFade ? personalFade.exponent : null,
    personal_fade_r2: personalFade.r2,
    personal_fade_confidence: personalFade.confidence,
    personal_fade_effort_count: personalFade.n,
    personal_fade_distinct_activity_count: personalFade.distinctActivityCount,
    personal_fade_spread_ratio: personalFade.spreadRatio,
    personal_fade_reason: personalFade.reason,
    global_climb_fatigue_active: globalClimbFatigueActive,
    global_climb_fatigue_max_multiplier: +globalClimbFatigueMaxMultiplier.toFixed(4),
    global_climb_fatigue_seconds_added: Math.round(globalClimbFatigueSecondsAdded),
  }
}
