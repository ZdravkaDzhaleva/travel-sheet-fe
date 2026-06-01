import { applyTrip } from './fuel-balance';

/** No stops have been assigned for the day. */
export function hasNoDestination(stopIds: readonly number[]): boolean {
  return stopIds.length === 0;
}

/**
 * The month's fuel-balancing target is already met by current state alone:
 * the running balance plus all remaining incoming fuel lands inside
 * [balanceMin, balanceMax] without any further driving.
 */
export function targetAlreadyMet(
  currentBalance: number,
  remainingFuelLiters: number,
  balanceMin: number,
  balanceMax: number,
): boolean {
  const projected = currentBalance + remainingFuelLiters;
  return projected >= balanceMin && projected <= balanceMax;
}

/** Applying a `km`-at-`avg` trip would push the running balance below `balanceMin`. */
export function wouldOverconsume(
  currentBalance: number,
  km: number,
  avg: number,
  balanceMin: number,
): boolean {
  return applyTrip(currentBalance, km, avg).balance < balanceMin;
}

/**
 * Soft weekly-minimums check (D3): skipping today still leaves enough remaining
 * working days to cover `pendingVisits`. `remainingWorkingDays` is the count of
 * working days from today onward, inclusive of today.
 */
export function weeklyMinimumsStillSatisfiable(
  remainingWorkingDays: number,
  pendingVisits: number,
): boolean {
  return remainingWorkingDays - 1 >= pendingVisits;
}

export interface ZeroTripContext {
  readonly stopIds: readonly number[];
  readonly currentBalance: number;
  readonly remainingFuelLiters: number;
  readonly candidateKm: number;
  readonly avg: number;
  readonly balanceMin: number;
  readonly balanceMax: number;
  readonly remainingWorkingDays: number;
  readonly pendingVisits: number;
}

/** OR-composes the four §6b zero-trip triggers. True → emit a zero-trip row. */
export function isZeroTripDay(ctx: ZeroTripContext): boolean {
  return (
    hasNoDestination(ctx.stopIds) ||
    targetAlreadyMet(
      ctx.currentBalance,
      ctx.remainingFuelLiters,
      ctx.balanceMin,
      ctx.balanceMax,
    ) ||
    wouldOverconsume(
      ctx.currentBalance,
      ctx.candidateKm,
      ctx.avg,
      ctx.balanceMin,
    ) ||
    weeklyMinimumsStillSatisfiable(ctx.remainingWorkingDays, ctx.pendingVisits)
  );
}
