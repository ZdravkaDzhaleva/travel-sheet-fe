import { round2 } from './round2';

/** Liters consumed by driving `km` at `avg` L/100km. Rounded to 2 decimals. */
export function consumed(km: number, avg: number): number {
  return round2((km * avg) / 100);
}

/** New balance after a fuel top-up. Always non-negative when inputs are non-negative. */
export function applyFuel(balance: number, liters: number): number {
  return round2(balance + liters);
}

export interface TripBalanceResult {
  readonly balance: number;
  readonly consumed: number;
  readonly wentNegative: boolean;
}

/**
 * New balance after a trip of `km` at `avg` L/100km.
 * Returns the post-trip balance, the liters consumed, and a `wentNegative` flag
 * the caller MUST check — per §6b the running balance must never go below 0.
 */
export function applyTrip(
  balance: number,
  km: number,
  avg: number,
): TripBalanceResult {
  const c = consumed(km, avg);
  const next = round2(balance - c);
  return { balance: next, consumed: c, wentNegative: next < 0 };
}
