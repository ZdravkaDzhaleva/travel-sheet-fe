import type {
  FuelEvent,
  GeneratedRow,
  Location,
  RouteLeg,
  Vehicle,
} from '../entities/index';
import {
  ARCH_VISITS_PER_WEEK,
  BALANCE_MIN,
  CONS_VISITS_PER_WEEK,
  FUEL_FILL_TOLERANCE_L,
  MAX_KM_PER_DAY,
  MAX_STOPS_PER_DAY,
} from '../../core/config/generation.config';
import {
  FUEL_ROW_PREFIX,
  FUEL_ROW_UNIT_L,
  FUEL_ROW_UNIT_LVL,
  FUEL_ROW_UNIT_TOTAL,
  ROW_OPENING_LABEL,
} from '../../core/config/workbook.template';
import { applyFuel, applyTrip } from './fuel-balance';
import { round2 } from './round2';
import { routeDistance } from './route-distance';
import { InfeasibleMonthError } from './infeasible-month.error';

export interface GenerateInput {
  readonly workingDays: readonly Date[];
  readonly fuelEvents: readonly FuelEvent[];
  readonly locations: readonly Location[];
  readonly routeLegs: readonly RouteLeg[];
  readonly vehicle: Vehicle;
  readonly openingBalance: number;
  /**
   * Upper bound on the closing balance of the trailing segment. Computed by
   * the application layer from month M+1's first-fuel date.
   */
  readonly trailingTmax?: number;
}

interface RouteCandidate {
  readonly stopIds: readonly number[];
  readonly km: number;
}

interface Segment {
  readonly workingDays: readonly Date[];
  readonly Tmin: number;
  readonly Tmax: number; // POSITIVE_INFINITY for the trailing segment
  readonly nextFuel: FuelEvent | null;
}

const ZERO_CANDIDATE: RouteCandidate = { stopIds: [], km: 0 };

// Wide spread keeps weights flat across the feasible range, so the picker
// produces visibly varied km day-to-day instead of clustering on one value.
const DIVERSITY_SPREAD_KM = 20;

export function generate(input: GenerateInput): GeneratedRow[] {
  const {
    workingDays,
    fuelEvents,
    locations,
    routeLegs,
    vehicle,
    openingBalance,
    trailingTmax,
  } = input;
  const avg = vehicle.AverageConsumptionLitersPer100Km;

  const office = locations.find(l => l.Type === 'Office');
  if (office === undefined) {
    throw new InfeasibleMonthError('No Office location supplied');
  }

  const destinations = locations.filter(l => l.Type !== 'Office');
  const candidates = enumerateRoutes(office.Id, destinations, routeLegs);

  // The real per-day burn ceiling is the LONGEST available route, not
  // MAX_KM_PER_DAY. enumerateRoutes already discards routes above MAX_KM_PER_DAY,
  // so the longest survivor is what the picker can actually drive in a day.
  const maxDayKm = candidates.reduce((m, c) => Math.max(m, c.km), 0);
  // Shortest available trip — the smallest non-zero amount that can be driven in
  // a day (below this, only a zero-trip would fit, so pacing is skipped).
  const minDayKm = candidates.reduce(
    (m, c) => Math.min(m, c.km),
    Number.POSITIVE_INFINITY,
  );

  const maxDayCost = (maxDayKm * avg) / 100;
  const routeCosts = [...new Set(candidates.map(c => round2((c.km * avg) / 100)))];

  const sortedFuels = [...fuelEvents].sort(
    (a, b) => calDayNum(a.date) - calDayNum(b.date),
  );
  const segments = buildSegments(
    workingDays,
    sortedFuels,
    trailingTmax,
    vehicle.TankCapacityLiters,
  );

  checkFeasibility(segments, openingBalance, avg, maxDayKm);

  const workingDaySet = new Set(workingDays.map(dateKey));
  const fuelByDate = groupFuelByDate(sortedFuels);
  const timeline = buildTimeline(workingDays, sortedFuels);

  const rows: GeneratedRow[] = [];
  let balance = round2(openingBalance);

  rows.push({
    kind: 'opening',
    date: null,
    route: ROW_OPENING_LABEL,
    km: null,
    avgConsumption: null,
    consumed: null,
    fueled: null,
    balance,
  });

  let segIdx = 0;
  let daysRemainingInSegment = segments[segIdx]!.workingDays.length;
  let currentWeekKey = '';
  let weekArchVisits = 0;
  let weekConsVisits = 0;

  for (const date of timeline) {
    const key = dateKey(date);

    // Fuel rows first (same-day order: fuel → trip).
    // Each fuel event ends the current segment and starts the next.
    const todayFuel = fuelByDate.get(key) ?? [];
    for (const fe of todayFuel) {
      balance = applyFuel(balance, fe.liters);
      if (balance > vehicle.TankCapacityLiters + 1e-6) {
        // Safety net: the picker should have drained the tank to ≤ C − liters
        // before this top-up.
        throw new InfeasibleMonthError(
          `Refuel on ${isoDate(fe.date)} would overflow the tank: balance ` +
            `${balance.toFixed(2)} L exceeds the capacity of ` +
            `${vehicle.TankCapacityLiters.toFixed(2)} L. The trips before it ` +
            `could not drain the tank to ${round2(vehicle.TankCapacityLiters - fe.liters).toFixed(2)} L.`,
        );
      }
      rows.push({
        kind: 'fuel',
        date: fe.date,
        route: formatFuelRow(fe),
        km: null,
        avgConsumption: null,
        consumed: null,
        fueled: round2(fe.liters),
        balance,
      });
      segIdx++;
      daysRemainingInSegment = segments[segIdx]!.workingDays.length;
    }

    if (!workingDaySet.has(key)) continue;

    // Reset weekly visit counters at the start of each ISO week.
    const wk = isoWeekKey(date);
    if (wk !== currentWeekKey) {
      currentWeekKey = wk;
      weekArchVisits = 0;
      weekConsVisits = 0;
    }

    const seg = segments[segIdx]!;
    const R = daysRemainingInSegment - 1; // working days left AFTER today
    const { xMin, xMax } = feasibleRange(
      balance,
      R,
      seg.Tmin,
      seg.Tmax,
      avg,
      maxDayKm,
    );

    // Soft per-day target — bias only; the picker is free within the range.
    const softTarget = Number.isFinite(seg.Tmax)
      ? (seg.Tmin + seg.Tmax) / 2
      : null;
    const desiredKm =
      softTarget !== null
        ? Math.max(0, ((balance - softTarget) * 100) / avg) / (R + 1)
        : (xMin + xMax) / 2;

    // Even-pacing cap: keep the per-day range close to the even-drain target so
    // the segment doesn't burn down to its pre-fuel window early and leave a
    // clump of zero-trip days at the end.
    let pacedXMax = xMax;
    if (softTarget !== null) {
      const cap = desiredKm + DIVERSITY_SPREAD_KM;
      if (cap >= minDayKm - 1e-9) {
        pacedXMax = Math.min(xMax, Math.max(cap, xMin));
      }
    }

    // Final approach: on the last few days before a fuel event, replace the
    // greedy pick with a bounded look-ahead that searches the remaining days'
    // route combinations for a sequence landing the pre-fuel balance in the brim
    // window [Tmin, Tmax] (preferred) or at least ≤ Tmax (no overflow).
    let chosen: RouteCandidate;
    const approachStep =
      Number.isFinite(seg.Tmax) && R + 1 <= LOOKAHEAD_HORIZON
        ? planApproachStep(balance, R + 1, seg.Tmin, seg.Tmax, candidates, routeCosts, desiredKm, pacedXMax, avg, maxDayCost)
        : null;
    if (approachStep !== null) {
      chosen = approachStep;
    } else {
      chosen = pickCandidate(
        candidates,
        xMin,
        pacedXMax,
        desiredKm,
        locations,
        weekArchVisits,
        weekConsVisits,
        balance,
        seg.Tmin,
        seg.Tmax,
        avg,
      );
    }

    if (chosen.stopIds.length === 0) {
      rows.push({
        kind: 'zero',
        date,
        route: null,
        km: 0,
        avgConsumption: avg,
        consumed: 0,
        fueled: null,
        balance,
      });
    } else {
      const trip = applyTrip(balance, chosen.km, avg);
      if (trip.wentNegative) {
        // Defensive — picker caps by balance, but tolerate float drift.
        rows.push({
          kind: 'zero',
          date,
          route: null,
          km: 0,
          avgConsumption: avg,
          consumed: 0,
          fueled: null,
          balance,
        });
      } else {
        balance = trip.balance;
        const stopLocs = chosen.stopIds.map(id => findLocation(locations, id));
        rows.push({
          kind: 'trip',
          date,
          route: formatTripRoute(office, stopLocs),
          km: chosen.km,
          avgConsumption: avg,
          consumed: trip.consumed,
          fueled: null,
          balance: trip.balance,
        });
        if (chosen.stopIds.some(id => locationTypeOf(locations, id) === 'Architect')) weekArchVisits++;
        if (chosen.stopIds.some(id => locationTypeOf(locations, id) === 'Constructor')) weekConsVisits++;
      }
    }
    daysRemainingInSegment--;
  }

  return rows;
}

// ── Segment construction & feasibility ──────────────────────────────────────

function buildSegments(
  workingDays: readonly Date[],
  sortedFuels: readonly FuelEvent[],
  trailingTmax: number | undefined,
  tankCapacity: number,
): Segment[] {
  const segs: Segment[] = [];
  const sortedDays = [...workingDays].sort(
    (a, b) => calDayNum(a) - calDayNum(b),
  );
  let cursor = 0;

  for (const fe of sortedFuels) {
    // Calendar-day boundary, NOT a timestamp boundary: a working day on the
    // SAME calendar day as the fuel belongs to the POST-fuel segment, because
    // the loop applies the fuel row first and the same-day trip then drains the
    // refilled tank toward the next fuel.
    const cutoff = calDayNum(fe.date);
    const segDays: Date[] = [];
    while (cursor < sortedDays.length && calDayNum(sortedDays[cursor]!) < cutoff) {
      segDays.push(sortedDays[cursor]!);
      cursor++;
    }
    // A fuel event fills the tank to full: post-fuel = pre-fuel + liters must
    // land in [C − τ, C], so the trips must drain the balance into
    // [C − liters − τ, C − liters] before the top-up (ARCHITECTURE §6b).
    const preFuelTarget = round2(tankCapacity - fe.liters);
    if (preFuelTarget < 0) {
      throw new InfeasibleMonthError(
        `Fuel ${fe.liters.toFixed(2)} L on ${isoDate(fe.date)} exceeds the tank ` +
          `capacity of ${tankCapacity.toFixed(2)} L — a single top-up cannot add ` +
          `more than the tank holds.`,
      );
    }
    segs.push({
      workingDays: segDays,
      Tmin: Math.max(BALANCE_MIN, round2(preFuelTarget - FUEL_FILL_TOLERANCE_L)),
      Tmax: preFuelTarget,
      nextFuel: fe,
    });
  }

  segs.push({
    workingDays: sortedDays.slice(cursor),
    Tmin: BALANCE_MIN,
    Tmax: trailingTmax ?? Number.POSITIVE_INFINITY,
    nextFuel: null,
  });
  return segs;
}

function checkFeasibility(
  segments: readonly Segment[],
  openingBalance: number,
  avg: number,
  maxDayKm: number,
): void {
  let balance = openingBalance;
  for (const seg of segments) {
    const N = seg.workingDays.length;
    const burnCapacity = (N * maxDayKm * avg) / 100;

    if (Number.isFinite(seg.Tmax)) {
      const endMin = Math.max(0, balance - burnCapacity);
      if (endMin > seg.Tmax + 1e-9) {
        if (seg.nextFuel !== null) {
          const dateStr = isoDate(seg.nextFuel.date);
          throw new InfeasibleMonthError(
            `Fuel ${seg.nextFuel.liters.toFixed(2)} L on ${dateStr} arrives too soon: ` +
              `prior segment has only ${N} working day(s) × ${maxDayKm.toFixed(1)} km/day ` +
              `(max burn ${burnCapacity.toFixed(2)} L), but the balance is ` +
              `${balance.toFixed(2)} L and must drop to ≤ ${seg.Tmax.toFixed(2)} L ` +
              `(tank capacity − liters) so the top-up fills it to full without overflowing.`,
          );
        }
        throw new InfeasibleMonthError(
          `Next month's first fuel cannot be absorbed: only ${N} working day(s) ` +
            `in this month after the last refuel × ${maxDayKm.toFixed(1)} km/day ` +
            `(max burn ${burnCapacity.toFixed(2)} L), but the balance is ` +
            `${balance.toFixed(2)} L and must drop to ≤ ${seg.Tmax.toFixed(2)} L ` +
            `to leave room for next month's first refuel.`,
        );
      }
      // Chain the worst case into the next segment. A refuel fills the tank to
      // full, so the next segment starts at (pre-fuel + liters).
      if (seg.nextFuel !== null) {
        balance = Math.min(balance, seg.Tmax) + seg.nextFuel.liters;
      }
    }
    // Trailing segment with infinite Tmax: nothing to fail.
  }
}

// ── Per-day feasible range & candidate picker ───────────────────────────────

function feasibleRange(
  balance: number,
  R: number,
  Tmin: number,
  Tmax: number,
  avg: number,
  M: number,
): { xMin: number; xMax: number } {
  const xMaxBalance = (balance * 100) / avg;
  const xMaxToHonorTmin = ((balance - Tmin) * 100) / avg;
  const xMax = Math.max(0, Math.min(M, xMaxBalance, xMaxToHonorTmin));

  let xMin = 0;
  if (Number.isFinite(Tmax)) {
    // Floor: even if every remaining day drives max, today must burn enough so
    // end-of-segment balance can still come down to ≤ Tmax.
    const remainingBurn = (R * M * avg) / 100;
    const required = ((balance - Tmax - remainingBurn) * 100) / avg;
    xMin = Math.max(0, required);
  }
  return { xMin, xMax };
}

function pickCandidate(
  candidates: readonly RouteCandidate[],
  xMin: number,
  xMax: number,
  desiredKm: number,
  locations: readonly Location[],
  weekArchVisits: number,
  weekConsVisits: number,
  balance: number,
  Tmin: number,
  Tmax: number,
  avg: number,
): RouteCandidate {
  // Dead-zone guard: a route that lands the balance in (Tmax, minRouteCost) — above
  // the pre-fuel target but below the cheapest route's fuel cost — strands the
  // balance there (no further trip is affordable), so the next fuel event would
  // overflow the tank. Never choose such a route. Because the dead zone is
  // narrower than the span of route costs, at least one route always lands safely
  // (≤ Tmax or ≥ minRouteCost), so this filter cannot empty the candidate set.
  const minRouteCost = candidates.reduce(
    (m, c) => Math.min(m, (c.km * avg) / 100),
    Number.POSITIVE_INFINITY,
  );
  const landsInDeadZone = (c: RouteCandidate): boolean => {
    if (!Number.isFinite(Tmax)) return false;
    const result = balance - (c.km * avg) / 100;
    return result > Tmax + 1e-9 && result < minRouteCost - 1e-9;
  };
  const safe = candidates.filter(c => !landsInDeadZone(c));

  const inRange = safe.filter(
    c => c.km >= xMin - 1e-9 && c.km <= xMax + 1e-9,
  );

  const respectQuotas = inRange.filter(c => {
    const hasArch = c.stopIds.some(id => locationTypeOf(locations, id) === 'Architect');
    const hasCons = c.stopIds.some(id => locationTypeOf(locations, id) === 'Constructor');
    if (hasArch && weekArchVisits >= ARCH_VISITS_PER_WEEK) return false;
    if (hasCons && weekConsVisits >= CONS_VISITS_PER_WEEK) return false;
    return true;
  });
  let pool = respectQuotas.length > 0 ? respectQuotas : inRange;

  // Brim-trap avoidance (soft): the balance must not be left in the band
  // (Tmax, Tmin + minRouteCost) — from there the next day's cheapest trip
  // overshoots below the fill window and a zero-trip would overflow, so the fuel
  // row lands short of the tank. PREFER keeping the balance at/above
  // Tmin + minRouteCost (so the window stays reachable on the final approach via
  // the cheapest trip) WITHOUT committing to the window early — that keeps the
  // driving spread out instead of clumping zeros at the end. Only when no route
  // can keep the balance above the band do we accept landing in/below the window
  // (the genuine final approach). Both tiers are soft and never force overflow.
  if (Number.isFinite(Tmax) && pool.length > 1) {
    const trapHi = Tmin + minRouteCost;
    const aboveTrap = pool.filter(c => balance - (c.km * avg) / 100 >= trapHi - 1e-9);
    if (aboveTrap.length > 0) {
      pool = aboveTrap;
    } else {
      const atOrBelowWindow = pool.filter(c => balance - (c.km * avg) / 100 <= Tmax + 1e-9);
      if (atOrBelowWindow.length > 0) pool = atOrBelowWindow;
    }
  }

  // No route fits the day's feasible km window [xMin, xMax].
  if (pool.length === 0) {
    // When a burn is REQUIRED today (xMin > 0) — i.e. the segment can only reach
    // its pre-fuel target if today burns at least xMin — we must drive, never
    // emit a voluntary zero. Prefer the smallest safe route that still meets the floor
    // if none reaches it, burn the most we can to catch up.
    if (xMin > 1e-9) {
      const eligible = safe.filter(c => c.km >= xMin - 1e-9);
      if (eligible.length > 0) {
        return eligible.reduce((a, b) => (b.km < a.km ? b : a));
      }
      return safe.reduce((a, b) => (b.km > a.km ? b : a), ZERO_CANDIDATE);
    }
    // No burn required: any route would over-drain below the fill target (or the
    // balance is too low for even the shortest route), so hold with a zero-trip.
    return ZERO_CANDIDATE;
  }

  return weightedByDesired(pool, desiredKm);
}

/**
 * Pick a candidate at random, weighted toward `desiredKm` with a wide spread so
 * the weights stay flat across the range and the day-to-day km stays varied.
 */
function weightedByDesired(
  pool: readonly RouteCandidate[],
  desiredKm: number,
): RouteCandidate {
  const weights = pool.map(
    c => 1 / (Math.abs(c.km - desiredKm) / DIVERSITY_SPREAD_KM + 1),
  );
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * totalWeight;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return pool[i]!;
  }
  return pool[pool.length - 1]!;
}

// ── Final-approach look-ahead ───────────────────────────────────────────────
//
// Greedy per-day pacing positions the balance well over most of a segment, but
// on the last few days before a fuel event the discrete route set can leave no
// single trip that lands inside the tight pre-fuel window — the greedy then
// over-drains (under-fills) or, worse, can't drain enough and overflows. For the
// final stretch we instead SEARCH the remaining days' route combinations for a
// sequence that lands the pre-fuel balance in a target band, and commit to the
// first step. The search is bounded to LOOKAHEAD_HORIZON days and memoised, so
// it stays cheap.

const LOOKAHEAD_HORIZON = 6;

/**
 * Can `daysLeft` more days (each a zero-trip or one route from `costs`) bring
 * `balance` to a final value within [lo, hi] without ever going negative?
 */
function canReachFinal(
  balance: number,
  daysLeft: number,
  lo: number,
  hi: number,
  costs: readonly number[],
  maxCost: number,
  memo: Map<string, boolean>,
): boolean {
  if (daysLeft === 0) return balance >= lo - 1e-9 && balance <= hi + 1e-9;
  // Prune: even draining the most each remaining day can't get below hi, or the
  // balance is already below lo and driving only lowers it further.
  if (balance - daysLeft * maxCost > hi + 1e-9) return false;
  if (balance < lo - 1e-9) return false;
  const key = `${balance.toFixed(2)}|${daysLeft}`;
  const cached = memo.get(key);
  if (cached !== undefined) return cached;
  // Zero-trip today.
  let ok = canReachFinal(balance, daysLeft - 1, lo, hi, costs, maxCost, memo);
  if (!ok) {
    for (const cost of costs) {
      if (cost > balance + 1e-9) continue;
      if (canReachFinal(round2(balance - cost), daysLeft - 1, lo, hi, costs, maxCost, memo)) {
        ok = true;
        break;
      }
    }
  }
  memo.set(key, ok);
  return ok;
}

/**
 * Highest final balance ≤ `hi` reachable in `daysLeft` more days (each a
 * zero-trip or one route), never going negative. −Infinity if `≤ hi` is
 * unreachable. Used to land as close to the fill window as the route set allows
 * when the exact window can't be hit.
 */
function bestFinalAtMost(
  balance: number,
  daysLeft: number,
  hi: number,
  costs: readonly number[],
  maxCost: number,
  memo: Map<string, number>,
): number {
  if (daysLeft === 0) return balance <= hi + 1e-9 ? balance : Number.NEGATIVE_INFINITY;
  if (balance - daysLeft * maxCost > hi + 1e-9) return Number.NEGATIVE_INFINITY;
  const key = `${balance.toFixed(2)}|${daysLeft}`;
  const cached = memo.get(key);
  if (cached !== undefined) return cached;
  let best = bestFinalAtMost(balance, daysLeft - 1, hi, costs, maxCost, memo); // zero today
  for (const cost of costs) {
    if (cost > balance + 1e-9) continue;
    const v = bestFinalAtMost(round2(balance - cost), daysLeft - 1, hi, costs, maxCost, memo);
    if (v > best) best = v;
  }
  memo.set(key, best);
  return best;
}

/**
 * Choose today's trip for the final approach before a fuel event:
 *  1. If the brim window [Tmin, Tmax] is still reachable, prefer a trip that
 *     keeps it reachable (weighted toward `desiredKm` for variety, pacing-capped
 *     so zeros don't clump; a zero-trip if only idling keeps it reachable).
 *  2. Otherwise the routes can't hit the window exactly — pick the trip that
 *     lands the eventual pre-fuel balance as HIGH as possible while staying
 *     ≤ Tmax (closest to a full tank, never overflowing).
 *  3. If even ≤ Tmax is unreachable, return null (caller's safety net throws).
 */
function planApproachStep(
  balance: number,
  daysLeft: number,
  Tmin: number,
  Tmax: number,
  candidates: readonly RouteCandidate[],
  costs: readonly number[],
  desiredKm: number,
  pacedKmMax: number,
  avg: number,
  maxCost: number,
): RouteCandidate | null {
  // 1) Aim for the brim window.
  const memo = new Map<string, boolean>();
  const brimDrivers = candidates.filter(c => {
    const cost = (c.km * avg) / 100;
    return (
      cost <= balance + 1e-9 &&
      canReachFinal(round2(balance - cost), daysLeft - 1, Tmin, Tmax, costs, maxCost, memo)
    );
  });
  if (brimDrivers.length > 0) {
    const paced = brimDrivers.filter(c => c.km <= pacedKmMax + 1e-9);
    return weightedByDesired(paced.length > 0 ? paced : brimDrivers, desiredKm);
  }
  if (canReachFinal(balance, daysLeft - 1, Tmin, Tmax, costs, maxCost, memo)) {
    return ZERO_CANDIDATE;
  }

  // 2) Window unreachable — get the pre-fuel balance as close to full as possible
  // (highest value still ≤ Tmax), so the fill lands as near the brim as the routes
  // allow instead of an arbitrary deep under-fill.
  const memo2 = new Map<string, number>();
  let bestVal = bestFinalAtMost(balance, daysLeft - 1, Tmax, costs, maxCost, memo2); // zero today
  let bestChoice: RouteCandidate | null = bestVal > Number.NEGATIVE_INFINITY ? ZERO_CANDIDATE : null;
  for (const c of candidates) {
    const cost = (c.km * avg) / 100;
    if (cost > balance + 1e-9) continue;
    const v = bestFinalAtMost(round2(balance - cost), daysLeft - 1, Tmax, costs, maxCost, memo2);
    if (v > bestVal + 1e-9) {
      bestVal = v;
      bestChoice = c;
    }
  }
  return bestChoice;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * The longest single-day round trip the generator can actually drive for these
 * locations/routes (the same value `generate()` uses as its per-day burn
 * ceiling). Returns 0 if there is no Office or no feasible route. The application
 * layer needs this to size its next-month look-ahead (`trailingTmax`) with the
 * SAME ceiling the generator enforces — using MAX_KM_PER_DAY there instead would
 * let a month close too high for the next month to drain before its first refuel.
 */
export function maxDailyRouteKm(
  locations: readonly Location[],
  routeLegs: readonly RouteLeg[],
): number {
  const office = locations.find(l => l.Type === 'Office');
  if (office === undefined) return 0;
  const destinations = locations.filter(l => l.Type !== 'Office');
  return enumerateRoutes(office.Id, destinations, routeLegs).reduce(
    (m, c) => Math.max(m, c.km),
    0,
  );
}

function enumerateRoutes(
  officeId: number,
  destinations: readonly Location[],
  legs: readonly RouteLeg[],
): RouteCandidate[] {
  const out: RouteCandidate[] = [];
  const tryAdd = (stopIds: number[]): void => {
    try {
      const km = routeDistance(officeId, stopIds, legs);
      if (km <= MAX_KM_PER_DAY) out.push({ stopIds, km });
    } catch {
      // Missing leg — skip this candidate.
    }
  };

  for (const a of destinations) {
    tryAdd([a.Id]);
  }
  if (MAX_STOPS_PER_DAY >= 2) {
    for (const a of destinations) {
      for (const b of destinations) {
        if (a.Id === b.Id) continue;
        tryAdd([a.Id, b.Id]);
      }
    }
  }
  if (MAX_STOPS_PER_DAY >= 3) {
    for (const a of destinations) {
      for (const b of destinations) {
        if (a.Id === b.Id) continue;
        for (const c of destinations) {
          if (c.Id === a.Id || c.Id === b.Id) continue;
          tryAdd([a.Id, b.Id, c.Id]);
        }
      }
    }
  }
  return out;
}

function findLocation(locations: readonly Location[], id: number): Location {
  const loc = locations.find(l => l.Id === id);
  if (loc === undefined) {
    throw new InfeasibleMonthError(`Location id ${id} not found`);
  }
  return loc;
}

function locationTypeOf(locations: readonly Location[], id: number): string {
  return locations.find(l => l.Id === id)?.Type ?? '';
}

/** ISO week key "YYYY-Www" — Thursday of the week determines the year. */
function isoWeekKey(d: Date): string {
  const thu = new Date(d);
  thu.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(thu.getFullYear(), 0, 1);
  const week = Math.ceil(((thu.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${thu.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

function groupFuelByDate(
  fuelEvents: readonly FuelEvent[],
): Map<string, FuelEvent[]> {
  const map = new Map<string, FuelEvent[]>();
  for (const fe of fuelEvents) {
    const key = dateKey(fe.date);
    const list = map.get(key);
    if (list) list.push(fe);
    else map.set(key, [fe]);
  }
  return map;
}

/** Sorted, deduplicated chronological union of working-day dates and fuel-event dates. */
function buildTimeline(
  workingDays: readonly Date[],
  fuelEvents: readonly FuelEvent[],
): Date[] {
  const seen = new Set<string>();
  const out: Date[] = [];
  for (const d of workingDays) {
    const k = dateKey(d);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(d);
    }
  }
  for (const fe of fuelEvents) {
    const k = dateKey(fe.date);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(fe.date);
    }
  }
  return out.sort((a, b) => calDayNum(a) - calDayNum(b));
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Ordinal calendar-day number (YYYYMMDD-like) for comparing dates by calendar
 * day, ignoring the time-of-day component. Segment boundaries MUST use this.
 */
function calDayNum(d: Date): number {
  return d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate();
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Trip route string: "<office> - <stop1> - … - <stopN> - <office>". */
export function formatTripRoute(
  office: Location,
  stops: readonly Location[],
): string {
  const parts = [office.NameBg, ...stops.map(s => s.NameBg), office.NameBg];
  return parts.join(' - ');
}

/** Fuel row string per §6: "Зареждане гориво - <vendor> - <l> л * <p> лв/л = <t> лв общо". */
export function formatFuelRow(fe: FuelEvent): string {
  const l = round2(fe.liters).toFixed(2);
  const p = round2(fe.unitPrice).toFixed(2);
  const t = round2(fe.totalAmount).toFixed(2);
  return (
    `${FUEL_ROW_PREFIX} - ${fe.vendor} - ${l} ${FUEL_ROW_UNIT_L}` +
    ` * ${p} ${FUEL_ROW_UNIT_LVL} = ${t} ${FUEL_ROW_UNIT_TOTAL}`
  );
}

export { InfeasibleMonthError } from './infeasible-month.error';
export { InsufficientDataError } from './insufficient-data.error';
