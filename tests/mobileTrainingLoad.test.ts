// Tests MOBILE réels (§7) — exercent le code de `mobile/src/lib` et verrouillent la parité
// avec le web ainsi que les libellés de statut renommés (§8) côté mobile.
import { describe, it, expect } from 'vitest'
import {
  getTsbZone as mobileTsbZone,
  classifySport as mobileClassify,
  computeActivityLoad as mobileLoad,
  type ActivityForLoad,
} from '../mobile/src/lib/trainingLoad'
import {
  getTsbZone as webTsbZone,
  classifySport as webClassify,
  computeActivityLoad as webLoad,
} from '../src/lib/trainingLoad'

describe('mobile trainingLoad (§7 — vrais tests mobile)', () => {
  it('getTsbZone : seuils et libellés (dont FORME EN BAISSE renommé §8)', () => {
    expect(mobileTsbZone(-40).key).toBe('surcharge')
    expect(mobileTsbZone(-20).key).toBe('optimal')
    expect(mobileTsbZone(0).key).toBe('maintien')
    expect(mobileTsbZone(15).key).toBe('recuperation')
    const detrained = mobileTsbZone(40)
    expect(detrained.key).toBe('desentrainement')
    // §8 : libellé moins catégorique (plus « DÉSENTRAÎNEMENT »).
    expect(detrained.label).toBe('FORME EN BAISSE')
  })

  it('parité web/mobile de getTsbZone sur toute la plage TSB', () => {
    for (let tsb = -60; tsb <= 60; tsb += 5) {
      expect(mobileTsbZone(tsb)).toEqual(webTsbZone(tsb))
    }
  })

  it('classifySport : parité web/mobile (course, vélo, renfo)', () => {
    for (const t of ['Run', 'TrailRun', 'Ride', 'WeightTraining', 'Swim']) {
      expect(mobileClassify(t)).toEqual(webClassify(t))
    }
  })

  it('computeActivityLoad : déterministe et identique au web', () => {
    const act: ActivityForLoad = {
      type: 'Run', sport_type: 'Run', moving_time: 3600,
      distance: 10000, average_heartrate: 150, total_elevation_gain: 100,
    } as ActivityForLoad
    const m = mobileLoad(act, 190)
    expect(m).toBeGreaterThan(0)
    expect(m).toBe(webLoad(act, 190))
  })
})
