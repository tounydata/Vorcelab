import { describe, it, expect } from 'vitest'
import { computeRaceProjection, type GpxPoint } from '../src/lib/computeRaceProjection'
import { computeRaceProjection as mobileProjection } from '../mobile/src/lib/computeRaceProjection'

// ── ANCRAGE CONSCIENT DE LA DURÉE (non-régression) ──────────────────────────────
//
// Bug corrigé : l'ancrage ramenait la projection à la MOYENNE pondérée de l'allure
// plat-équivalente des courses de l'athlète. Cette moyenne écrase l'axe DURÉE — elle
// mélange une course d'1 h et une de 3 h — puis s'applique telle quelle à une course
// PLUS LONGUE que tout le vécu. Résultat : optimisme systématique sur les formats longs
// (constaté en prospectif : deux courses annoncées ~17-20 % trop rapides).
//
// Correction : régression log-log `allure_plat ~ durée` sur les courses, extrapolée à la
// durée visée. Ralentissement seul, exposant borné.
//
// Protocole des tests : deux athlètes sur LE MÊME parcours, avec des courses de MÊME
// pente (D+/km identique → la calibration de PENTE ne peut pas s'activer, faute
// d'étalement) et de MÊME distance. Seule diffère la présence d'une décroissance
// d'allure avec la durée. Toute différence de projection est donc imputable au seul
// axe durée.

const DAY = 86_400_000
const now = Date.parse('2026-06-01T08:00:00Z')

/** Parcours trail synthétique : distance et D+/km approximativement pilotés. */
function trailCourse(distanceKm: number, dplusPerKm: number): GpxPoint[] {
  const pts: GpxPoint[] = []
  const n = 400
  const lat0 = 45, lon0 = 6
  // ~78,7 km par degré de longitude à 45° de latitude.
  const dLon = distanceKm / 78.7 / n
  // Profil sinusoïdal : D+ total ≈ amplitude × 2 × nombre d'oscillations.
  const oscillations = 10
  const amplitude = (dplusPerKm * distanceKm) / (2 * oscillations)
  for (let i = 0; i < n; i++) {
    pts.push({
      lat: lat0,
      lon: lon0 + i * dLon,
      ele: 1000 + amplitude * Math.sin((i / n) * oscillations * 2 * Math.PI),
    })
  }
  return pts
}

/** Compétition trail étiquetée, à pente et allure contrôlées. */
function race(daysAgo: number, distM: number, dpkm: number, speedMs: number): Record<string, unknown> {
  return {
    type: 'TrailRun', sport_type: 'TrailRun',
    distance: distM,
    moving_time: Math.round(distM / speedMs),
    elapsed_time: Math.round(distM / speedMs),
    total_elevation_gain: (dpkm * distM) / 1000,
    average_speed: speedMs,
    average_heartrate: 168, max_heartrate: 188,
    start_date: new Date(now - daysAgo * DAY).toISOString(),
    is_race: true, workout_type: 1,
  }
}

// Profil coureur AVEC buckets appris (confiance haute) : c'est la configuration de
// production. Les buckets sont appris surtout à l'ENTRAÎNEMENT et sont donc RAPIDES —
// c'est précisément pour cela que l'ancrage existe. Sans eux, la projection générique
// est déjà plus lente que les courses et l'ancrage (qui ne sait que ralentir) reste
// inerte : le bug ne serait pas observable.
const bucket = (avgSpeedKmH: number, vamMH: number | null = null) => ({
  avgSpeedKmH, vamMH, confidence: 'high', cardioCost: 'moderate', status: 'ok',
})
const profile = {
  fc_max: 190,
  runner_profile: {
    buckets: {
      // Rapides, mais pas au point de saturer le plafond de l'ancrage (+50 %) :
      // au plafond, deux athlètes différents sortiraient le MÊME temps et le test
      // ne mesurerait plus rien.
      flat: bucket(10),
      mild_up: bucket(8.3),
      mod_up: bucket(5.8, 750),
      steep_up: bucket(3.75, 833),
      mild_down: bucket(10.8),
      mod_down: bucket(11.7),
      steep_down: bucket(10),
    },
  },
}
const raceMeta = { type: 'TrailRun', goal_time: null }
const ctx = { asOfMs: now }

// Même pente partout (30 m/km) → étalement de pente nul → calibration de PENTE inactive.
const DPKM = 30

/**
 * Sortie longue d'entraînement, IDENTIQUE pour les deux athlètes. Elle neutralise les
 * deux fades (endurance et dénivelé), qui se mesurent sur la plus longue SORTIE et le
 * plus gros D+ vécus : sans elle, l'athlète le plus lent aurait mécaniquement la course
 * la plus longue, donc un fade plus faible que le témoin — et la comparaison ne
 * mesurerait plus l'ancrage. (C'est exactement la configuration réelle d'un traileur
 * qui s'entraîne plus longtemps qu'il ne court.)
 */
const longTrainingRun: Record<string, unknown> = {
  type: 'TrailRun', sport_type: 'TrailRun',
  distance: 30000, moving_time: 25000, elapsed_time: 27000,
  total_elevation_gain: 1200, average_speed: 30000 / 25000,
  average_heartrate: 150, max_heartrate: 175,
  start_date: new Date(now - 20 * DAY).toISOString(),
  is_race: false,
}

// Athlète A : l'allure plat-équivalente se DÉGRADE avec la durée (358 → 488 s/km).
// Vitesses choisies pour que la MOYENNE PONDÉRÉE de son allure plat-équivalente égale
// EXACTEMENT celle du témoin B — seule la FORME (décroissance vs constante) diffère.
// Toute différence de projection est donc imputable à la seule extrapolation en durée,
// et non à un athlète globalement plus lent que l'autre.
// 4 courses : c'est le minimum d'identifiabilité exigé par la calibration de durée.
const decaying = [
  race(30, 10000, DPKM, 2.2716),
  race(60, 16000, DPKM, 2.0432),
  race(45, 20000, DPKM, 1.8998),
  race(90, 24000, DPKM, 1.6661),
  longTrainingRun,
]

// Athlète B (témoin) : mêmes distances, mêmes pentes, allure CONSTANTE (420 s/km
// plat-équivalent — la moyenne pondérée de A).
const flatPaced = [
  race(30, 10000, DPKM, 1.9347),
  race(60, 16000, DPKM, 1.9347),
  race(45, 20000, DPKM, 1.9347),
  race(90, 24000, DPKM, 1.9347),
  longTrainingRun,
]

describe('ancrage conscient de la durée', () => {
  const course = trailCourse(32, DPKM)

  it('1. une décroissance d’allure apprise RALENTIT la projection d’une course longue', () => {
    const a = computeRaceProjection(course, decaying, profile, raceMeta, null, ctx)
    const b = computeRaceProjection(course, flatPaced, profile, raceMeta, null, ctx)

    expect(a.duration_calibration_active).toBe(true)
    // Le témoin n'a aucune décroissance à apprendre → l'axe durée ne le ralentit pas.
    expect(b.duration_calibration_active).toBe(false)
    // L'athlète qui décroche est projeté PLUS LENT, alors que son allure moyenne
    // démontrée est proche de celle du témoin.
    expect(a.estTimeS).toBeGreaterThan(b.estTimeS)
  })

  it('2. l’axe PENTE reste inactif ici → la différence vient bien de la durée', () => {
    const a = computeRaceProjection(course, decaying, profile, raceMeta, null, ctx)
    expect(a.steepness_calibration_reason).toBe('insufficient_spread')
    expect(a.steepness_calibration_active).toBe(false)
  })

  it('3. l’exposant d’endurance appris est positif et borné', () => {
    const a = computeRaceProjection(course, decaying, profile, raceMeta, null, ctx)
    expect(a.duration_calibration_exponent!).toBeGreaterThan(0)
    expect(a.duration_calibration_exponent!).toBeLessThanOrEqual(0.15)
    expect(a.duration_calibration_race_count).toBe(4)
  })

  it('4. le libellé d’explicabilité nomme l’axe durée', () => {
    const a = computeRaceProjection(course, decaying, profile, raceMeta, null, ctx)
    const labels = a.personalAdjustments.map((x) => x.label)
    expect(labels.some((l) => l.startsWith('Calé sur tes courses') && l.includes('durée'))).toBe(true)
  })

  it('5. moins de 4 courses → axe durée inerte (identifiabilité insuffisante)', () => {
    const a = computeRaceProjection(course, [...decaying.slice(0, 3), longTrainingRun], profile, raceMeta, null, ctx)
    expect(a.duration_calibration_active).toBe(false)
    expect(a.duration_calibration_reason).toBe('not_enough_races')
  })

  it('5bis. durée corrélée à la pente → axe durée inerte (non identifiable)', () => {
    // Les courses les plus longues sont aussi les plus raides : impossible de dire
    // lequel des deux ralentit. Le moteur doit s'abstenir plutôt que sur-corriger.
    const confounded = [
      race(30, 10000, 20, 2.2716),
      race(60, 16000, 30, 2.0432),
      race(45, 20000, 40, 1.8998),
      race(90, 24000, 55, 1.6661),
      longTrainingRun,
    ]
    const a = computeRaceProjection(course, confounded, profile, raceMeta, null, ctx)
    expect(a.duration_calibration_collinearity!).toBeGreaterThan(0.5)
    expect(a.duration_calibration_active).toBe(false)
    expect(a.duration_calibration_reason).toBe('collinear_with_steepness')
  })

  it('6. sur une course COURTE (dans le vécu), l’axe durée ne ralentit pas', () => {
    // 8 km : bien en deçà de la durée des courses apprises → plancher = moyenne.
    const short = computeRaceProjection(trailCourse(8, DPKM), decaying, profile, raceMeta, null, ctx)
    expect(short.duration_calibration_active).toBe(false)
  })

  it('7. parité web ↔ mobile', () => {
    const w = computeRaceProjection(course, decaying, profile, raceMeta, null, ctx)
    const m = mobileProjection(course, decaying, profile, raceMeta, null, ctx)
    expect(m.estTimeS).toBe(w.estTimeS)
    expect(m.duration_calibration_exponent).toBe(w.duration_calibration_exponent)
  })
})

describe('recalage du D+ officiel déclaré', () => {
  // GPX dont l'altimétrie intègre nettement MOINS que le D+ du règlement — cas réel :
  // un GPX d'organisateur sous-échantillonné rend le parcours plus plat qu'il n'est.
  const course = trailCourse(32, 20)

  it('8. sans D+ déclaré, le moteur s’en tient à l’altimétrie du fichier', () => {
    const p = computeRaceProjection(course, decaying, profile, raceMeta, null, { ...ctx, smoothElevation: true })
    expect(p.dplus).toBeLessThan(900)
  })

  it('9. avec le D+ déclaré, le profil est recalé et la projection RALENTIT', () => {
    const raw = computeRaceProjection(course, decaying, profile, raceMeta, null, { ...ctx, smoothElevation: true })
    const cal = computeRaceProjection(course, decaying, profile, raceMeta, null, {
      ...ctx, smoothElevation: true, targetElevationGainM: 1160,
    })
    // Le D+ projeté se rapproche du règlement…
    expect(cal.dplus).toBeGreaterThan(raw.dplus)
    expect(Math.abs(cal.dplus - 1160)).toBeLessThan(Math.abs(raw.dplus - 1160))
    // …et un parcours plus vertical se court plus lentement.
    expect(cal.estTimeS).toBeGreaterThan(raw.estTimeS)
    // La distance n'est JAMAIS modifiée par le recalage.
    expect(cal.totalDistM).toBeCloseTo(raw.totalDistM, 6)
  })

  it('10. un D+ déclaré aberrant est ignoré (pas de recalage absurde)', () => {
    const raw = computeRaceProjection(course, decaying, profile, raceMeta, null, { ...ctx, smoothElevation: true })
    // 50 000 m sur 32 km = 1 562 m/km : au-delà du plausible → ignoré.
    const bogus = computeRaceProjection(course, decaying, profile, raceMeta, null, {
      ...ctx, smoothElevation: true, targetElevationGainM: 50_000,
    })
    expect(bogus.dplus).toBeCloseTo(raw.dplus, 6)
  })
})
