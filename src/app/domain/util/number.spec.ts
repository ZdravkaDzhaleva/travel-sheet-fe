import { describe, it, expect } from 'vitest';
import { isPositive } from './number';

describe('isPositive', () => {
  it('accepts finite numbers greater than zero', () => {
    expect(isPositive(0.01)).toBe(true);
    expect(isPositive(1)).toBe(true);
    expect(isPositive(99.5)).toBe(true);
  });

  it('rejects zero and negatives', () => {
    expect(isPositive(0)).toBe(false);
    expect(isPositive(-0)).toBe(false);
    expect(isPositive(-1)).toBe(false);
  });

  it('rejects non-finite values', () => {
    expect(isPositive(Number.NaN)).toBe(false);
    expect(isPositive(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isPositive(Number.NEGATIVE_INFINITY)).toBe(false);
  });
});
