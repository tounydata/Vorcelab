import { describe, it, expect } from 'vitest'
import { computeRaceProjection, type GpxPoint } from '../src/lib/computeRaceProjection'

// ── Fiabilité de la projection : ancrage sur les courses réelles + fade d'endurance.
// Régression sur le bug rapporté : un 30 km à D+ égal projeté PLUS RAPIDE au km qu'un
// vrai 22 km déjà couru (allure de course non ancrée + aucun terme d'endurance).

// Tracé trail vallonné paramétrable (~100 m/point). `pts` points → ~ (pts/10) km.
function trailCourse(pts: number, amp = 60): GpxPoint[] {
  const out: GpxPoint[] = []
  const lat0 = 45.0, lon0 = 6.0, dLon = 0.00127
  for (let i = 0; i < pts; i++) {
    out.push({ lat: lat0, lon: lon0 + i * dLon, ele: 1000 + amp * Math.sin(i / 8) })
  }
  return out
}

// Sortie/course trail. `workoutType = 1` (Strava « Course ») ⇒ étiquetée course.
function trailRun(
  paceSecPerKm: number, distM: number, dplus: number, ageDays: number, workoutType?: number,
): Record<string, unknown> {
  return {
    type: 'TrailRun', sport_type: 'TrailRun',
    distance: distM, total_elevation_gain: dplus,
    moving_time: (distM / 1000) * paceSecPerKm,
    average_speed: 1000 / paceSecPerKm,
    start_date: new Date(Date.now() - ageDays * 86_400_000).toISOString(),
    average_heartrate: 155,
    ...(workoutType != null ? { raw_data: { workout_type: workoutType } } : {}),
  }
}

const race = { type: 'Trail' as const, goal_time: null }
const course30 = trailCourse(300) // ~30 km

describe('Ancrage sur les courses réelles — la projection suit ta perf démontrée', () => {
  it('des courses lentes projettent nettement plus lent que des courses rapides (bidirectionnel)', () => {
    const slowHist = [
      trailRun(480, 20000, 900, 10, 1), // 8:00/km
      trailRun(485, 18000, 850, 25, 1),
      trailRun(478, 22000, 1000, 40, 1),
    ]
    const fastHist = [
      trailRun(300, 20000, 900, 10, 1), // 5:00/km
      trailRun(305, 18000, 850, 25, 1),
      trailRun(298, 22000, 1000, 40, 1),
    ]
    const slow = computeRaceProjection(course30, slowHist, {}, race)
    const fast = computeRaceProjection(course30, fastHist, {}, race)
    expect(slow.estTimeS).toBeGreaterThan(fast.estTimeS * 1.2)
  })

  it('ajouter une VRAIE course lente ralentit une projection sinon optimiste (le bug rapporté)', () => {
    // Historique de footings/sorties RAPIDES non étiquetés course.
    const fastRuns = [
      trailRun(300, 12000, 450, 5), trailRun(310, 14000, 500, 12),
      trailRun(305, 13000, 480, 20), trailRun(300, 15000, 520, 30),
    ]
    const noRace = computeRaceProjection(course30, fastRuns, {}, race)
    // Même historique + un vrai 22 km étiqueté course à 8:03/km (≈ 2h57).
    const withSlowRace = computeRaceProjection(
      course30, [...fastRuns, trailRun(483, 22000, 1100, 20, 1)], {}, race,
    )
    expect(withSlowRace.estTimeS).toBeGreaterThan(noRace.estTimeS)
    expect(withSlowRace.personalAdjustments.some((a) => a.label.startsWith('Calé sur tes courses'))).toBe(true)
    // Un 30 km ne peut pas être projeté plus rapide que le 22 km réellement couru (2h57).
    expect(withSlowRace.estTimeS).toBeGreaterThan(22 * 483)
  })
})

describe('Fade d\'endurance — au-delà de la plus longue sortie couverte', () => {
  it('signale et pénalise une distance très au-delà du vécu, pas une distance déjà couverte', () => {
    const shortHist = [
      trailRun(360, 10000, 400, 6), trailRun(365, 12000, 450, 14), trailRun(358, 11000, 420, 25),
    ]
    // Même historique + une longue sortie de la durée de la course cible.
    const longHist = [...shortHist, trailRun(360, 32000, 1150, 18)]

    const withShort = computeRaceProjection(course30, shortHist, {}, race)
    const withLong = computeRaceProjection(course30, longHist, {}, race)

    const hasFade = (r: typeof withShort) => r.personalAdjustments.some((a) => a.label.startsWith('Endurance longue distance'))
    expect(hasFade(withShort)).toBe(true)   // 30 km >> plus longue sortie (~1h) → fade
    expect(hasFade(withLong)).toBe(false)    // 30 km ≈ sortie déjà faite → pas de fade
  })
})

describe('Fade d\'endurance modulé par la durabilité (dérive cardiaque du profil)', () => {
  const shortHist = [
    trailRun(360, 10000, 400, 6), trailRun(365, 12000, 450, 14), trailRun(358, 11000, 420, 25),
  ]
  const prof = (status: string, pct: number) => ({ runner_profile: { hrDriftStatus: status, hrDriftPct: pct, hrDriftConfidence: 'high' } })

  it('une durabilité FAIBLE (dérive marquée) durcit le fade vs une durabilité SOLIDE (stable)', () => {
    const weak = computeRaceProjection(course30, shortHist, prof('marked', 15), race)
    const solid = computeRaceProjection(course30, shortHist, prof('stable', 2), race)
    expect(weak.estTimeS).toBeGreaterThan(solid.estTimeS)
  })

  it('sans signal de durabilité fiable, le fade est inchangé (pas de régression)', () => {
    const none = computeRaceProjection(course30, shortHist, {}, race)
    const lowConf = computeRaceProjection(course30, shortHist, { runner_profile: { hrDriftStatus: 'marked', hrDriftPct: 15, hrDriftConfidence: 'low' } }, race)
    expect(lowConf.estTimeS).toBe(none.estTimeS)
  })
})

describe('Non-régression — gating strict quand la donnée manque', () => {
  it('aucune course étiquetée + distance dans le vécu ⇒ aucun ajustement d\'ancrage ni de fade', () => {
    const runs = [
      trailRun(360, 32000, 1150, 6), // longue sortie ⇒ pas de fade sur un 30 km
      trailRun(365, 30000, 1100, 20),
      trailRun(358, 31000, 1120, 35),
    ]
    const r = computeRaceProjection(course30, runs, {}, race)
    expect(r.personalAdjustments.some((a) => a.label.startsWith('Calé sur tes courses'))).toBe(false)
    expect(r.personalAdjustments.some((a) => a.label.startsWith('Endurance longue distance'))).toBe(false)
  })
})
