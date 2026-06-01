import type {
  FuelEvent,
  GeneratedRow,
  Location,
  RouteLeg,
  Vehicle,
} from '../entities/index';
import {
  BALANCE_MAX,
  BALANCE_MIN,
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

    const remainingDays = workingDays.length - workingDaysProcessed;
    const remainingKm = Math.max(0, targetTotalKm - kmDriven);
    const desiredKm = remainingKm / remainingDays;
    const maxKmByBalance = (balance * 100) / avg;
    const maxKmToday = Math.min(MAX_KM_PER_DAY, maxKmByBalance);
    const chosen = pickCandidate(candidates, desiredKm, maxKmToday);

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
): RouteCandidate {
  let best: RouteCandidate = ZERO_CANDIDATE;
  let bestDist = Math.abs(0 - desiredKm);
  for (const c of candidates) {
    if (c.km > maxKm + 1e-9) continue;
    const d = Math.abs(c.km - desiredKm);
    if (d < bestDist) {
      best = c;
      bestDist = d;
    }
  }
  return best;
}

function findLocation(locations: readonly Location[], id: number): Location {
  const loc = locations.find(l => l.Id === id);
  if (loc === undefined) {
    throw new InfeasibleMonthError(`Location id ${id} not found`);
  }
  return loc;
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
