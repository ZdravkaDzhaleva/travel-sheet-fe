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
  ROUTE_VARIETY_TOP_N,
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
}

interface RouteCandidate {
  readonly stopIds: readonly number[];
  readonly km: number;
}

const ZERO_CANDIDATE: RouteCandidate = { stopIds: [], km: 0 };

export function generate(input: GenerateInput): GeneratedRow[] {
  const {
    workingDays,
    fuelEvents,
    locations,
    routeLegs,
    vehicle,
    openingBalance,
  } = input;
  const avg = vehicle.AverageConsumptionLitersPer100Km;

  const office = locations.find(l => l.Type === 'Office');
  if (office === undefined) {
    throw new InfeasibleMonthError('No Office location supplied');
  }

  const sumFuelLiters = fuelEvents.reduce((s, fe) => s + fe.liters, 0);
  const totalIn = openingBalance + sumFuelLiters;
  const capacityKm = workingDays.length * MAX_KM_PER_DAY;
  const minBurnLiters = Math.max(0, totalIn - BALANCE_MAX);
  const minBurnKm = (minBurnLiters * 100) / avg;
  if (minBurnKm > capacityKm + 1e-9) {
    throw new InfeasibleMonthError(
      `Over-fueled month: must burn at least ${minBurnKm.toFixed(2)} km of driving, ` +
        `but ${workingDays.length} working days × ${MAX_KM_PER_DAY} km/day = ${capacityKm} km`,
    );
  }

  const destinations = locations.filter(l => l.Type !== 'Office');
  const candidates = enumerateRoutes(office.Id, destinations, routeLegs);

  // Aim closing balance at the midpoint of the allowed window.
  const targetClosing = (BALANCE_MIN + BALANCE_MAX) / 2;
  const idealTotalKm = Math.max(0, ((totalIn - targetClosing) * 100) / avg);
  const targetTotalKm = Math.min(idealTotalKm, capacityKm);

  const workingDaySet = new Set(workingDays.map(dateKey));
  const fuelByDate = groupFuelByDate(fuelEvents);
  const timeline = buildTimeline(workingDays, fuelEvents);

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

  let kmDriven = 0;
  let workingDaysProcessed = 0;
  let currentWeekKey = '';
  let weekArchVisits = 0;
  let weekConsVisits = 0;

  for (const date of timeline) {
    const key = dateKey(date);

    // Fuel rows first (same-day order: fuel → trip).
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
    }

    if (!workingDaySet.has(key)) continue;

    // Reset weekly visit counters at the start of each ISO week.
    const wk = isoWeekKey(date);
    if (wk !== currentWeekKey) {
      currentWeekKey = wk;
      weekArchVisits = 0;
      weekConsVisits = 0;
    }

    const remainingDays = workingDays.length - workingDaysProcessed;
    const remainingKm = Math.max(0, targetTotalKm - kmDriven);
    const desiredKm = remainingKm / remainingDays;
    const maxKmByBalance = (balance * 100) / avg;
    const maxKmToday = Math.min(MAX_KM_PER_DAY, maxKmByBalance);
    const chosen = pickCandidate(candidates, desiredKm, maxKmToday, locations, weekArchVisits, weekConsVisits);

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
        // Picker already caps at balance, so this branch is a defensive net.
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
        kmDriven += chosen.km;
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
    workingDaysProcessed++;
  }

  if (balance < BALANCE_MIN - 1e-9 || balance > BALANCE_MAX + 1e-9) {
    throw new InfeasibleMonthError(
      `Closing balance ${balance} not in [${BALANCE_MIN}, ${BALANCE_MAX}] after generation`,
    );
  }

  return rows;
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

function pickCandidate(
  candidates: readonly RouteCandidate[],
  desiredKm: number,
  maxKm: number,
  locations: readonly Location[],
  weekArchVisits: number,
  weekConsVisits: number,
): RouteCandidate {
  const feasible = candidates.filter(c => c.km <= maxKm + 1e-9);

  // Prefer candidates that respect weekly Architect / Constructor quotas.
  const preferred = feasible.filter(c => {
    const hasArch = c.stopIds.some(id => locationTypeOf(locations, id) === 'Architect');
    const hasCons = c.stopIds.some(id => locationTypeOf(locations, id) === 'Constructor');
    if (hasArch && weekArchVisits >= ARCH_VISITS_PER_WEEK) return false;
    if (hasCons && weekConsVisits >= CONS_VISITS_PER_WEEK) return false;
    return true;
  });

  // Fall back to full feasible pool only when quotas would block everything.
  const pool = preferred.length > 0 ? preferred : feasible;
  if (pool.length === 0) return ZERO_CANDIDATE;

  // Sort by closeness to desiredKm; weight-random among the top N so closer
  // candidates are strongly preferred (weight = 1/(dist+1)) — this adds route
  // variety without letting the month-end balance drift outside [0, 8].
  const sorted = [...pool].sort(
    (a, b) => Math.abs(a.km - desiredKm) - Math.abs(b.km - desiredKm),
  );
  const top = sorted.slice(0, ROUTE_VARIETY_TOP_N);
  const weights = top.map(c => 1 / (Math.abs(c.km - desiredKm) + 1));
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * totalWeight;
  for (let i = 0; i < top.length; i++) {
    r -= weights[i];
    if (r <= 0) return top[i]!;
  }
  return top[top.length - 1]!;
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
