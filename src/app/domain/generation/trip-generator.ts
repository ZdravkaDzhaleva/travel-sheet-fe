import type {
  FuelEvent,
  GeneratedRow,
  Location,
  RouteLeg,
  Vehicle,
} from '../entities/index';
import {
  ARCH_VISITS_PER_WEEK,
  BALANCE_MAX,
  BALANCE_MIN,
  CONS_VISITS_PER_WEEK,
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

  const sortedFuels = [...fuelEvents].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
  const segments = buildSegments(workingDays, sortedFuels, trailingTmax);

  checkFeasibility(segments, openingBalance, avg);

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
      MAX_KM_PER_DAY,
    );

    // Soft per-day target — bias only; the picker is free within the range.
    const softTarget = Number.isFinite(seg.Tmax)
      ? (seg.Tmin + seg.Tmax) / 2
      : null;
    const desiredKm =
      softTarget !== null
        ? Math.max(0, ((balance - softTarget) * 100) / avg) / (R + 1)
        : (xMin + xMax) / 2;

    const chosen = pickCandidate(
      candidates,
      xMin,
      xMax,
      desiredKm,
      locations,
      weekArchVisits,
      weekConsVisits,
    );

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
): Segment[] {
  const segs: Segment[] = [];
  const sortedDays = [...workingDays].sort(
    (a, b) => a.getTime() - b.getTime(),
  );
  let cursor = 0;

  for (const fe of sortedFuels) {
    const cutoff = fe.date.getTime();
    const segDays: Date[] = [];
    while (cursor < sortedDays.length && sortedDays[cursor]!.getTime() < cutoff) {
      segDays.push(sortedDays[cursor]!);
      cursor++;
    }
    segs.push({
      workingDays: segDays,
      Tmin: BALANCE_MIN,
      Tmax: BALANCE_MAX,
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
): void {
  let balance = openingBalance;
  for (const seg of segments) {
    const N = seg.workingDays.length;
    const burnCapacity = (N * MAX_KM_PER_DAY * avg) / 100;

    if (Number.isFinite(seg.Tmax)) {
      const endMin = Math.max(0, balance - burnCapacity);
      if (endMin > seg.Tmax + 1e-9) {
        if (seg.nextFuel !== null) {
          const dateStr = isoDate(seg.nextFuel.date);
          throw new InfeasibleMonthError(
            `Fuel ${seg.nextFuel.liters.toFixed(2)} L on ${dateStr} arrives too soon: ` +
              `prior segment has only ${N} working day(s) × ${MAX_KM_PER_DAY} km/day ` +
              `(max burn ${burnCapacity.toFixed(2)} L), but the balance is ` +
              `${balance.toFixed(2)} L and must drop to ≤ ${seg.Tmax} L before refueling.`,
          );
        }
        throw new InfeasibleMonthError(
          `Next month's first fuel cannot be absorbed: only ${N} working day(s) ` +
            `in this month after the last refuel × ${MAX_KM_PER_DAY} km/day ` +
            `(max burn ${burnCapacity.toFixed(2)} L), but the balance is ` +
            `${balance.toFixed(2)} L and must drop to ≤ ${seg.Tmax.toFixed(2)} L ` +
            `to leave room for next month's first refuel.`,
        );
      }
      // Optimistic chaining — algorithm can end at endMin, leaving max room downstream.
      balance = endMin + (seg.nextFuel?.liters ?? 0);
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
): RouteCandidate {
  const inRange = candidates.filter(
    c => c.km >= xMin - 1e-9 && c.km <= xMax + 1e-9,
  );

  const respectQuotas = inRange.filter(c => {
    const hasArch = c.stopIds.some(id => locationTypeOf(locations, id) === 'Architect');
    const hasCons = c.stopIds.some(id => locationTypeOf(locations, id) === 'Constructor');
    if (hasArch && weekArchVisits >= ARCH_VISITS_PER_WEEK) return false;
    if (hasCons && weekConsVisits >= CONS_VISITS_PER_WEEK) return false;
    return true;
  });
  const pool = respectQuotas.length > 0 ? respectQuotas : inRange;

  // Zero-trip is emitted only when no route fits the day's feasible km window
  // (typically because balance is too low for even the shortest route). A
  // short route is always preferred over a voluntary zero.
  if (pool.length === 0) return ZERO_CANDIDATE;

  // Weight candidates by closeness to desiredKm with a wide spread, so the
  // weights stay flat across the range and the picker produces varied km.
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

// ── Helpers ──────────────────────────────────────────────────────────────────

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
  return out.sort((a, b) => a.getTime() - b.getTime());
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
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
