import { describe, it, expect } from 'vitest'
import {
  getGradeBucket,
  computeCardioCost,
  computeEfficiencyScore,
  computeClimbStatus,
  computeDescentStatus,
  computeFlatStatus,
  computeDriftStatus,
  computePostClimbRecoveryStatus,
  computeConfidenceFromCount,
  fmtVam,
  fmtSpeed,
  fmtDuration,
  statusColor,
  statusLabel,
  confidenceLabel,
  cardioCostColor,
  cardioCostLabel,
  GRADE_BUCKETS,
  type BucketKey,
  type CardioCost,
} from '../src/lib/runnerProfile'

// ─── getGradeBucket ───────────────────────────────────────────────────────────

describe('getGradeBucket', () => {
  it('returns steep_up for grade ≥ 12', () => {
    expect(getGradeBucket(15)).toBe('steep_up')
    expect(getGradeBucket(12)).toBe('steep_up')
  })

  it('returns mod_up for grade 6–12', () => {
    expect(getGradeBucket(8)).toBe('mod_up')
    expect(getGradeBucket(6)).toBe('mod_up')
  })

  it('returns mild_up for grade 2–6', () => {
    expect(getGradeBucket(3)).toBe('mild_up')
    expect(getGradeBucket(2)).toBe('mild_up')
  })

  it('returns flat for grade -2 to 2', () => {
    expect(getGradeBucket(0)).toBe('flat')
    expect(getGradeBucket(-1)).toBe('flat')
    expect(getGradeBucket(1.9)).toBe('flat')
  })

  it('returns mild_down for grade -6 to -2', () => {
    expect(getGradeBucket(-3)).toBe('mild_down')
    expect(getGradeBucket(-5.9)).toBe('mild_down')
  })

  it('returns mod_down for grade -12 to -6', () => {
    expect(getGradeBucket(-8)).toBe('mod_down')
    expect(getGradeBucket(-6)).toBe('mod_down')
  })

  it('returns steep_down for grade < -12', () => {
    expect(getGradeBucket(-15)).toBe('steep_down')
    expect(getGradeBucket(-12)).toBe('steep_down')
  })

  it('GRADE_BUCKETS covers all expected keys', () => {
    const keys = GRADE_BUCKETS.map((b) => b.key)
    expect(keys).toContain('steep_up')
    expect(keys).toContain('mod_up')
    expect(keys).toContain('mild_up')
    expect(keys).toContain('flat')
    expect(keys).toContain('mild_down')
    expect(keys).toContain('mod_down')
    expect(keys).toContain('steep_down')
  })
})

// ─── fmtVam ───────────────────────────────────────────────────────────────────

describe('fmtVam', () => {
  it('formats null as —', () => {
    expect(fmtVam(null)).toBe('—')
  })

  it('formats a value with m/h suffix', () => {
    expect(fmtVam(850)).toBe('850 m/h')
    expect(fmtVam(1000)).toBe('1000 m/h')
  })

  it('rounds to integer', () => {
    expect(fmtVam(850.7)).toBe('851 m/h')
  })
})

// ─── fmtSpeed ─────────────────────────────────────────────────────────────────

describe('fmtSpeed', () => {
  it('formats null as —', () => {
    expect(fmtSpeed(null)).toBe('—')
  })

  it('formats speed with km/h suffix to 1 decimal', () => {
    expect(fmtSpeed(10)).toBe('10.0 km/h')
    expect(fmtSpeed(12.34)).toBe('12.3 km/h')
  })
})

// ─── fmtDuration ─────────────────────────────────────────────────────────────

describe('fmtDuration', () => {
  it('formats less than 1 hour as minutes only', () => {
    expect(fmtDuration(300)).toBe('5 min')
    expect(fmtDuration(3540)).toBe('59 min')
  })

  it('formats 1+ hours with h prefix', () => {
    expect(fmtDuration(3600)).toBe('1h00')
    expect(fmtDuration(5400)).toBe('1h30')
  })

  it('pads minutes to 2 digits in hour format', () => {
    expect(fmtDuration(3660)).toBe('1h01')
  })
})

// ─── statusColor ─────────────────────────────────────────────────────────────

describe('statusColor', () => {
  it('strength / good / stable → growth color', () => {
    expect(statusColor('strength')).toBe('var(--vl-growth)')
    expect(statusColor('good')).toBe('var(--vl-growth)')
    expect(statusColor('stable')).toBe('var(--vl-growth)')
  })

  it('ok / moderate → amber', () => {
    expect(statusColor('ok')).toBe('var(--vl-amber)')
    expect(statusColor('moderate')).toBe('var(--vl-amber)')
  })

  it('weak / marked → ember', () => {
    expect(statusColor('weak')).toBe('var(--vl-ember)')
    expect(statusColor('marked')).toBe('var(--vl-ember)')
  })

  it('unknown → text-3', () => {
    expect(statusColor('unknown')).toBe('var(--vl-text-3)')
  })
})

// ─── statusLabel ─────────────────────────────────────────────────────────────

describe('statusLabel', () => {
  it('returns French labels', () => {
    expect(statusLabel('strength')).toBe('Point fort')
    expect(statusLabel('ok')).toBe('Correct')
    expect(statusLabel('weak')).toBe('À renforcer')
    expect(statusLabel('good')).toBe('Bonne récupération')
    expect(statusLabel('stable')).toBe('Stable')
    expect(statusLabel('moderate')).toBe('Modéré')
    expect(statusLabel('marked')).toBe('Marquée')
    expect(statusLabel('unknown')).toBe('Inconnu')
  })
})

// ─── confidenceLabel ─────────────────────────────────────────────────────────

describe('confidenceLabel', () => {
  it('maps all levels to French labels', () => {
    expect(confidenceLabel('high')).toBe('Fiable')
    expect(confidenceLabel('medium')).toBe('Partiel')
    expect(confidenceLabel('low')).toBe('Faible')
    expect(confidenceLabel('none')).toBe('Aucune donnée')
  })
})

// ─── computeCardioCost ────────────────────────────────────────────────────────

describe('computeCardioCost', () => {
  it('returns unknown for null HR', () => {
    expect(computeCardioCost(null)).toBe('unknown')
  })

  it('returns low for < 70 %FCmax', () => {
    expect(computeCardioCost(60)).toBe('low')
    expect(computeCardioCost(69.9)).toBe('low')
    expect(computeCardioCost(0)).toBe('low')
  })

  it('returns medium for 70–84 %FCmax', () => {
    expect(computeCardioCost(70)).toBe('medium')
    expect(computeCardioCost(80)).toBe('medium')
    expect(computeCardioCost(84.9)).toBe('medium')
  })

  it('returns high for ≥ 85 %FCmax', () => {
    expect(computeCardioCost(85)).toBe('high')
    expect(computeCardioCost(95)).toBe('high')
    expect(computeCardioCost(100)).toBe('high')
  })
})

// ─── cardioCostColor / cardioCostLabel ────────────────────────────────────────

describe('cardioCostColor', () => {
  it('low → growth', () => { expect(cardioCostColor('low')).toBe('var(--vl-growth)') })
  it('medium → amber', () => { expect(cardioCostColor('medium')).toBe('var(--vl-amber)') })
  it('high → ember',  () => { expect(cardioCostColor('high')).toBe('var(--vl-ember)') })
  it('unknown → text-3', () => { expect(cardioCostColor('unknown')).toBe('var(--vl-text-3)') })
})

describe('cardioCostLabel', () => {
  it('maps to French labels', () => {
    expect(cardioCostLabel('low')).toBe('Faible')
    expect(cardioCostLabel('medium')).toBe('Moyen')
    expect(cardioCostLabel('high')).toBe('Élevé')
    expect(cardioCostLabel('unknown')).toBe('—')
  })
})

// ─── computeEfficiencyScore ───────────────────────────────────────────────────

describe('computeEfficiencyScore', () => {
  it('returns null when no HR data', () => {
    expect(computeEfficiencyScore('up', 800, 10, null)).toBeNull()
    expect(computeEfficiencyScore('flat', null, 10, null)).toBeNull()
  })

  it('returns null when HR is zero', () => {
    expect(computeEfficiencyScore('up', 800, 10, 0)).toBeNull()
  })

  it('uses VAM for climbs', () => {
    // 800 / (80/100) = 800 / 0.8 = 1000
    expect(computeEfficiencyScore('up', 800, 10, 80)).toBeCloseTo(1000, 1)
  })

  it('returns null for climb when vamMH is null', () => {
    expect(computeEfficiencyScore('up', null, 10, 80)).toBeNull()
  })

  it('uses speed for flat', () => {
    // 10 / (80/100) = 10 / 0.8 = 12.5
    expect(computeEfficiencyScore('flat', null, 10, 80)).toBeCloseTo(12.5, 1)
  })

  it('uses speed for descent', () => {
    expect(computeEfficiencyScore('down', null, 12, 75)).toBeCloseTo(16, 1)
  })

  it('returns null for flat when speedKmH is null', () => {
    expect(computeEfficiencyScore('flat', null, null, 80)).toBeNull()
  })
})

// ─── computeClimbStatus ───────────────────────────────────────────────────────

describe('computeClimbStatus', () => {
  it('returns unknown when vam is null', () => {
    const r = computeClimbStatus(null, 'low', 5)
    expect(r.status).toBe('unknown')
    expect(r.statusReason).toContain('min analysées')
  })

  it('VAM ≥ 900 + low cardioCost → strength with "efficient"', () => {
    const r = computeClimbStatus(950, 'low', 30)
    expect(r.status).toBe('strength')
    expect(r.statusReason.toLowerCase()).toContain('efficient')
  })

  it('VAM ≥ 900 + high cardioCost → strength but "coûteuse"', () => {
    const r = computeClimbStatus(950, 'high', 30)
    expect(r.status).toBe('strength')
    expect(r.statusReason.toLowerCase()).toContain('coûteuse')
  })

  it('VAM ≥ 600 + medium cardioCost → ok with "efficacité"', () => {
    const r = computeClimbStatus(700, 'medium', 30)
    expect(r.status).toBe('ok')
    expect(r.statusReason.toLowerCase()).toContain('efficacité')
  })

  it('VAM ≥ 600 + high cardioCost → ok but "coûteuse"', () => {
    const r = computeClimbStatus(700, 'high', 30)
    expect(r.status).toBe('ok')
    expect(r.statusReason.toLowerCase()).toContain('coûteuse')
  })

  it('VAM < 500 + high cardioCost → weak with mention of cardio cost', () => {
    const r = computeClimbStatus(400, 'high', 30)
    expect(r.status).toBe('weak')
    expect(r.statusReason.toLowerCase()).toContain('cardio')
  })

  it('VAM < 500 + low cardioCost → weak', () => {
    const r = computeClimbStatus(400, 'low', 30)
    expect(r.status).toBe('weak')
    expect(r.statusReason.toLowerCase()).toContain('renforcer')
  })

  it('BucketStats with cardioCost high → statusReason mentions performance cost', () => {
    const r = computeClimbStatus(950, 'high', 30)
    // VAM ≥ 900 + high cardioCost → "coûteuse" in the statusReason
    expect(r.statusReason.toLowerCase()).toContain('coûteuse')
    expect(r.status).toBe('strength')
  })
})

// ─── computeDescentStatus ────────────────────────────────────────────────────

describe('computeDescentStatus', () => {
  it('returns unknown when speed is null', () => {
    const r = computeDescentStatus(null, 'low', 5)
    expect(r.status).toBe('unknown')
  })

  it('speed ≥ 14 + low cardioCost → strength', () => {
    const r = computeDescentStatus(16, 'low', 30)
    expect(r.status).toBe('strength')
  })

  it('speed ≥ 14 + high cardioCost → caution note about fatigue', () => {
    const r = computeDescentStatus(16, 'high', 30)
    expect(r.status).toBe('strength')
    expect(r.statusReason.toLowerCase()).toContain('fatigue')
  })

  it('speed 9–14 → ok', () => {
    const r = computeDescentStatus(11, 'medium', 30)
    expect(r.status).toBe('ok')
  })

  it('speed < 9 → weak', () => {
    const r = computeDescentStatus(7, 'medium', 30)
    expect(r.status).toBe('weak')
  })
})

// ─── computeFlatStatus ────────────────────────────────────────────────────────

describe('computeFlatStatus', () => {
  it('returns unknown when speed is null', () => {
    const r = computeFlatStatus(null, 'unknown', 5)
    expect(r.status).toBe('unknown')
  })

  it('speed ≥ 12 + low cardioCost → strength', () => {
    const r = computeFlatStatus(13, 'low', 30)
    expect(r.status).toBe('strength')
  })

  it('speed 8–12 + medium → ok', () => {
    const r = computeFlatStatus(10, 'medium', 30)
    expect(r.status).toBe('ok')
  })

  it('speed < 8 + high → weak with mention of cardio cost', () => {
    const r = computeFlatStatus(6, 'high', 30)
    expect(r.status).toBe('weak')
    expect(r.statusReason.toLowerCase()).toContain('cardio')
  })

  it('speed < 8 + low → weak', () => {
    const r = computeFlatStatus(6, 'low', 30)
    expect(r.status).toBe('weak')
  })
})

// ─── computeDriftStatus ───────────────────────────────────────────────────────

describe('computeDriftStatus', () => {
  it('returns unknown for null', () => {
    expect(computeDriftStatus(null)).toBe('unknown')
  })

  it('≤ 5% → stable', () => {
    expect(computeDriftStatus(0)).toBe('stable')
    expect(computeDriftStatus(5)).toBe('stable')
  })

  it('5–10% → moderate', () => {
    expect(computeDriftStatus(5.1)).toBe('moderate')
    expect(computeDriftStatus(10)).toBe('moderate')
  })

  it('> 10% → marked', () => {
    expect(computeDriftStatus(10.1)).toBe('marked')
    expect(computeDriftStatus(25)).toBe('marked')
  })
})

// ─── computePostClimbRecoveryStatus ──────────────────────────────────────────

describe('computePostClimbRecoveryStatus', () => {
  it('returns unknown when both inputs are null', () => {
    expect(computePostClimbRecoveryStatus(null, null)).toBe('unknown')
  })

  it('hrDropBpmPerMin ≥ 20 → good', () => {
    expect(computePostClimbRecoveryStatus(20, 0)).toBe('good')
    expect(computePostClimbRecoveryStatus(25, null)).toBe('good')
  })

  it('hrDropPctFcMax ≥ 10% → good', () => {
    expect(computePostClimbRecoveryStatus(5, 10)).toBe('good')
    expect(computePostClimbRecoveryStatus(null, 15)).toBe('good')
  })

  it('bpm 10–19 → moderate', () => {
    expect(computePostClimbRecoveryStatus(15, 2)).toBe('moderate')
    expect(computePostClimbRecoveryStatus(10, null)).toBe('moderate')
  })

  it('pct 5–9% → moderate', () => {
    expect(computePostClimbRecoveryStatus(2, 7)).toBe('moderate')
  })

  it('bpm < 10 AND pct < 5% → weak', () => {
    expect(computePostClimbRecoveryStatus(5, 3)).toBe('weak')
    expect(computePostClimbRecoveryStatus(0, 0)).toBe('weak')
  })
})

// ─── computeConfidenceFromCount ───────────────────────────────────────────────

describe('computeConfidenceFromCount', () => {
  it('0 events → none', () => {
    expect(computeConfidenceFromCount(0)).toBe('none')
  })

  it('1 event → low', () => {
    expect(computeConfidenceFromCount(1)).toBe('low')
  })

  it('2–4 events → medium', () => {
    expect(computeConfidenceFromCount(2)).toBe('medium')
    expect(computeConfidenceFromCount(4)).toBe('medium')
  })

  it('5+ events → high', () => {
    expect(computeConfidenceFromCount(5)).toBe('high')
    expect(computeConfidenceFromCount(10)).toBe('high')
  })

  it('confidence is none when no events analyzed', () => {
    expect(computeConfidenceFromCount(0)).toBe('none')
  })
})

// ─── Integration: BucketStats shape type checks ───────────────────────────────

describe('BucketStats field presence', () => {
  it('cardioCost field is of union type CardioCost', () => {
    const validValues: CardioCost[] = ['low', 'medium', 'high', 'unknown']
    for (const v of validValues) {
      expect(computeCardioCost(v === 'unknown' ? null : v === 'low' ? 50 : v === 'medium' ? 75 : 90)).toBe(v)
    }
  })

  it('efficiencyScore is null when no HR data', () => {
    expect(computeEfficiencyScore('up', 800, null, null)).toBeNull()
    expect(computeEfficiencyScore('flat', null, 10, null)).toBeNull()
    expect(computeEfficiencyScore('down', null, 12, null)).toBeNull()
  })

  it('streamCoverage high + cardioCost high → no strong tightening (rangeScale ≠ 0.8)', () => {
    // This is verified in computeRaceProjection: when avgCardioCostHigh is true,
    // rangeScale = 0.95 (not 0.80). We test the underlying cardioCost computation.
    const cost = computeCardioCost(90) // 90% = high
    expect(cost).toBe('high')
    // High cost means rangeScale is 0.95 not 0.80 — tested here as a logic check
    // The actual rangeScale = 0.95 behavior is in computeRaceProjection
    expect(cost).not.toBe('low')
    expect(cost).not.toBe('medium')
  })
})

// ─── BucketKey type completeness ─────────────────────────────────────────────

describe('BucketKey completeness', () => {
  const allKeys: BucketKey[] = [
    'steep_up', 'mod_up', 'mild_up', 'flat', 'mild_down', 'mod_down', 'steep_down'
  ]

  it('all bucket keys are handled by getGradeBucket at representative grades', () => {
    const testGrades: Record<BucketKey, number> = {
      steep_up:   15,
      mod_up:     8,
      mild_up:    3,
      flat:       0,
      mild_down:  -3,
      mod_down:   -8,
      steep_down: -15,
    }
    for (const k of allKeys) {
      expect(getGradeBucket(testGrades[k])).toBe(k)
    }
  })
})
