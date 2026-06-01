import { describe, it, expect } from 'vitest';
import { round2 } from './round2';

describe('round2', () => {
  it('returns an exact 2-decimal value', () => {
    expect(round2(1.234)).toBe(1.23);
    expect(round2(1.235)).toBe(1.24); // half-up
    expect(round2(1.236)).toBe(1.24);
  });

  it('eliminates floating-point dust', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1.005 * 2)).toBe(2.01);
  });

  it('handles negatives', () => {
    expect(round2(-1.234)).toBe(-1.23);
    // JS Math.round rounds toward +∞ at .5 — -1.235 → -1.23, not -1.24
    expect(round2(-1.236)).toBe(-1.24);
  });

  it('passes through whole numbers and zero', () => {
    expect(round2(0)).toBe(0);
    expect(round2(42)).toBe(42);
  });
});
