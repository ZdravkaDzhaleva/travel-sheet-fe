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
  FUEL_FILL_TOLERANCE_L,
  MAX_KM_PER_DAY,
  MAX_STOPS_PER_DAY,
} from '../../core/config/generation.config';
import type { GeneratedRow, Location, RouteLeg } from '../entities/index';

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

  it('post-fuel balance never exceeds the tank capacity (the 98.15 L bug)', () => {
    // A fuel event fills the tank to full: H_fuel = H_prev + liters must never
    // climb above TankCapacityLiters. The trips before it drain the balance to
    // ≤ (capacity − liters) so the top-up cannot overflow the tank.
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].kind !== 'fuel') continue;
      const preFuel = rows[i - 1]!.balance;
      const postFuel = rows[i].balance;
      expect(preFuel).toBeGreaterThanOrEqual(BALANCE_MIN);
      expect(postFuel).toBeLessThanOrEqual(vehicle.TankCapacityLiters + 1e-6);
      // Column arithmetic holds: post = pre + liters.
      expect(postFuel).toBeCloseTo(round2(preFuel + rows[i].fueled!), 6);
    }
  });

  it('month-end closing balance is unconstrained but non-negative', () => {
    // After the last fuel event of the month, there is no upper-bound target —
    // whatever is left rolls forward as next month's opening balance.
    const closing = rows[rows.length - 1].balance;
    expect(closing).toBeGreaterThanOrEqual(BALANCE_MIN);
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

  it('non-zero trip km vary across the month (picker is not stuck on one value)', () => {
    const tripKms = rows
      .filter(r => r.kind === 'trip')
      .map(r => r.km!);
    expect(tripKms.length).toBeGreaterThan(0);
    const distinct = new Set(tripKms);
    // In the fixture only single-stop trips fit under MAX_KM_PER_DAY (60, 70,
    // 80 km — every two-stop trip exceeds 80 km), so 3 is the ceiling. The
    // range-based picker should hit all three over a 21-day month; the old
    // closest-to-desired picker would collapse to 1.
    expect(distinct.size).toBeGreaterThanOrEqual(2);
    // No single value should dominate: nothing > 80% of all trips.
    const maxFrac = Math.max(
      ...[...distinct].map(km => tripKms.filter(k => k === km).length / tripKms.length),
    );
    expect(maxFrac).toBeLessThan(0.8);
  });

  it('zero-trip rows are forced: balance too low for any route, or driving would break the brim-fill', () => {
    // A zero-trip is never voluntary. It is emitted only when the smallest route
    // does not fit the day's feasible window — i.e. the balance cannot afford it,
    // OR driving it would drain the balance below the next fuel event's fill
    // floor (capacity − liters − tolerance), spoiling the fill-to-full target.
    const avg = vehicle.AverageConsumptionLitersPer100Km;
    const cap = vehicle.TankCapacityLiters;
    const tripKms = rows
      .filter(r => r.kind === 'trip')
      .map(r => r.km!)
      .sort((a, b) => a - b);
    if (tripKms.length === 0) return; // nothing to assert about
    const minConsumed = round2((tripKms[0]! * avg) / 100);
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].kind !== 'zero') continue;
      const balanceBefore = rows[i - 1]!.balance;
      const nextFuel = rows.slice(i + 1).find(r => r.kind === 'fuel');
      const fillFloor = nextFuel
        ? Math.max(BALANCE_MIN, cap - nextFuel.fueled! - FUEL_FILL_TOLERANCE_L)
        : BALANCE_MIN;
      const unaffordable = balanceBefore < minConsumed;
      const wouldOverDrain = balanceBefore - minConsumed < fillFloor - 1e-9;
      expect(unaffordable || wouldOverDrain).toBe(true);
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
    // A 200 L top-up exceeds the 66 L tank capacity outright — a single fill can
    // never add more than the tank holds, so generation must fail.
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

  it('respects a finite trailingTmax on the closing balance', () => {
    // Pass a finite trailingTmax and confirm the closing balance lands at or
    // below it. After the last fill the tank is near-full (~66 L), and the
    // trailing days can burn it down to ≤ 30 L, so 30 is reachable.
    const rows = generate({
      workingDays: janWorkingDays(),
      fuelEvents,
      locations,
      routeLegs,
      vehicle,
      openingBalance: vehicle.OpeningFuelBalance,
      trailingTmax: 30,
    });
    const closing = rows[rows.length - 1]!.balance;
    expect(closing).toBeGreaterThanOrEqual(0);
    expect(closing).toBeLessThanOrEqual(30 + 1e-6);
  });

  it('throws InfeasibleMonthError with a trailing-specific message when trailingTmax cannot be reached', () => {
    // Trailing segment has 5 working days × 80 km × 11.5/100 = 46 L burn
    // capacity. With opening 5 + large fuels (60 L on Jan 10 + 60 L on Jan
    // 25) the trailing start balance is ~60 L even in the optimistic case;
    // with trailingTmax = 0 the closing balance cannot land in [0, 0], so
    // the pre-flight check must throw the new trailing-specific message.
    const bigFuels = [
      { date: new Date(2026, 0, 10), vendor: 'X', liters: 60, unitPrice: 2, totalAmount: 120 },
      { date: new Date(2026, 0, 25), vendor: 'X', liters: 60, unitPrice: 2, totalAmount: 120 },
    ];
    try {
      generate({
        workingDays: janWorkingDays(),
        fuelEvents: bigFuels,
        locations,
        routeLegs,
        vehicle,
        openingBalance: vehicle.OpeningFuelBalance,
        trailingTmax: 0,
      });
      expect.fail('expected generate() to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(InfeasibleMonthError);
      expect((e as Error).message).toContain("Next month's first fuel cannot be absorbed");
    }
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

// ── Regression: user-reported January 2026 scenario ────────────────────────

describe('generate — January 2026 with 37.34 L opening + 60.23 L + 60.82 L', () => {
  // The user-reported scenario that produced the impossible 98.15 L fuel-row
  // balance. With realistic near-full fills (≈60 L into a 66 L tank), each
  // top-up must land at the tank capacity — never above it.
  const userFuels = [
    {
      date: new Date(2026, 0, 8),
      vendor: 'Лукойл',
      liters: 60.230,
      unitPrice: 2.89,
      totalAmount: 174.06,
    },
    {
      date: new Date(2026, 0, 26),
      vendor: 'Лукойл',
      liters: 60.82,
      unitPrice: 2.89,
      totalAmount: 175.77,
    },
  ];

  it('never overflows the tank: every fuel-row balance stays ≤ capacity', () => {
    const rows = generate({
      workingDays: janWorkingDays(),
      fuelEvents: userFuels,
      locations,
      routeLegs,
      vehicle,
      openingBalance: 37.34,
    });

    for (let i = 0; i < rows.length; i++) {
      if (rows[i].kind !== 'fuel') continue;
      const preFuel = rows[i - 1]!.balance;
      const postFuel = rows[i].balance;
      expect(preFuel).toBeGreaterThanOrEqual(BALANCE_MIN);
      expect(postFuel).toBeLessThanOrEqual(vehicle.TankCapacityLiters + 1e-6);
      expect(postFuel).toBeCloseTo(round2(preFuel + rows[i].fueled!), 6);
    }

    // Closing rolls forward as Feb opening; only constraint here is non-negative.
    const closing = rows[rows.length - 1]!.balance;
    expect(closing).toBeGreaterThanOrEqual(BALANCE_MIN);
  });
});

// ── Capacity-fill behaviour (tight [C − 0.5, C] window) ─────────────────────

describe('generate — fuel events fill the tank to (near) full', () => {
  it('lands the post-fuel balance in [C − 0.5, C] when a route fits the window', () => {
    // Deterministic single-pre-fuel-day month: tank 60 L, opening 18 L, one
    // 50 L fill. Pre-fuel target = 60 − 50 = 10 L (window [9.5, 10]). The only
    // route whose burn fits is 70 km → 8.05 L → pre 9.95 L → post 59.95 L.
    const cap = 60;
    const v = makeVehicle({ TankCapacityLiters: cap });
    const fuel = {
      date: new Date(2026, 0, 7),
      vendor: 'Лукойл',
      liters: 50,
      unitPrice: 2.89,
      totalAmount: 144.5,
    };
    const rows = generate({
      workingDays: [new Date(2026, 0, 6)],
      fuelEvents: [fuel],
      locations,
      routeLegs,
      vehicle: v,
      openingBalance: 18,
    });
    const fuelRow = rows.find(r => r.kind === 'fuel')!;
    expect(fuelRow.balance).toBeLessThanOrEqual(cap + 1e-6);
    expect(fuelRow.balance).toBeGreaterThanOrEqual(cap - FUEL_FILL_TOLERANCE_L - 1e-6);
  });

  it('throws InfeasibleMonthError rather than overflow when the tank cannot be drained in time', () => {
    // Opening 60 L, a 55 L fill the next day with a single working day before it:
    // one day burns at most 9.2 L, far short of the 49 L needed to drop the tank
    // to 11 L. Refusing (throwing) is correct — the alternative is an impossible
    // 60 + 55 = 115 L over-capacity balance.
    expect(() =>
      generate({
        workingDays: [new Date(2026, 0, 6)],
        fuelEvents: [
          { date: new Date(2026, 0, 7), vendor: 'X', liters: 55, unitPrice: 2, totalAmount: 110 },
        ],
        locations,
        routeLegs,
        vehicle,
        openingBalance: 60,
      }),
    ).toThrowError(InfeasibleMonthError);
  });

  it('counts a same-day trip in the POST-fuel segment even when the invoice time differs from the working-day time', () => {
    // A fuel invoice on Jan 9 at 02:00 (a non-midnight timestamp, as real
    // supporting-sheet dates can be) shares its CALENDAR day with the Jan 9
    // working day (constructed at local midnight). The fuel row is emitted first,
    // so the Jan 9 trip drains the refilled tank and belongs to the POST-fuel
    // (trailing) segment — it must NOT be counted as a pre-fuel draining day.
    // Pre-fuel draining therefore has only Jan 7 + Jan 8 to drop 44 L → ≤ 26 L
    // (capacity 66 − 40 L), which the floor forces deterministically. A raw
    // timestamp split would have lumped Jan 9 into the pre-fuel segment, relaxed
    // the floor, and overflowed the tank at the top-up.
    const workingDays = [
      new Date(2026, 0, 7),
      new Date(2026, 0, 8),
      new Date(2026, 0, 9),
    ];
    const fuel = {
      date: new Date(2026, 0, 9, 2, 0, 0),
      vendor: 'Лукойл',
      liters: 40,
      unitPrice: 2.89,
      totalAmount: 115.6,
    };
    const rows = generate({
      workingDays,
      fuelEvents: [fuel],
      locations,
      routeLegs,
      vehicle,
      openingBalance: 44,
    });
    const fuelIdx = rows.findIndex(r => r.kind === 'fuel');
    const preFuel = rows[fuelIdx - 1]!.balance;
    const postFuel = rows[fuelIdx]!.balance;
    const preFuelTarget = vehicle.TankCapacityLiters - fuel.liters; // 26
    expect(preFuel).toBeLessThanOrEqual(preFuelTarget + 1e-6);
    expect(postFuel).toBeLessThanOrEqual(vehicle.TankCapacityLiters + 1e-6);
    expect(postFuel).toBeCloseTo(round2(preFuel + fuel.liters), 6);
    // The Jan 9 trip sits AFTER the fuel row and drains the refilled tank.
    const sameDayTrip = rows
      .slice(fuelIdx + 1)
      .find(r => r.kind === 'trip' || r.kind === 'zero');
    expect(sameDayTrip).toBeDefined();
    expect(sameDayTrip!.balance).toBeLessThanOrEqual(postFuel + 1e-6);
  });

  it('bases the drain budget on the longest available route, not MAX_KM_PER_DAY', () => {
    // The longest route here is a 60 km round trip (office → 30 km project →
    // office), well below MAX_KM_PER_DAY (80). At avg 12 L/100km that burns only
    // 7.2 L/day, so 3 working days can shed at most 21.6 L — not the 24 L needed
    // to drop 30 L → ≤ 6 L (capacity 62 − 56 L fill) before the top-up. The guard
    // must reject this up front ("arrives too soon"). Using MAX_KM_PER_DAY (80 →
    // 9.6 L/day → 28.8 L) would wrongly pass the check and then overflow the tank.
    const offc: Location = { Id: 1, CompanyId: 1, Name: 'Борово', Type: 'Office', NameBg: 'Борово', Address: '' };
    const proj: Location = { Id: 2, CompanyId: 1, Name: 'Обект', Type: 'Project', NameBg: 'Обект', Address: '' };
    const legs: RouteLeg[] = [
      { Id: 1, RouteName: 'Борово - Обект', StartPointId: 1, EndPointId: 2, DistanceKm: 30 },
    ];
    const v = makeVehicle({ TankCapacityLiters: 62, AverageConsumptionLitersPer100Km: 12 });
    try {
      generate({
        workingDays: [new Date(2026, 0, 5), new Date(2026, 0, 6), new Date(2026, 0, 7)],
        fuelEvents: [
          { date: new Date(2026, 0, 8), vendor: 'Лукойл', liters: 56, unitPrice: 2, totalAmount: 112 },
        ],
        locations: [offc, proj],
        routeLegs: legs,
        vehicle: v,
        openingBalance: 30,
      });
      expect.fail('expected generate() to throw InfeasibleMonthError');
    } catch (e) {
      expect(e).toBeInstanceOf(InfeasibleMonthError);
      expect((e as Error).message).toContain('arrives too soon');
    }
  });

  it('throws InfeasibleMonthError when a single fuel event exceeds the tank capacity', () => {
    expect(() =>
      generate({
        workingDays: janWorkingDays(),
        fuelEvents: [
          {
            date: new Date(2026, 0, 10),
            vendor: 'X',
            liters: vehicle.TankCapacityLiters + 5,
            unitPrice: 2,
            totalAmount: 142,
          },
        ],
        locations,
        routeLegs,
        vehicle,
        openingBalance: vehicle.OpeningFuelBalance,
      }),
    ).toThrowError(InfeasibleMonthError);
  });

  it('fills the tank to the brim window [C − 0.5, C] when routes are fine enough to fine-tune', () => {
    // Fine route grid (round trips 20..110 km in 2 km steps ≈ 0.24 L), draining a
    // full 62 L tank over 12 days down to a 60.5 L fill (pre-fuel window
    // [1.0, 1.5] → post-fuel window [61.5, 62]). The brim-trap avoidance keeps the
    // window reachable on the final approach, so every fuel row lands at the brim.
    const office: Location = { Id: 1, CompanyId: 1, Name: 'O', Type: 'Office', NameBg: 'O', Address: '' };
    const projects: Location[] = [];
    const legs: RouteLeg[] = [];
    let id = 2;
    let legId = 1;
    for (let half = 10; half <= 55; half++) {
      projects.push({ Id: id, CompanyId: 1, Name: 'P' + id, Type: 'Project', NameBg: 'P' + id, Address: '' });
      legs.push({ Id: legId++, RouteName: 'O-' + id, StartPointId: 1, EndPointId: id, DistanceKm: half });
      id++;
    }
    for (let a = 0; a < projects.length; a++)
      for (let b = a + 1; b < projects.length; b++)
        legs.push({ Id: legId++, RouteName: 'x', StartPointId: projects[a].Id, EndPointId: projects[b].Id, DistanceKm: 500 });

    const v = makeVehicle({ TankCapacityLiters: 62, AverageConsumptionLitersPer100Km: 12 });
    const workingDays = Array.from({ length: 12 }, (_, i) => new Date(2026, 0, 5 + i));
    const fuel = { date: new Date(2026, 0, 19), vendor: 'X', liters: 60.5, unitPrice: 1, totalAmount: 60.5 };

    for (let run = 0; run < 20; run++) {
      const rows = generate({
        workingDays,
        fuelEvents: [fuel],
        locations: [office, ...projects],
        routeLegs: legs,
        vehicle: v,
        openingBalance: 62,
      });
      const fuelRow = rows.find(r => r.kind === 'fuel')!;
      expect(fuelRow.balance).toBeLessThanOrEqual(62 + 1e-6);
      expect(fuelRow.balance).toBeGreaterThanOrEqual(62 - FUEL_FILL_TOLERANCE_L - 1e-6);
    }
  });

  it('lands as close to the brim as the routes allow when the window is unreachable', () => {
    // The March 3 case: open 8.13 L, fuel 57.9 L with only ONE working day before
    // it (tank 62 → pre-fuel window [3.6, 4.1] L). Hitting that window needs a
    // ~34–37 km trip, but the shortest route is 40 km, so the window is
    // unreachable in one day. The look-ahead must still pick the trip that lands
    // CLOSEST to the window (40 km → pre 3.33 → post 61.23), not an arbitrary
    // deeper under-fill (a 50 km trip → post 59.97).
    const office: Location = { Id: 1, CompanyId: 1, Name: 'O', Type: 'Office', NameBg: 'O', Address: '' };
    const projects: Location[] = [];
    const legs: RouteLeg[] = [];
    let id = 2;
    let legId = 1;
    for (let half = 20; half <= 55; half++) {
      projects.push({ Id: id, CompanyId: 1, Name: 'P' + id, Type: 'Project', NameBg: 'P' + id, Address: '' });
      legs.push({ Id: legId++, RouteName: 'O-' + id, StartPointId: 1, EndPointId: id, DistanceKm: half });
      id++;
    }
    for (let a = 0; a < projects.length; a++)
      for (let b = a + 1; b < projects.length; b++)
        legs.push({ Id: legId++, RouteName: 'x', StartPointId: projects[a].Id, EndPointId: projects[b].Id, DistanceKm: 500 });

    const v = makeVehicle({ TankCapacityLiters: 62, AverageConsumptionLitersPer100Km: 12 });
    const fuel = { date: new Date(2026, 2, 3), vendor: 'OMV', liters: 57.9, unitPrice: 1.44, totalAmount: 83.38 };

    for (let run = 0; run < 20; run++) {
      const rows = generate({
        workingDays: [new Date(2026, 2, 2)],
        fuelEvents: [fuel],
        locations: [office, ...projects],
        routeLegs: legs,
        vehicle: v,
        openingBalance: 8.13,
      });
      const fuelRow = rows.find(r => r.kind === 'fuel')!;
      expect(fuelRow.balance).toBeLessThanOrEqual(62 + 1e-6);
      // 40 km is the closest the routes get: pre 3.33 → post 61.23. Must be at
      // least that close to the brim, never the deeper 59.97 under-fill.
      expect(fuelRow.balance).toBeGreaterThanOrEqual(61.2 - 1e-6);
    }
  });

  it('drains a tight short segment via look-ahead instead of overflowing the tank', () => {
    // The reported February case: open 19.12 L, a 61.46 L fill 2 working days
    // later (tank 62 → pre-fuel must reach ≤ 0.54 L). Greedy even-pacing left the
    // last day needing a trip that fell in a route gap → zero-trip → overflow
    // (post 72.48 L). With a fine route set the look-ahead finds the two-day
    // combination that lands in the window, so it never overflows.
    const office: Location = { Id: 1, CompanyId: 1, Name: 'O', Type: 'Office', NameBg: 'O', Address: '' };
    const projects: Location[] = [];
    const legs: RouteLeg[] = [];
    let id = 2;
    let legId = 1;
    for (let half = 10; half <= 55; half++) {
      projects.push({ Id: id, CompanyId: 1, Name: 'P' + id, Type: 'Project', NameBg: 'P' + id, Address: '' });
      legs.push({ Id: legId++, RouteName: 'O-' + id, StartPointId: 1, EndPointId: id, DistanceKm: half });
      id++;
    }
    for (let a = 0; a < projects.length; a++)
      for (let b = a + 1; b < projects.length; b++)
        legs.push({ Id: legId++, RouteName: 'x', StartPointId: projects[a].Id, EndPointId: projects[b].Id, DistanceKm: 500 });

    const v = makeVehicle({ TankCapacityLiters: 62, AverageConsumptionLitersPer100Km: 12 });
    const workingDays = [new Date(2026, 1, 2), new Date(2026, 1, 3)];
    const fuel = { date: new Date(2026, 1, 4), vendor: 'X', liters: 61.46, unitPrice: 1, totalAmount: 61.46 };

    for (let run = 0; run < 20; run++) {
      const rows = generate({
        workingDays,
        fuelEvents: [fuel],
        locations: [office, ...projects],
        routeLegs: legs,
        vehicle: v,
        openingBalance: 19.12,
      });
      const fuelRow = rows.find(r => r.kind === 'fuel')!;
      expect(fuelRow.balance).toBeLessThanOrEqual(62 + 1e-6);
      expect(fuelRow.balance).toBeGreaterThanOrEqual(62 - FUEL_FILL_TOLERANCE_L - 1e-6);
    }
  });

  it('paces driving across the segment instead of clumping zero-trips at the end', () => {
    // Dense pre-fuel segment: a full 62 L tank must drop to ≤ 2 L (62 − 60 L
    // fill) over 10 working days — ~50 km/day at avg 12. Short routes exist
    // (40 km round trip), so EVERY day can carry a trip. Without even-pacing the
    // picker drained ~70+ km/day, hit the target early, and left a run of
    // zero-trips before the fuel; pacing must keep that from happening.
    const office: Location = { Id: 1, CompanyId: 1, Name: 'O', Type: 'Office', NameBg: 'O', Address: '' };
    const projects: Location[] = [];
    const legs: RouteLeg[] = [];
    [20, 25, 30, 35, 40, 45, 50, 55].forEach((d, i) => {
      const id = i + 2;
      projects.push({ Id: id, CompanyId: 1, Name: 'P' + id, Type: 'Project', NameBg: 'P' + id, Address: '' });
      legs.push({ Id: id, RouteName: 'O-P' + id, StartPointId: 1, EndPointId: id, DistanceKm: d });
    });
    // Inter-project legs large enough that every multi-stop combo exceeds the
    // daily km cap and is discarded, leaving the single-stop 40..110 km set.
    let legId = 100;
    for (let a = 0; a < projects.length; a++)
      for (let b = a + 1; b < projects.length; b++)
        legs.push({ Id: legId++, RouteName: 'x', StartPointId: projects[a].Id, EndPointId: projects[b].Id, DistanceKm: 200 });

    const v = makeVehicle({ TankCapacityLiters: 62, AverageConsumptionLitersPer100Km: 12 });
    const workingDays = Array.from({ length: 10 }, (_, i) => new Date(2026, 0, 5 + i));
    const fuel = { date: new Date(2026, 0, 16), vendor: 'X', liters: 60, unitPrice: 1, totalAmount: 60 };

    // Randomised picker — assert the invariant holds across several runs.
    for (let run = 0; run < 30; run++) {
      const rows = generate({
        workingDays,
        fuelEvents: [fuel],
        locations: [office, ...projects],
        routeLegs: legs,
        vehicle: v,
        openingBalance: 62,
      });
      const fuelIdx = rows.findIndex(r => r.kind === 'fuel');
      let maxRun = 0;
      let cur = 0;
      for (let i = 0; i < fuelIdx; i++) {
        if (rows[i].kind === 'zero') cur++;
        else cur = 0;
        maxRun = Math.max(maxRun, cur);
      }
      expect(maxRun).toBeLessThanOrEqual(2);
    }
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
