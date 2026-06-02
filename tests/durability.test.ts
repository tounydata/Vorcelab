import { describe, it, expect } from 'vitest'
import { computeDecoupling, durabilityStatus } from '../src/lib/durability'

function streams(hr: number[], vel: number[]) {
  return { heartrate: { data: hr }, velocity_smooth: { data: vel } }
}
/** Construit une sortie : 1re moitié (hr1,v1) puis 2e moitié (hr2,v2), len échantillons chacune. */
function run(len: number, hr1: number, v1: number, hr2: number, v2: number) {
  const hr = [...Array(len).fill(hr1), ...Array(len).fill(hr2)]
  const vel = [...Array(len).fill(v1), ...Array(len).fill(v2)]
  return streams(hr, vel)
}

describe('durabilityStatus', () => {
  it('seuils 5 / 10 %', () => {
    expect(durabilityStatus(3)).toBe('strong')
    expect(durabilityStatus(8)).toBe('moderate')
    expect(durabilityStatus(14)).toBe('deficit')
    expect(durabilityStatus(null)).toBe('unknown')
  })
})

describe('computeDecoupling', () => {
  it('FC stable à allure stable → découplage ~0 (bonne durabilité)', () => {
    const r = computeDecoupling(run(400, 150, 4, 150, 4))!
    expect(r.decouplingPct).toBeCloseTo(0, 1)
    expect(r.status).toBe('strong')
  })

  it('FC qui monte à allure constante → découplage positif (déficit possible)', () => {
    // ef1 = 4/150, ef2 = 4/170 → ~11.8 %
    const r = computeDecoupling(run(400, 150, 4, 170, 4))!
    expect(r.decouplingPct).toBeGreaterThan(10)
    expect(r.status).toBe('deficit')
  })

  it('découplage modéré 5-10 %', () => {
    // 4/150 vs 4/162 → ~7.4 %
    const r = computeDecoupling(run(400, 150, 4, 162, 4))!
    expect(r.status).toBe('moderate')
  })

  it('null si données insuffisantes (trop court ou sans vitesse)', () => {
    expect(computeDecoupling(run(50, 150, 4, 150, 4))).toBeNull()
    expect(computeDecoupling({ heartrate: { data: Array(2000).fill(150) } })).toBeNull()
  })
})
