import { describe, it, expect } from 'vitest';
import { legDistance, routeDistance } from './route-distance';
import { MissingRouteLegError } from './missing-route-leg.error';
import { makeRouteLegs } from '../../../test-fixtures/index';

// Location IDs from the fixture:
// 1=Борово(Office), 2=Козлодуй, 3=Оряхово, 4=Бяла Слатина, 5=Враца, 6=Плевен
const OFFICE = 1;
const KOZLODUY = 2;
const ORYAHOVO = 3;
const BYALA_SLATINA = 4;
const VRATSA = 5;
const PLEVEN = 6;

describe('legDistance', () => {
  const legs = makeRouteLegs();

  describe('undirected lookup', () => {
    it('returns the same distance for A→B and B→A', () => {
      expect(legDistance(OFFICE, KOZLODUY, legs)).toBe(35);
      expect(legDistance(KOZLODUY, OFFICE, legs)).toBe(35);
    });

    it('returns the correct distance for another pair in the declared order', () => {
      expect(legDistance(ORYAHOVO, PLEVEN, legs)).toBe(85);
    });

    it('returns the correct distance for that pair in the reversed order', () => {
      expect(legDistance(PLEVEN, ORYAHOVO, legs)).toBe(85);
    });

    it('handles all 15 fixture legs in both directions', () => {
      for (const leg of legs) {
        expect(legDistance(leg.StartPointId, leg.EndPointId, legs)).toBe(leg.DistanceKm);
        expect(legDistance(leg.EndPointId, leg.StartPointId, legs)).toBe(leg.DistanceKm);
      }
    });
  });

  describe('missing leg', () => {
    it('throws MissingRouteLegError when no leg exists for the pair', () => {
      expect(() => legDistance(99, 100, legs)).toThrowError(MissingRouteLegError);
    });

    it('includes the location IDs in the error', () => {
      let caught: unknown;
      try { legDistance(99, 100, legs); } catch (e) { caught = e; }
      const err = caught as MissingRouteLegError;
      expect(err).toBeInstanceOf(MissingRouteLegError);
      expect(err.aId).toBe(99);
      expect(err.bId).toBe(100);
    });

    it('throws on an empty legs array', () => {
      expect(() => legDistance(OFFICE, KOZLODUY, [])).toThrowError(MissingRouteLegError);
    });
  });
});

describe('routeDistance', () => {
  const legs = makeRouteLegs();

  describe('single-stop round trip', () => {
    it('equals 2× the pairwise distance (Office→stop→Office)', () => {
      // Борово→Козлодуй = 35, return = 35, total = 70
      expect(routeDistance(OFFICE, [KOZLODUY], legs)).toBe(70);
    });

    it('equals 2× for another stop', () => {
      // Борово→Враца = 55, return = 55, total = 110
      expect(routeDistance(OFFICE, [VRATSA], legs)).toBe(110);
    });

    it('is symmetric: same result regardless of declared leg direction', () => {
      const d1 = routeDistance(OFFICE, [BYALA_SLATINA], legs);
      // Борово→Бяла Слатина = 30, return = 30, total = 60
      expect(d1).toBe(60);
    });
  });

  describe('multi-stop chain', () => {
    it('sums consecutive pairwise legs including the return leg', () => {
      // Office(1)→Козлодуй(2)→Оряхово(3)→Office(1)
      // 1→2 = 35, 2→3 = 20, 3→1 = 40, total = 95
      expect(routeDistance(OFFICE, [KOZLODUY, ORYAHOVO], legs)).toBe(95);
    });

    it('handles a three-stop chain', () => {
      // Office(1)→Козлодуй(2)→Оряхово(3)→Враца(5)→Office(1)
      // 1→2=35, 2→3=20, 3→5=60, 5→1=55, total=170
      expect(routeDistance(OFFICE, [KOZLODUY, ORYAHOVO, VRATSA], legs)).toBe(170);
    });

    it('handles stops in a different order than the fixture declaration', () => {
      // Office(1)→Плевен(6)→Враца(5)→Office(1)
      // 1→6=65, 6→5=75, 5→1=55, total=195
      expect(routeDistance(OFFICE, [PLEVEN, VRATSA], legs)).toBe(195);
    });
  });

  describe('zero stops', () => {
    it('returns 0 for an empty stops array', () => {
      // Office→Office: path = [1,1], but that leg doesn't exist
      // Per §6b: zero stops ⇒ zero-trip row (distance 0 is handled by caller)
      // routeDistance with no stops still resolves legDistance(OFFICE, OFFICE)
      // which would throw — so an empty stopIds is a caller responsibility.
      // Test that it does throw so callers are aware.
      expect(() => routeDistance(OFFICE, [], legs)).toThrowError(MissingRouteLegError);
    });
  });

  describe('missing leg propagation', () => {
    it('propagates MissingRouteLegError when a stop pair has no leg', () => {
      expect(() => routeDistance(OFFICE, [99], legs)).toThrowError(MissingRouteLegError);
    });
  });
});
