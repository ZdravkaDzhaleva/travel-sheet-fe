/** True for a finite number strictly greater than zero (rejects 0, NaN, ±Infinity). */
export function isPositive(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}
