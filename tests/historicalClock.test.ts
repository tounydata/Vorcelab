import { describe, it, expect, vi, afterEach } from 'vitest'
import { computeTrainingLoad } from '../src/lib/trainingLoad'
import { deriveAutoPrs } from '../src/lib/runnerPaces'
import { computeRaceProjection, type GpxPoint } from '../src/lib/computeRaceProjection'
import { computeRaceProjection as mobileProjection } from '../mobile/src/lib/computeRaceProjection'

// ── Horloge historique injectable (asOfMs) ─────────────────────────────────────
// Une course de mars ne doit pas être calculée comme si ses entraînements dataient
// de juillet. Ces tests prouvent que la date de référence pilote bien toute la
// récence — et que le résultat est DÉTERMINISTE quelle que soit l'horloge système.

const DAY = 86_400_000
const RACE_ISO = '2026-03-15T08:00:00Z'
const RACE_MS = Date.parse(RACE_ISO)

function run(daysBeforeRace: number, opts: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    type: 'Run', sport_type: 'Run', distance: 10000, moving_time: 3000,
    total_elevation_gain: 30, average_speed: 3.33, average_heartrate: 150, max_heartrate: 185,
    start_date: new Date(RACE_MS - daysBeforeRace * DAY).toISOString(),
    is_race: false, ...opts,
  }
}

afterEach(() => vi.useRealTimers())

describe('horloge historique — charge d’entraînement', () => {
  it('1. une activité 3 j avant la course est bien « récente » (dans la fenêtre aiguë 7 j)', () => {
    const acts = [run(3), run(30), run(60)]
    const load = computeTrainingLoad(acts as never, 185, RACE_MS)
    expect(load.count7).toBe(1)   // la sortie à 3 j
    expect(load.acuteLoad).toBeGreaterThan(0)
  })

  it('2. la même activité rejouée 120 j plus tard n’a plus le même poids (sort de la fenêtre aiguë)', () => {
    const acts = [run(3), run(30), run(60)]
    const near = computeTrainingLoad(acts as never, 185, RACE_MS)
    const later = computeTrainingLoad(acts as never, 185, RACE_MS + 120 * DAY)
    expect(near.acuteLoad).not.toBe(later.acuteLoad)
    expect(later.count7).toBe(0) // plus rien dans les 7 j précédant la nouvelle référence
  })

  it('3. la charge aiguë utilise les 7 j précédant la COURSE, pas l’exécution du script', () => {
    // Système « aujourd'hui » très postérieur à la course (juillet) — ne doit rien changer.
    vi.useFakeTimers().setSystemTime(new Date('2026-07-16T12:00:00Z'))
    const acts = [run(5), run(40)]
    const load = computeTrainingLoad(acts as never, 185, RACE_MS)
    expect(load.count7).toBe(1)  // la sortie à 5 j de la course
    // Sans horloge historique (défaut = système juillet), la fenêtre 7 j serait vide.
    const leaked = computeTrainingLoad(acts as never, 185)
    expect(leaked.count7).toBe(0)
  })

  it('4. la charge chronique utilise les 42 j précédant la course', () => {
    const acts = [run(5), run(30), run(50)]
    const load = computeTrainingLoad(acts as never, 185, RACE_MS)
    expect(load.count42).toBe(2)  // 5 j et 30 j ; 50 j est hors fenêtre 42 j
  })

  it('6. deux exécutions à des dates système différentes → charge IDENTIQUE', () => {
    const acts = [run(3), run(10), run(25), run(38)]
    vi.useFakeTimers().setSystemTime(new Date('2026-03-20T00:00:00Z'))
    const a = computeTrainingLoad(acts as never, 185, RACE_MS)
    vi.setSystemTime(new Date('2026-11-01T00:00:00Z'))
    const b = computeTrainingLoad(acts as never, 185, RACE_MS)
    expect(a).toEqual(b)
  })

  it('6bis. le test de déterminisme échouerait sans asOfMs (ancienne implémentation)', () => {
    // Démonstration : sans date de référence, l'horloge système fuit dans le calcul.
    const acts = [run(3), run(10), run(25)]
    vi.useFakeTimers().setSystemTime(new Date('2026-03-20T00:00:00Z'))
    const a = computeTrainingLoad(acts as never, 185) // pas d'asOfMs → système
    vi.setSystemTime(new Date('2026-11-01T00:00:00Z'))
    const b = computeTrainingLoad(acts as never, 185)
    expect(a).not.toEqual(b) // preuve que l'horloge fuit sans injection
  })
})

describe('horloge historique — PR automatiques (récence vs course)', () => {
  const labeledRace = (daysBeforeRef: number) => ({
    type: 'Run', sport_type: 'Run', distance: 10000, moving_time: 2400,
    total_elevation_gain: 20, is_race: true,
    start_date: new Date(RACE_MS - daysBeforeRef * DAY).toISOString(),
  })

  it('5. les PR auto utilisent la récence relative à la course historique', () => {
    // Course étiquetée 3 mois avant la référence → exploitable.
    const near = deriveAutoPrs([labeledRace(90)], RACE_MS)
    expect(near?.['10k']).toBeTruthy()
    // La MÊME course, vue depuis une référence 20 mois plus tard → couperet 18 mois.
    const far = deriveAutoPrs([labeledRace(90)], RACE_MS + 20 * 30.44 * DAY)
    expect(far).toBeNull()
  })
})

describe('horloge historique — projection moteur & parité', () => {
  // Tracé trail vallonné ~10 km (D+/km > 20 → branche trail, récence pondérée).
  function trailTrack(): GpxPoint[] {
    const pts: GpxPoint[] = []
    for (let i = 0; i < 100; i++) pts.push({ lat: 45, lon: 6 + i * 0.00127, ele: 1000 + 120 * Math.sin(i / 8) })
    return pts
  }
  const trailRun = (daysBefore: number, speed: number): Record<string, unknown> => ({
    type: 'TrailRun', sport_type: 'TrailRun', distance: 12000, moving_time: Math.round(12000 / speed),
    total_elevation_gain: 450, average_speed: speed, average_heartrate: 150, max_heartrate: 185,
    start_date: new Date(RACE_MS - daysBefore * DAY).toISOString(), is_race: false,
  })
  // Une sortie RAPIDE récente + une LENTE ancienne : la récence (demi-vie ~60 j)
  // les pondère différemment selon la date de référence.
  const acts = [trailRun(5, 3.0), trailRun(100, 2.0)]
  const profile = { fc_max: 185 }

  it('la date de référence influence réellement la projection (récence trail)', () => {
    const atRace = computeRaceProjection(trailTrack(), acts as never, profile, { type: 'TrailRun' }, null, { asOfMs: RACE_MS })
    const long = computeRaceProjection(trailTrack(), acts as never, profile, { type: 'TrailRun' }, null, { asOfMs: RACE_MS + 300 * DAY })
    // À la course, la sortie rapide (5 j) pèse fort ; 300 j plus tard les poids
    // s'égalisent → l'allure de base ralentit → projection plus lente.
    expect(Math.round(atRace.estTimeS)).not.toBe(Math.round(long.estTimeS))
  })

  it('7. web et mobile produisent une projection IDENTIQUE à date de référence égale', () => {
    const web = computeRaceProjection(trailTrack(), acts as never, profile, { type: 'TrailRun' }, null, { asOfMs: RACE_MS })
    const mob = mobileProjection(trailTrack() as never, acts as never, profile as never, { type: 'TrailRun' }, null, { asOfMs: RACE_MS })
    expect(web.estTimeS).toBe(mob.estTimeS)
    expect(web.timeMin).toBe(mob.timeMin)
    expect(web.timeMax).toBe(mob.timeMax)
    expect(web.confidence).toBe(mob.confidence)
    expect(web.usedFallback).toBe(mob.usedFallback)
  })

  it('production sans asOfMs : comportement inchangé (pas de régression)', () => {
    // Deux appels sans contexte à la même seconde système → mêmes chiffres.
    vi.useFakeTimers().setSystemTime(new Date('2026-07-16T09:00:00Z'))
    const a = computeRaceProjection(trailTrack(), acts as never, profile, { type: 'TrailRun' }, null)
    const b = computeRaceProjection(trailTrack(), acts as never, profile, { type: 'TrailRun' }, null)
    expect(a.estTimeS).toBe(b.estTimeS)
  })
})
