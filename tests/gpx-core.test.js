import { vi, describe, it, expect } from 'vitest';

vi.mock('../app-state.js', () => ({
  FC_MAX_DEFAULT: 205,
  VLState: { currentRaceContext: null },
  sb: {},
}));

import { hav, minettiGradePenalty, buildDetailedSections } from '../gpx-core.js';

// ─── hav (haversine distance) ─────────────────────────────────────────────────

describe('hav', () => {
  it('returns 0 for identical points', () => {
    expect(hav({ lat: 48.8566, lon: 2.3522 }, { lat: 48.8566, lon: 2.3522 })).toBe(0);
  });

  it('returns ~111 km for 1° latitude difference at equator', () => {
    const d = hav({ lat: 0, lon: 0 }, { lat: 1, lon: 0 });
    // 1° lat ≈ 111 195 m at equator
    expect(d).toBeGreaterThan(111_000);
    expect(d).toBeLessThan(112_000);
  });

  it('is symmetric', () => {
    const p1 = { lat: 45.0, lon: 6.0 };
    const p2 = { lat: 45.1, lon: 6.1 };
    expect(hav(p1, p2)).toBeCloseTo(hav(p2, p1), 0);
  });

  it('gives ≈392 km Paris → Lyon', () => {
    const paris = { lat: 48.8566, lon: 2.3522 };
    const lyon  = { lat: 45.7640, lon: 4.8357 };
    const d = hav(paris, lyon);
    expect(d).toBeGreaterThan(389_000);
    expect(d).toBeLessThan(396_000);
  });
});

// ─── minettiGradePenalty ──────────────────────────────────────────────────────

describe('minettiGradePenalty', () => {
  it('returns 0 on flat ground (grade=0)', () => {
    expect(minettiGradePenalty(0)).toBeCloseTo(0, 5);
  });

  it('returns positive penalty on uphill (grade=0.10)', () => {
    expect(minettiGradePenalty(0.10)).toBeGreaterThan(0);
  });

  it('returns greater penalty for steeper uphill (grade=0.30 > grade=0.10)', () => {
    expect(minettiGradePenalty(0.30)).toBeGreaterThan(minettiGradePenalty(0.10));
  });

  it('returns negative (energy saving) on mild downhill (grade=-0.05)', () => {
    expect(minettiGradePenalty(-0.05)).toBeCloseTo(-0.125, 5); // -0.05 * 2.5
  });

  it('saving is max around -10% then cost rises for steeper downhill', () => {
    const at10 = minettiGradePenalty(-0.10);
    const at30 = minettiGradePenalty(-0.30);
    expect(at10).toBeLessThan(0); // still saving at -10%
    expect(at30).toBeGreaterThan(0); // braking cost at -30%
  });

  it('caps uphill grade at 0.50', () => {
    expect(minettiGradePenalty(0.50)).toBeCloseTo(minettiGradePenalty(0.60), 5);
  });
});

// ─── buildDetailedSections ───────────────────────────────────────────────────

describe('buildDetailedSections', () => {
  it('returns empty array for empty input', () => {
    expect(buildDetailedSections([])).toEqual([]);
  });

  it('returns a single flat section for a flat route', () => {
    const flat = [{ startKm: 0, km: 10, dist: 10000, dplus: 5, dminus: 5 }];
    const result = buildDetailedSections(flat);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('flat');
    expect(result[0].dist).toBe(10000);
  });

  it('detects up then down sections', () => {
    const course = [
      { startKm: 0,  km: 5,  dist: 5000, dplus: 300, dminus: 0 },
      { startKm: 5,  km: 10, dist: 5000, dplus: 0,   dminus: 300 },
    ];
    const result = buildDetailedSections(course);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0].type).toBe('up');
    expect(result[result.length - 1].type).toBe('down');
  });

  it('preserves total distance across all sections', () => {
    const course = [
      { startKm: 0,  km: 5,  dist: 5000, dplus: 200, dminus: 0 },
      { startKm: 5,  km: 10, dist: 5000, dplus: 0,   dminus: 100 },
      { startKm: 10, km: 15, dist: 5000, dplus: 0,   dminus: 100 },
    ];
    const result = buildDetailedSections(course);
    const totalDist = result.reduce((s, r) => s + r.dist, 0);
    expect(totalDist).toBe(15000);
  });

  it('merges consecutive flat sections', () => {
    // Two tiny climbs each below MIN_CHANGE (12m) → both become flat → merged
    const course = [
      { startKm: 0, km: 1, dist: 1000, dplus: 5, dminus: 5 },
      { startKm: 1, km: 2, dist: 1000, dplus: 5, dminus: 5 },
    ];
    const result = buildDetailedSections(course);
    const flats = result.filter(s => s.type === 'flat');
    // Consecutive flats merged: should be just 1 flat section (or the fallback 1 section)
    expect(flats.length).toBe(1);
  });

  it('uses endKm field when km is absent', () => {
    const course = [{ startKm: 0, endKm: 5, dist: 5000, dplus: 5, dminus: 5 }];
    const result = buildDetailedSections(course);
    expect(result[0].endKm).toBe(5);
  });
});
