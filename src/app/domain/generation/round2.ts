/** Rounds to 2 decimal places. The single shared rounding helper for fuel/distance math. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
