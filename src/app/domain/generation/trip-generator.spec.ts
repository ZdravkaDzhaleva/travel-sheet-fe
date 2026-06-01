import { describe, it, expect } from 'vitest';
import {
  generate,
  formatFuelRow,
  formatTripRoute,
  InfeasibleMonthError,
} from './trip-generator';
import { workingDaysInMonth } from '../calendar/working-day-calendar';
import { routeDistance } from './route-distance';
import { round2 } from './round2';
import {
  makeVehicle,
  makeLocations,
  makeRouteLegs,
  makeFuelEvents,
  make2026HolidayDates,
} from '../../../test-fixtures/index';
import {
  BALANCE_MIN,
  BALANCE_MAX,
  MAX_KM_PER_DAY,
  MAX_STOPS_PER_DAY,
} from '../../core/config/generation.config';
import type { GeneratedRow, Location } from '../entities/index';

// ── Shared fixtures ──────────────────────────────────────────────────────────

const vehicle = makeVehicle();
const locations = makeLocations();
const routeLegs = makeRouteLegs();
const fuelEvents = makeFuelEvents();
const holidays = make2026HolidayDates();
const office = locations.find(l => l.Type === 'Office')!;
const allowedStopTypes = new Set(['Project', 'Architect', 'Constructor']);

function janWorkingDays(): Date[] {
  return workingDaysInMonth(2026, 1, holidays);
}

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function findLoc(id: number): Location {
  return locations.find(l => l.Id === id)!;
}

// ── Happy-path invariants (§8) on a normal January 2026 month ───────────────

describe('generate — January 2026 invariants', () => {
  const rows = generate({
    workingDays: janWorkingDays(),
    fuelEvents,
    locations,
    routeLegs,
    vehicle,
    openingBalance: vehicle.OpeningFuelBalance,
  });

  it('emits an opening row first, with the correct label and balance', () => {
    const opening = rows[0];
    expect(opening.kind).toBe('opening');
    expect(opening.route).toBe('Начално количество');
    expect(opening.balance).toBe(round2(vehicle.OpeningFuelBalance));
    expect(opening.date).toBeNull();
    expect(opening.km).toBeNull();
  });

  it('emits exactly one row per working day (trip or zero)', () => {
    const tripsAndZeros = rows.filter(r => r.kind === 'trip' || r.kind === 'zero');
    expect(tripsAndZeros).toHaveLength(janWorkingDays().length);
  });

  it('emits exactly one fuel row per fuel event, on the invoice date', () => {
    const fuels = rows.filter(r => r.kind === 'fuel');
    expect(fuels).toHaveLength(fuelEvents.length);
    const fuelDateKeys = fuels.map(r => localDateKey(r.date!));
    const expectedKeys = fuelEvents.map(e => localDateKey(e.date));
    expect(fuelDateKeys.sort()).toEqual(expectedKeys.sort());
  });

  it('fuel rows carry verbatim metadata and the exact §6 string', () => {
    for (const fe of fuelEvents) {
      const key = localDateKey(fe.date);
      const row = rows.find(r => r.kind === 'fuel' && localDateKey(r.date!) === key)!;
      expect(row.fueled).toBe(round2(fe.liters));
      expect(row.route).toBe(formatFuelRow(fe));
      expect(row.route).toContain(fe.vendor);
      expect(row.route).toContain(fe.liters.toFixed(2));
      expect(row.route).toContain(fe.unitPrice.toFixed(2));
      expect(row.route).toContain(fe.totalAmount.toFixed(2));
    }
  });

  it('orders dated rows chronologically (after the opening row)', () => {
    const datedTimes = rows
      .filter(r => r.date !== null)
      .map(r => r.date!.getTime());
    for (let i = 1; i < datedTimes.length; i++) {
      expect(datedTimes[i]).toBeGreaterThanOrEqual(datedTimes[i - 1]);
    }
  });

  it('emits same-day order opening → fuel → trip (when a fuel event falls on a working day)', () => {
    // Reorder fuel onto a working day: 2026-01-09 (Friday).
    const adjusted = fuelEvents.map((fe, i) => ({
      ...fe,
      date: i === 0 ? new Date(2026, 0, 9) : fe.date,
    }));
    const r = generate({
      workingDays: janWorkingDays(),
      fuelEvents: adjusted,
      locations,
      routeLegs,
      vehicle,
      openingBalance: vehicle.OpeningFuelBalance,
    });
    const idxFuel = r.findIndex(
      x => x.kind === 'fuel' && x.date && localDateKey(x.date) === '2026-0-9',
    );
    const idxTrip = r.findIndex(
      x =>
        (x.kind === 'trip' || x.kind === 'zero') &&
        x.date &&
        localDateKey(x.date) === '2026-0-9',
    );
    expect(idxFuel).toBeGreaterThan(-1);
    expect(idxTrip).toBeGreaterThan(idxFuel);
  });

  it('running balance is never below BALANCE_MIN on any row', () => {
    for (const r of rows) {
      expect(r.balance).toBeGreaterThanOrEqual(BALANCE_MIN);
    }
  });

  it('closing balance lies inside [BALANCE_MIN, BALANCE_MAX]', () => {
    const closing = rows[rows.length - 1].balance;
    expect(closing).toBeGreaterThanOrEqual(BALANCE_MIN);
    expect(closing).toBeLessThanOrEqual(BALANCE_MAX);
  });

  it('per-row math: trip consumed = round2(km × avg / 100); fuel adds liters', () => {
    let running = round2(vehicle.OpeningFuelBalance);
    for (const r of rows) {
      if (r.kind === 'opening') {
        expect(r.balance).toBe(running);
        continue;
      }
      if (r.kind === 'fuel') {
        running = round2(running + r.fueled!);
        expect(r.balance).toBe(running);
      } else if (r.kind === 'trip') {
        const expectedConsumed = round2((r.km! * r.avgConsumption!) / 100);
        expect(r.consumed).toBe(expectedConsumed);
        running = round2(running - expectedConsumed);
        expect(r.balance).toBe(running);
      } else if (r.kind === 'zero') {
        expect(r.km).toBe(0);
        expect(r.consumed).toBe(0);
        expect(r.balance).toBe(running);
      }
    }
  });

  it('trip routes are well-formed: start/end at Office, allowed stop types, km = Σ legs, within caps', () => {
    for (const r of rows.filter(x => x.kind === 'trip')) {
      expect(r.km!).toBeGreaterThan(0);
      expect(r.km!).toBeLessThanOrEqual(MAX_KM_PER_DAY);

      // Reconstruct stop IDs from the route string and verify shape.
      const tokens = r.route!.split(' - ');
      expect(tokens[0]).toBe(office.NameBg);
      expect(tokens[tokens.length - 1]).toBe(office.NameBg);
      const stopNames = tokens.slice(1, -1);
      expect(stopNames.length).toBeGreaterThanOrEqual(1);
      expect(stopNames.length).toBeLessThanOrEqual(MAX_STOPS_PER_DAY);

      const stopLocs = stopNames.map(n => locations.find(l => l.NameBg === n)!);
      for (const s of stopLocs) {
        expect(allowedStopTypes.has(s.Type)).toBe(true);
      }
      const expectedKm = routeDistance(office.Id, stopLocs.map(l => l.Id), routeLegs);
      expect(r.km).toBe(expectedKm);
    }
  });

  it('totals reconcile: Σ consumed (F) + closing − Σ fueled (G) = opening', () => {
    const sumConsumed = round2(
      rows
        .filter(r => r.kind === 'trip' || r.kind === 'zero')
        .reduce((s, r) => s + (r.consumed ?? 0), 0),
    );
    const sumFueled = round2(
      rows.filter(r => r.kind === 'fuel').reduce((s, r) => s + (r.fueled ?? 0), 0),
    );
    const opening = rows[0].balance;
    const closing = rows[rows.length - 1].balance;
    // opening + Σ fueled − Σ consumed = closing  (within float tolerance)
    expect(Math.abs(opening + sumFueled - sumConsumed - closing)).toBeLessThan(0.02);
  });
});

// ── Edge cases ──────────────────────────────────────────────────────────────

describe('generate — edge cases', () => {
  it('throws InfeasibleMonthError when the month is over-fueled', () => {
    // Tiny month with massive fuel: 2 working days × 80 km × 11.5/100 = 18.4 L burnable.
    // Opening 50 + fuel 200 = 250 L total → must burn ≥ 242 L → infeasible.
    const tinyDays = [new Date(2026, 0, 5), new Date(2026, 0, 6)];
    expect(() =>
      generate({
        workingDays: tinyDays,
        fuelEvents: [
          {
            date: new Date(2026, 0, 5),
            vendor: 'X',
            liters: 200,
            unitPrice: 2,
            totalAmount: 400,
          },
        ],
        locations,
        routeLegs,
        vehicle,
        openingBalance: 50,
      }),
    ).toThrowError(InfeasibleMonthError);
  });

  it('throws InfeasibleMonthError when no Office location is supplied', () => {
    const noOffice = locations.filter(l => l.Type !== 'Office');
    expect(() =>
      generate({
        workingDays: janWorkingDays(),
        fuelEvents,
        locations: noOffice,
        routeLegs,
        vehicle,
        openingBalance: 5,
      }),
    ).toThrowError(InfeasibleMonthError);
  });

  it('handles a fuel event on a non-working day (Saturday) by emitting a fuel row anyway', () => {
    // Jan 10 2026 is Saturday — both fixture invoices are on weekends.
    const rows = generate({
      workingDays: janWorkingDays(),
      fuelEvents,
      locations,
      routeLegs,
      vehicle,
      openingBalance: vehicle.OpeningFuelBalance,
    });
    const sat = rows.find(
      r => r.kind === 'fuel' && r.date && localDateKey(r.date) === '2026-0-10',
    );
    expect(sat).toBeDefined();
  });
});

// ── Formatter tests ─────────────────────────────────────────────────────────

describe('formatFuelRow', () => {
  it('produces the §6 fuel string byte-for-byte', () => {
    const s = formatFuelRow({
      date: new Date(2026, 0, 10),
      vendor: 'Лукойл',
      liters: 40,
      unitPrice: 2.89,
      totalAmount: 115.6,
    });
    expect(s).toBe(
      'Зареждане гориво - Лукойл - 40.00 л * 2.89 лв/л = 115.60 лв общо',
    );
  });
});

describe('formatTripRoute', () => {
  it('joins Office → stops → Office with " - "', () => {
    const stops = [findLoc(2), findLoc(5)];
    expect(formatTripRoute(office, stops)).toBe(
      'Борово - Козлодуй - Враца - Борово',
    );
  });

  it('single stop: Office → X → Office', () => {
    expect(formatTripRoute(office, [findLoc(4)])).toBe(
      'Борово - Бяла Слатина - Борово',
    );
  });
});

// ── Type guard ──────────────────────────────────────────────────────────────

describe('GeneratedRow shape', () => {
  it('every row has a numeric balance', () => {
    const rows: GeneratedRow[] = generate({
      workingDays: janWorkingDays(),
      fuelEvents,
      locations,
      routeLegs,
      vehicle,
      openingBalance: vehicle.OpeningFuelBalance,
    });
    for (const r of rows) {
      expect(typeof r.balance).toBe('number');
      expect(Number.isFinite(r.balance)).toBe(true);
    }
  });
});
