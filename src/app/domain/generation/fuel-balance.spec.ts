import { describe, it, expect } from 'vitest';
import { consumed, applyFuel, applyTrip } from './fuel-balance';

describe('consumed', () => {
  it('matches hand-computed liters for whole-km trips', () => {
    // 100 km × 12 L/100km = 12.00 L
    expect(consumed(100, 12)).toBe(12);
    // 50 km × 11.5 = 5.75 L
    expect(consumed(50, 11.5)).toBe(5.75);
    // 80 km × 11.5 = 9.20 L
    expect(consumed(80, 11.5)).toBe(9.2);
  });

  it('rounds to 2 decimals', () => {
    // 33.33 × 12 / 100 = 3.9996 → 4.00
    expect(consumed(33.33, 12)).toBe(4);
    // 70 × 11.5 / 100 = 8.05
    expect(consumed(70, 11.5)).toBe(8.05);
  });

  it('returns 0 for zero km (zero-trip day)', () => {
    expect(consumed(0, 12)).toBe(0);
    expect(consumed(0, 11.5)).toBe(0);
  });
});

describe('applyFuel', () => {
  it('adds liters to the balance', () => {
    expect(applyFuel(5, 30)).toBe(35);
    expect(applyFuel(0, 40)).toBe(40);
  });

  it('rounds to 2 decimals', () => {
    expect(applyFuel(5.55, 10.55)).toBe(16.1);
    expect(applyFuel(0.1, 0.2)).toBe(0.3); // floating-point dust
  });

  it('handles a zero top-up', () => {
    expect(applyFuel(7.5, 0)).toBe(7.5);
  });
});

describe('applyTrip', () => {
  it('returns the post-trip balance and the consumed amount', () => {
    const r = applyTrip(50, 100, 12);
    expect(r.consumed).toBe(12);
    expect(r.balance).toBe(38);
    expect(r.wentNegative).toBe(false);
  });

  it('rounds the result to 2 decimals', () => {
    // balance 5.7, 10 km × 11.5 / 100 = 1.15 L → 4.55
    const r = applyTrip(5.7, 10, 11.5);
    expect(r.consumed).toBe(1.15);
    expect(r.balance).toBe(4.55);
    expect(r.wentNegative).toBe(false);
  });

  it('flags wentNegative when the trip would overconsume', () => {
    const r = applyTrip(5, 100, 12); // 5 - 12 = -7
    expect(r.balance).toBe(-7);
    expect(r.wentNegative).toBe(true);
  });

  it('treats exactly zero as not negative', () => {
    const r = applyTrip(12, 100, 12); // 12 - 12 = 0
    expect(r.balance).toBe(0);
    expect(r.wentNegative).toBe(false);
  });

  it('handles a zero-km day (no consumption, balance unchanged)', () => {
    const r = applyTrip(7.5, 0, 11.5);
    expect(r.consumed).toBe(0);
    expect(r.balance).toBe(7.5);
    expect(r.wentNegative).toBe(false);
  });
});

describe('running-balance sequence (opening → fuel → trips)', () => {
  it('reproduces a hand-computed sequence at 11.5 L/100km', () => {
    const avg = 11.5;
    // Opening balance
    let balance = 10;

    // +20 L top-up → 30
    balance = applyFuel(balance, 20);
    expect(balance).toBe(30);

    // Trip 50 km → 5.75 L consumed → 24.25
    let trip = applyTrip(balance, 50, avg);
    expect(trip.consumed).toBe(5.75);
    expect(trip.balance).toBe(24.25);
    expect(trip.wentNegative).toBe(false);
    balance = trip.balance;

    // Trip 80 km → 9.2 L → 15.05
    trip = applyTrip(balance, 80, avg);
    expect(trip.consumed).toBe(9.2);
    expect(trip.balance).toBe(15.05);
    balance = trip.balance;

    // Trip 30 km → 3.45 L → 11.6
    trip = applyTrip(balance, 30, avg);
    expect(trip.consumed).toBe(3.45);
    expect(trip.balance).toBe(11.6);
    balance = trip.balance;

    // Top up 5 L → 16.6
    balance = applyFuel(balance, 5);
    expect(balance).toBe(16.6);

    // Trip 70 km → 8.05 L → 8.55
    trip = applyTrip(balance, 70, avg);
    expect(trip.consumed).toBe(8.05);
    expect(trip.balance).toBe(8.55);
    balance = trip.balance;

    // Closing balance after the sequence
    expect(balance).toBe(8.55);
  });

  it('never silently emits a negative balance — flag is always set when balance < 0', () => {
    // Sequence that overshoots: opening 5, no fuel, trip 100 km × 12
    const trip = applyTrip(5, 100, 12);
    expect(trip.balance).toBeLessThan(0);
    expect(trip.wentNegative).toBe(true);
  });
});
