import { describe, it, expect } from 'vitest';
import { fmtP, fmtD, fmtT, isRun } from '../formatters.js';

describe('fmtP (pace formatter — m/s → min:sec/km)', () => {
  it('returns -- for speed 0', () => expect(fmtP(0)).toBe('--'));
  it('returns -- for negative speed', () => expect(fmtP(-1)).toBe('--'));
  it('formats 5 m/s → 3:20/km', () => expect(fmtP(5)).toBe('3:20'));
  it('formats exactly 5:00/km (1000/300 m/s)', () => expect(fmtP(1000 / 300)).toBe('5:00'));
  it('formats 3.5 m/s → 4:46/km', () => expect(fmtP(3.5)).toBe('4:46'));
  it('pads seconds below 10 with leading zero', () => {
    // 1000/305 ≈ 3.279... m/s → 305 s/km → 5min 5sec
    expect(fmtP(1000 / 305)).toBe('5:05');
  });
});

describe('fmtD (duration formatter — seconds → h/min)', () => {
  it('formats 0 seconds as 0min', () => expect(fmtD(0)).toBe('0min'));
  it('formats 90 seconds as 1min', () => expect(fmtD(90)).toBe('1min'));
  it('formats exactly 1 hour', () => expect(fmtD(3600)).toBe('1h00'));
  it('formats 2h01 correctly', () => expect(fmtD(7265)).toBe('2h01'));
  it('pads minutes below 10', () => expect(fmtD(3660)).toBe('1h01'));
});

describe('fmtT (alias of fmtD)', () => {
  it('behaves identically to fmtD', () => {
    expect(fmtT(3600)).toBe(fmtD(3600));
    expect(fmtT(90)).toBe(fmtD(90));
  });
});

describe('isRun', () => {
  it('recognises Run', () => expect(isRun('Run')).toBe(true));
  it('recognises TrailRun', () => expect(isRun('TrailRun')).toBe(true));
  it('recognises Trail Run (with space)', () => expect(isRun('Trail Run')).toBe(true));
  it('recognises Running', () => expect(isRun('Running')).toBe(true));
  it('rejects Ride', () => expect(isRun('Ride')).toBe(false));
  it('rejects empty string', () => expect(isRun('')).toBe(false));
});
