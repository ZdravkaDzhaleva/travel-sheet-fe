import { describe, it, expect } from 'vitest';
import {
  hasNoDestination,
  targetAlreadyMet,
  wouldOverconsume,
  weeklyMinimumsStillSatisfiable,
  isZeroTripDay,
  type ZeroTripContext,
} from './zero-trip-rules';
import { BALANCE_MIN } from '../../core/config/generation.config';

// These helpers take an explicit [min, max] window, so the tests supply a fixed
// upper bound to exercise the boundary logic independently of any config value.
const BALANCE_MAX = 8;

describe('hasNoDestination', () => {
  it('returns true for an empty stops array', () => {
    expect(hasNoDestination([])).toBe(true);
  });

  it('returns false when at least one stop is assigned', () => {
    expect(hasNoDestination([2])).toBe(false);
    expect(hasNoDestination([2, 5])).toBe(false);
  });
});

describe('targetAlreadyMet', () => {
  it('returns true when projected closing lands inside [min, max]', () => {
    // balance 3 + remaining 4 = 7, inside [0, 8]
    expect(targetAlreadyMet(3, 4, BALANCE_MIN, BALANCE_MAX)).toBe(true);
  });

  it('returns false when projected closing is above max', () => {
    // balance 5 + remaining 10 = 15, above 8
    expect(targetAlreadyMet(5, 10, BALANCE_MIN, BALANCE_MAX)).toBe(false);
  });

  it('returns false when projected closing is below min', () => {
    // balance -1 + remaining 0 = -1, below 0 (impossible but defensive)
    expect(targetAlreadyMet(-1, 0, BALANCE_MIN, BALANCE_MAX)).toBe(false);
  });

  it('treats the boundary values inclusively', () => {
    expect(targetAlreadyMet(0, 0, BALANCE_MIN, BALANCE_MAX)).toBe(true);
    expect(targetAlreadyMet(8, 0, BALANCE_MIN, BALANCE_MAX)).toBe(true);
    expect(targetAlreadyMet(0, 8, BALANCE_MIN, BALANCE_MAX)).toBe(true);
  });
});

describe('wouldOverconsume', () => {
  it('returns false when the trip leaves the balance non-negative', () => {
    // 10 - 6 = 4 → not overconsume
    expect(wouldOverconsume(10, 50, 12, BALANCE_MIN)).toBe(false);
  });

  it('returns true when the trip would push balance below min', () => {
    // 5 - 12 = -7 → overconsume
    expect(wouldOverconsume(5, 100, 12, BALANCE_MIN)).toBe(true);
  });

  it('treats a trip that lands exactly on balanceMin as not overconsuming', () => {
    // 12 - 12 = 0 → equals min, not below
    expect(wouldOverconsume(12, 100, 12, BALANCE_MIN)).toBe(false);
  });

  it('uses the supplied balanceMin (not a hardcoded 0)', () => {
    // 10 - 6 = 4, with balanceMin=5 → 4 < 5 → overconsume
    expect(wouldOverconsume(10, 50, 12, 5)).toBe(true);
  });
});

describe('weeklyMinimumsStillSatisfiable', () => {
  it('returns true when skipping today still leaves enough days for pending visits', () => {
    // 5 remaining days, 2 visits needed → skipping today leaves 4 days ≥ 2
    expect(weeklyMinimumsStillSatisfiable(5, 2)).toBe(true);
  });

  it('returns false when skipping today would leave too few days', () => {
    // 2 remaining, 3 needed → skip leaves 1 day < 3
    expect(weeklyMinimumsStillSatisfiable(2, 3)).toBe(false);
  });

  it('returns true when there are no pending visits', () => {
    expect(weeklyMinimumsStillSatisfiable(1, 0)).toBe(true);
    expect(weeklyMinimumsStillSatisfiable(0, 0)).toBe(false); // -1 < 0
  });

  it('returns false when today is the last day and a visit is still pending', () => {
    // 1 remaining (today), 1 needed → 0 < 1 → must drive today
    expect(weeklyMinimumsStillSatisfiable(1, 1)).toBe(false);
  });
});

describe('isZeroTripDay (composition)', () => {
  // Baseline: no zero-trip triggers fire — a normal driving day.
  const baseline: ZeroTripContext = {
    stopIds: [2, 5],
    currentBalance: 10,
    remainingFuelLiters: 0,
    candidateKm: 50,
    avg: 12,
    balanceMin: BALANCE_MIN,
    balanceMax: BALANCE_MAX,
    remainingWorkingDays: 3,
    pendingVisits: 3, // skipping today leaves 2 days < 3 → can't skip
  };

  it('returns false when no trigger fires', () => {
    expect(isZeroTripDay(baseline)).toBe(false);
  });

  it('fires on "no destination" alone', () => {
    expect(isZeroTripDay({ ...baseline, stopIds: [] })).toBe(true);
  });

  it('fires on "target already met" alone', () => {
    // Projected = 5 + 0 = 5 ∈ [0,8]
    expect(
      isZeroTripDay({ ...baseline, currentBalance: 5, remainingFuelLiters: 0 }),
    ).toBe(true);
  });

  it('fires on "would overconsume" alone', () => {
    // Need: target NOT met AND overconsume triggers.
    // currentBalance=2, remainingFuel=20 → projected=22 (target NOT met).
    // candidate trip: 100 km × 12 = 12 L → 2-12 = -10 < 0 → overconsume.
    expect(
      isZeroTripDay({
        ...baseline,
        currentBalance: 2,
        remainingFuelLiters: 20,
        candidateKm: 100,
      }),
    ).toBe(true);
  });

  it('fires on "weekly minimums still satisfiable" alone', () => {
    // remainingWorkingDays=10, pendingVisits=2 → 9 ≥ 2, can skip today
    expect(
      isZeroTripDay({
        ...baseline,
        remainingWorkingDays: 10,
        pendingVisits: 2,
      }),
    ).toBe(true);
  });

  it('short-circuits: returns true if any trigger fires (no destination)', () => {
    // Multiple triggers — still true. Documents OR semantics.
    expect(
      isZeroTripDay({
        ...baseline,
        stopIds: [],
        currentBalance: 100, // also overconsume risk
      }),
    ).toBe(true);
  });
});
