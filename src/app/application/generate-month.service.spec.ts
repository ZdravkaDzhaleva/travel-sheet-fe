import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';

import { GenerateMonthService } from './generate-month.service';
import { CalendarService, type WorkingDaysResult } from './calendar.service';
import { MasterDataService } from './master-data.service';
import { SheetsStore } from '../infrastructure/sheets.store';
import {
  InfeasibleMonthError,
  InsufficientDataError,
  maxDailyRouteKm,
} from '../domain/generation/trip-generator';
import {
  makeCompany,
  makeVehicle,
  makeLocations,
  makeRouteLegs,
  makeInvoices,
  make2026HolidayDates,
} from '../../test-fixtures/index';
import { workingDaysInMonth } from '../domain/calendar/working-day-calendar';
import type {
  Company,
  Invoice,
  Location,
  RouteLeg,
  Vehicle,
} from '../domain/entities/index';
import type { CellModel } from '../domain/mapping/cell-model';

interface Stubs {
  readonly masterData: MasterDataService;
  readonly calendar: CalendarService;
  readonly sheets: SheetsStore;
  readonly loadInvoices: ReturnType<typeof vi.fn>;
  readonly readPriorClosing: ReturnType<typeof vi.fn>;
  readonly writeSheet: ReturnType<typeof vi.fn>;
  readonly workingDaysFor: ReturnType<typeof vi.fn>;
  readonly load: ReturnType<typeof vi.fn>;
}

interface StubOpts {
  readonly company?: Company | null;
  readonly vehicle?: Vehicle | null;
  readonly locations?: readonly Location[];
  readonly routeLegs?: readonly RouteLeg[];
  readonly ready?: boolean;
  readonly invoices?: readonly Invoice[];
  readonly priorClosing?: number | null;
  readonly calendarResult?: WorkingDaysResult;
}

// Default invoice set covers the months exercised by the spec — Jan, Feb,
// Mar, Apr 2026 — so the next-month look-ahead check in
// GenerateMonthService finds an invoice regardless of which month a test
// generates. Tests that override `invoices` must include next-month entries
// themselves or expect InsufficientDataError.
function defaultInvoicesWithLookAhead(): Invoice[] {
  const template = makeInvoices()[0]!;
  const stamp = (id: number, date: Date, liters: number): Invoice => ({
    ...template,
    Id: id,
    InvoiceDate: date,
    QuantityLiters: liters,
  });
  return [
    ...makeInvoices(), // Jan 10 (40 L) and Jan 25 (45 L) for vehicle 1
    stamp(101, new Date(2026, 1, 5), 40),   // Feb 5, 2026
    stamp(102, new Date(2026, 2, 5), 40),   // Mar 5, 2026
    stamp(103, new Date(2026, 3, 5), 40),   // Apr 5, 2026
  ];
}

function makeStubs(opts: StubOpts = {}): Stubs {
  const company = opts.company !== undefined ? opts.company : makeCompany();
  const vehicle = opts.vehicle !== undefined ? opts.vehicle : makeVehicle();
  const locations = opts.locations ?? makeLocations();
  const routeLegs = opts.routeLegs ?? makeRouteLegs();
  const ready = opts.ready ?? true;

  const load = vi.fn(async () => undefined);
  const masterData = {
    company: () => company,
    vehicle: () => vehicle,
    locations: () => locations,
    routeLegs: () => routeLegs,
    ready: () => ready,
    load,
  } as unknown as MasterDataService;

  const workingDaysFor = vi.fn(async (y: number, m: number) => {
    if (opts.calendarResult !== undefined) return opts.calendarResult;
    return {
      workingDays: workingDaysInMonth(y, m, make2026HolidayDates()),
      source: 'api' as const,
      warnings: [] as readonly string[],
    } satisfies WorkingDaysResult;
  });
  const calendar = { workingDaysFor } as unknown as CalendarService;

  const loadInvoices = vi.fn(async () => opts.invoices ?? defaultInvoicesWithLookAhead());
  const readPriorClosing = vi.fn(async () => opts.priorClosing ?? null);
  const writeSheet = vi.fn(async () => ({ workbookId: 'wb-1', sheetId: 123 }));
  const sheets = {
    loadInvoices,
    readPreviousMonthClosing: readPriorClosing,
    writeSheet,
  } as unknown as SheetsStore;

  return { masterData, calendar, sheets, loadInvoices, readPriorClosing, writeSheet, workingDaysFor, load };
}

function makeService(stubs: Stubs): GenerateMonthService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: MasterDataService, useValue: stubs.masterData },
      { provide: CalendarService, useValue: stubs.calendar },
      { provide: SheetsStore, useValue: stubs.sheets },
    ],
  });
  return TestBed.inject(GenerateMonthService);
}

function findCell(cells: readonly CellModel[], a1: string): CellModel | undefined {
  return cells.find(c => c.a1 === a1);
}

describe('GenerateMonthService — happy path', () => {
  it('writes м_01 to the workbook using OpeningFuelBalance when no prior sheet closing exists', async () => {
    const stubs = makeStubs();
    const svc = makeService(stubs);

    const result = await svc.generateMonth(2026, 1);

    expect(stubs.writeSheet).toHaveBeenCalledOnce();
    const [cells, sheetName] = stubs.writeSheet.mock.calls[0] as [CellModel[], string];
    expect(sheetName).toBe('м_01');
    expect(cells.length).toBeGreaterThan(0);
    // Opening row balance lands at the configured OpeningFuelBalance (5.0).
    expect(findCell(cells, 'H13')?.value).toBe(5);

    expect(result.sheetName).toBe('м_01');
    expect(result.openingBalance).toBe(5);
    expect(result.openingSource).toBe('vehicleConfig');
    // Month-end closing is capped only by the next-month look-ahead; it rolls
    // forward as next month's opening. Each fuel event fills the tank to full,
    // so every fuel-row balance stays ≤ tank capacity.
    expect(result.closingBalance).toBeGreaterThanOrEqual(0);
    expect(result.holidaySource).toBe('api');
    expect(svc.loading()).toBe(false);
    expect(svc.error()).toBeNull();
    expect(svc.result()).toEqual(result);
  });

  it('carries forward the prior month closing when SheetsStore returns one', async () => {
    const stubs = makeStubs({ priorClosing: 4.25 });
    const svc = makeService(stubs);

    const result = await svc.generateMonth(2026, 2);

    expect(stubs.readPriorClosing).toHaveBeenCalledWith(2026, 2, expect.objectContaining({ Id: 1 }));
    expect(result.openingBalance).toBe(4.25);
    expect(result.openingSource).toBe('priorSheet');
    const [cells] = stubs.writeSheet.mock.calls[0] as [CellModel[], string];
    expect(findCell(cells, 'H13')?.value).toBe(4.25);
  });

  it('triggers MasterDataService.load() when master data is not yet ready', async () => {
    const stubs = makeStubs({ ready: false });
    const svc = makeService(stubs);
    await svc.generateMonth(2026, 1);
    expect(stubs.load).toHaveBeenCalledOnce();
  });

  it('skips MasterDataService.load() when already ready', async () => {
    const stubs = makeStubs({ ready: true });
    const svc = makeService(stubs);
    await svc.generateMonth(2026, 1);
    expect(stubs.load).not.toHaveBeenCalled();
  });

  it('passes through calendar warnings and source on the result', async () => {
    const stubs = makeStubs({
      calendarResult: {
        workingDays: workingDaysInMonth(2026, 1, make2026HolidayDates()),
        source: 'override',
        warnings: ['Falling back to supporting-sheet override: API 500'],
      },
    });
    const svc = makeService(stubs);
    const result = await svc.generateMonth(2026, 1);
    expect(result.holidaySource).toBe('override');
    expect(result.warnings).toEqual(['Falling back to supporting-sheet override: API 500']);
  });
});

describe('GenerateMonthService — invoice filtering', () => {
  it('uses only invoices whose date is in the target year/month for the active vehicle', async () => {
    const stubs = makeStubs({
      invoices: [
        // In-scope: Jan 2026, vehicle 1
        { ...makeInvoices()[0] },
        // Out-of-scope for current month, in-scope for look-ahead (Feb 5).
        { ...makeInvoices()[0], Id: 11, InvoiceDate: new Date(2026, 1, 5) },
        // Out-of-scope: different vehicle
        { ...makeInvoices()[0], Id: 10, VehicleId: 999 },
        // Out-of-scope: different year
        { ...makeInvoices()[0], Id: 12, InvoiceDate: new Date(2025, 0, 10) },
      ],
    });
    const svc = makeService(stubs);
    const result = await svc.generateMonth(2026, 1);
    // Exactly one fuel row of 40 L should reach the generated rows for January.
    // The Feb invoice is excluded from the current month's fuel events but
    // satisfies the next-month look-ahead.
    const [cells] = stubs.writeSheet.mock.calls[0] as [CellModel[], string];
    const fuelRowCells = cells.filter(
      c => c.a1.startsWith('C') && typeof c.value === 'string' && c.value.startsWith('Зареждане гориво'),
    );
    expect(fuelRowCells).toHaveLength(1);
    expect(fuelRowCells[0].value).toContain('40.00');
    expect(result.rowCount).toBeGreaterThan(0);
  });
});

describe('GenerateMonthService — infeasible month', () => {
  it('surfaces InfeasibleMonthError and never writes when a fuel event arrives too soon to drain the tank', async () => {
    // Pre-fuel infeasibility: opening 50 L with a fuel event on Jan 2 (the first
    // working day of Jan 2026 — Jan 1 is a holiday). Segment 0 has zero working
    // days before Jan 2, so the balance cannot drop from 50 L to the pre-fuel
    // target (capacity − liters) before refueling — generation must fail rather
    // than emit a sheet whose fuel row overflows the tank.
    const tooEarly: Invoice = {
      ...makeInvoices()[0],
      Id: 999,
      InvoiceDate: new Date(2026, 0, 2),
      QuantityLiters: 40,
    };
    const nextMonthAnchor: Invoice = {
      ...makeInvoices()[0],
      Id: 1000,
      InvoiceDate: new Date(2026, 1, 5),
      QuantityLiters: 40,
    };
    const stubs = makeStubs({
      vehicle: makeVehicle({ OpeningFuelBalance: 50 }),
      invoices: [tooEarly, nextMonthAnchor],
    });
    const svc = makeService(stubs);

    await expect(svc.generateMonth(2026, 1)).rejects.toBeInstanceOf(InfeasibleMonthError);
    expect(stubs.writeSheet).not.toHaveBeenCalled();
    expect(svc.error()).toBeInstanceOf(InfeasibleMonthError);
    expect(svc.result()).toBeNull();
    expect(svc.loading()).toBe(false);
  });
});

describe('GenerateMonthService — next-month look-ahead', () => {
  it('throws InsufficientDataError and never writes when the next month has no invoice for the active vehicle', async () => {
    // Only January invoices — no February → look-ahead can't anchor the
    // trailing-segment cap.
    const stubs = makeStubs({ invoices: makeInvoices() });
    const svc = makeService(stubs);

    await expect(svc.generateMonth(2026, 1)).rejects.toBeInstanceOf(InsufficientDataError);
    expect(stubs.writeSheet).not.toHaveBeenCalled();
    expect(svc.error()).toBeInstanceOf(InsufficientDataError);
    expect(svc.error()!.message).toContain('February 2026');
  });

  it('treats next-month invoices for a DIFFERENT vehicle as missing data', async () => {
    // Feb invoice exists but for a different vehicle — same as no Feb data.
    const stubs = makeStubs({
      invoices: [
        ...makeInvoices(),
        { ...makeInvoices()[0], Id: 200, InvoiceDate: new Date(2026, 1, 5), VehicleId: 999 },
      ],
    });
    const svc = makeService(stubs);

    await expect(svc.generateMonth(2026, 1)).rejects.toBeInstanceOf(InsufficientDataError);
  });

  it('caps the closing balance using the next-month first-fuel constraint (Jan 2026 + Feb 4 anchor)', async () => {
    // Opening 37.34 + Jan fuels 60.23 (Jan 8) + 60.82 (Jan 26) + next-month
    // anchor 40 L on Feb 4. Feb fills the tank to (66 − 40) = 26 L, and the 2
    // working days before Feb 4 (Feb 2, 3) can each burn at most the longest
    // available route — so Jan's closing is capped at that target plus that burn.
    // The cap MUST use the same per-day ceiling the generator enforces (the
    // longest route), not MAX_KM_PER_DAY, or Feb becomes infeasible.
    const vehicle = makeVehicle({ OpeningFuelBalance: 37.34 });
    const userInvoices: Invoice[] = [
      { ...makeInvoices()[0], Id: 301, InvoiceDate: new Date(2026, 0, 8), QuantityLiters: 60.23 },
      { ...makeInvoices()[0], Id: 302, InvoiceDate: new Date(2026, 0, 26), QuantityLiters: 60.82 },
      { ...makeInvoices()[0], Id: 303, InvoiceDate: new Date(2026, 1, 4),  QuantityLiters: 40 },
    ];
    const stubs = makeStubs({ vehicle, invoices: userInvoices });
    const svc = makeService(stubs);

    const maxDayKm = maxDailyRouteKm(makeLocations(), makeRouteLegs());
    const trailingTmax =
      (vehicle.TankCapacityLiters - 40) +
      (2 * maxDayKm * vehicle.AverageConsumptionLitersPer100Km) / 100;

    const result = await svc.generateMonth(2026, 1);
    expect(result.closingBalance).toBeGreaterThanOrEqual(0);
    expect(result.closingBalance).toBeLessThanOrEqual(trailingTmax + 1e-6);
  });
});
