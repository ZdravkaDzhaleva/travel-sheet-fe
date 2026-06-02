import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';

import { GenerateMonthService } from './generate-month.service';
import { CalendarService, type WorkingDaysResult } from './calendar.service';
import { MasterDataService } from './master-data.service';
import { SheetsStore } from '../infrastructure/sheets.store';
import { InfeasibleMonthError } from '../domain/generation/trip-generator';
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

  const calendarResult: WorkingDaysResult =
    opts.calendarResult ?? {
      workingDays: workingDaysInMonth(2026, 1, make2026HolidayDates()),
      source: 'api',
      warnings: [],
    };
  const workingDaysFor = vi.fn(async () => calendarResult);
  const calendar = { workingDaysFor } as unknown as CalendarService;

  const loadInvoices = vi.fn(async () => opts.invoices ?? makeInvoices());
  const readPriorClosing = vi.fn(async () => opts.priorClosing ?? null);
  const writeSheet = vi.fn(async () => undefined);
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
    expect(result.closingBalance).toBeGreaterThanOrEqual(0);
    expect(result.closingBalance).toBeLessThanOrEqual(8);
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
        // Out-of-scope: different vehicle
        { ...makeInvoices()[0], Id: 10, VehicleId: 999 },
        // Out-of-scope: different month
        { ...makeInvoices()[0], Id: 11, InvoiceDate: new Date(2026, 1, 5) },
        // Out-of-scope: different year
        { ...makeInvoices()[0], Id: 12, InvoiceDate: new Date(2025, 0, 10) },
      ],
    });
    const svc = makeService(stubs);
    const result = await svc.generateMonth(2026, 1);
    // Exactly one fuel row of 40 L should reach the generated rows
    // (the three out-of-scope invoices are filtered out).
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
  it('surfaces InfeasibleMonthError and never writes when generation cannot land in [0,8]', async () => {
    // Over-fuel: 500 L in a single month is impossible to burn within working-day caps.
    const overFueled: Invoice = {
      ...makeInvoices()[0],
      Id: 999,
      InvoiceDate: new Date(2026, 0, 5),
      QuantityLiters: 500,
    };
    const stubs = makeStubs({ invoices: [overFueled] });
    const svc = makeService(stubs);

    await expect(svc.generateMonth(2026, 1)).rejects.toBeInstanceOf(InfeasibleMonthError);
    expect(stubs.writeSheet).not.toHaveBeenCalled();
    expect(svc.error()).toBeInstanceOf(InfeasibleMonthError);
    expect(svc.result()).toBeNull();
    expect(svc.loading()).toBe(false);
  });
});
