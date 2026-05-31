import { vi, describe, it, expect } from 'vitest';

vi.mock('../legacy/app-state.js', () => ({
  FC_MAX_DEFAULT: 205,
  VLState: { currentUser: null, userProfile: { pain_zones: [] }, allActivities: [], historyActivities: [], races: [] },
  sb: {},
}));

import { computeActivityLoad, computeTrainingLoad, getLoadStatus } from '../legacy/training-load.js';

// ─── computeActivityLoad ──────────────────────────────────────────────────────

describe('computeActivityLoad', () => {
  it('returns 0 for activities shorter than 5 minutes', () => {
    expect(computeActivityLoad({ moving_time: 240, sport_type: 'Run' }, 200)).toBe(0);
  });

  it('returns 0 for moving_time 0', () => {
    expect(computeActivityLoad({ moving_time: 0, sport_type: 'Run' }, 200)).toBe(0);
  });

  it('uses pace-based intensity for Run without HR (30 min, no distance)', () => {
    // pace = 0 → else branch → intensity 2.5; elev=1.0; typeFactor=1.0
    const load = computeActivityLoad({ moving_time: 1800, sport_type: 'Run' }, 205);
    expect(load).toBe(75); // Math.round(30 * 2.5)
  });

  it('uses HR-based Z4 intensity (z=0.82) for 60-min run', () => {
    // z = 164/200 = 0.82 → intensity 4.5
    const load = computeActivityLoad({ moving_time: 3600, sport_type: 'Run', average_heartrate: 164, distance: 10000 }, 200);
    expect(load).toBe(270); // Math.round(60 * 4.5)
  });

  it('applies elevation bonus (>=40 D+/km) for TrailRun', () => {
    // 2h TrailRun, 20km, 1600m D+ → dpKm=80 → elev=1.30; typeFactor=1.05; intensity=3.0
    const load = computeActivityLoad({ moving_time: 7200, sport_type: 'TrailRun', distance: 20000, total_elevation_gain: 1600 }, 205);
    expect(load).toBe(491); // Math.round(120 * 3.0 * 1.30 * 1.05)
  });

  it('no elevation bonus when distance is 0', () => {
    const load = computeActivityLoad({ moving_time: 1800, sport_type: 'Run', distance: 0 }, 205);
    expect(load).toBe(75);
  });

  it('uses TrailRun pace-intensity 3.0 when no HR and moderate pace', () => {
    // TrailRun, 60 min, 10km (pace 360 s/km), no HR
    // TRAIL_TYPES branch → intensity=3.0; typeFactor=1.05
    const load = computeActivityLoad({ moving_time: 3600, sport_type: 'TrailRun', distance: 10000 }, 205);
    expect(load).toBe(189); // Math.round(60 * 3.0 * 1.05)
  });
});

// ─── computeTrainingLoad ──────────────────────────────────────────────────────

describe('computeTrainingLoad', () => {
  it('returns zero loads and null ratio for empty activity list', () => {
    const result = computeTrainingLoad([], 205);
    expect(result.acuteLoad).toBe(0);
    expect(result.chronicLoad).toBe(0);
    expect(result.ratio).toBeNull();
    expect(result.count7).toBe(0);
    expect(result.count42).toBe(0);
  });

  it('returns null ratio when there are no chronic activities', () => {
    const result = computeTrainingLoad(null, 205);
    expect(result.ratio).toBeNull();
  });

  it('filters out non-run activities', () => {
    const activities = [
      { sport_type: 'Ride', start_date: new Date().toISOString(), moving_time: 3600, distance: 30000 },
    ];
    const result = computeTrainingLoad(activities, 205);
    expect(result.count42).toBe(0);
  });
});

// ─── getLoadStatus ────────────────────────────────────────────────────────────

describe('getLoadStatus', () => {
  it('returns code unknown for null', () =>
    expect(getLoadStatus(null).code).toBe('unknown'));

  it('returns code unknown for undefined', () =>
    expect(getLoadStatus(undefined).code).toBe('unknown'));

  it('returns code recovery for ratio 0.5 (below 0.80)', () =>
    expect(getLoadStatus(0.5).code).toBe('recovery'));

  it('returns code stable for ratio 1.0 (within 0.80–1.30)', () =>
    expect(getLoadStatus(1.0).code).toBe('stable'));

  it('returns code stable at boundary 0.80', () =>
    expect(getLoadStatus(0.80).code).toBe('stable'));

  it('returns code stable at boundary 1.30', () =>
    expect(getLoadStatus(1.30).code).toBe('stable'));

  it('returns code elevated for ratio 1.4 (1.30 < r ≤ 1.50)', () =>
    expect(getLoadStatus(1.4).code).toBe('elevated'));

  it('returns code overload for ratio 1.6 (above 1.50)', () =>
    expect(getLoadStatus(1.6).code).toBe('overload'));
});
