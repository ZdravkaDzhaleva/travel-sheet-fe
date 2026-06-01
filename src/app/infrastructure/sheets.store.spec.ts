import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';

import { SheetsStore, groupByRow } from './sheets.store';
import {
  WorkbookNotFoundError,
  MasterDataParseError,
} from './sheets-store.errors';
import { SheetsClient } from '../core/google/sheets.client';
import { DriveClient } from '../core/google/drive.client';
import type { CellModel } from '../domain/mapping/cell-model';
import { makeVehicle } from '../../test-fixtures/index';

interface SheetsStubState {
  values: Map<string, (string | number | boolean | null)[][]>;
  appended: { range: string; values: unknown[][] }[];
  written: { range: string; values: unknown[][] }[];
  batches: { requests: unknown[] }[];
  meta: { sheets: { properties: { sheetId: number; title: string } }[] };
}

function makeSheetsStub(state: Partial<SheetsStubState> = {}): {
  client: SheetsClient;
  state: SheetsStubState;
} {
  const s: SheetsStubState = {
    values: state.values ?? new Map(),
    appended: state.appended ?? [],
    written: state.written ?? [],
    batches: state.batches ?? [],
    meta: state.meta ?? { sheets: [{ properties: { sheetId: 0, title: 'Sheet1' } }] },
  };
  const client = {
    valuesGet: vi.fn(async (_id: string, range: string) => ({
      range,
      majorDimension: 'ROWS' as const,
      values: s.values.get(range),
    })),
    valuesUpdate: vi.fn(async (_id: string, range: string, values: unknown[][]) => {
      s.written.push({ range, values });
      return { spreadsheetId: 'wb', updatedRange: range, updatedRows: values.length, updatedColumns: 8, updatedCells: 0 };
    }),
    valuesAppend: vi.fn(async (_id: string, range: string, values: unknown[][]) => {
      s.appended.push({ range, values });
      return { spreadsheetId: 'sup' };
    }),
    batchUpdate: vi.fn(async (_id: string, requests: unknown[]) => {
      s.batches.push({ requests });
      return { spreadsheetId: 'wb' };
    }),
    getSpreadsheet: vi.fn(async () => ({ spreadsheetId: 'wb', sheets: s.meta.sheets })),
  } as unknown as SheetsClient;
  return { client, state: s };
}

function makeDriveStub(opts: { workbookId?: string; folderId?: string } = {}): DriveClient {
  return {
    findByName: vi.fn(async (name: string) => {
      if (name === 'FILL_ME_DRIVE_FOLDER_NAME') {
        return opts.folderId === undefined
          ? { id: 'folder-1', name, mimeType: 'application/vnd.google-apps.folder' }
          : null;
      }
      if (name === 'FILL_ME_WORKBOOK_NAME') {
        return opts.workbookId === undefined
          ? { id: 'wb-1', name, mimeType: 'application/vnd.google-apps.spreadsheet' }
          : null;
      }
      return null;
    }),
  } as unknown as DriveClient;
}

function makeStore(opts: {
  sheets?: ReturnType<typeof makeSheetsStub>['client'];
  drive?: DriveClient;
  sheetsState?: SheetsStubState;
} = {}): { store: SheetsStore; state: SheetsStubState } {
  const stubbed = opts.sheets
    ? { client: opts.sheets, state: opts.sheetsState! }
    : makeSheetsStub();
  const drive = opts.drive ?? makeDriveStub();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: SheetsClient, useValue: stubbed.client },
      { provide: DriveClient, useValue: drive },
    ],
  });
  return { store: TestBed.inject(SheetsStore), state: stubbed.state };
}

describe('SheetsStore — loaders', () => {
  it('loadCompanies parses numeric Id and ReportingYear', async () => {
    const { client, state } = makeSheetsStub();
    state.values.set('Company!A2:E', [['1', 'Уи Денс', '206884907', 'addr', '2026']]);
    const { store } = makeStore({ sheets: client, sheetsState: state });
    const out = await store.loadCompanies();
    expect(out).toEqual([
      { Id: 1, Name: 'Уи Денс', Eik: '206884907', Address: 'addr', ReportingYear: 2026 },
    ]);
  });

  it('loadVehicles parses booleans and floats', async () => {
    const { client, state } = makeSheetsStub();
    state.values.set('Vehicle!A2:J', [
      ['1', '1', 'GLC', 'СА 1', 'дизел', '4+1', '11.5', '66', 'TRUE', '5'],
    ]);
    const { store } = makeStore({ sheets: client, sheetsState: state });
    const out = await store.loadVehicles();
    expect(out[0].IsActive).toBe(true);
    expect(out[0].AverageConsumptionLitersPer100Km).toBe(11.5);
    expect(out[0].SeatCount).toBe('4+1');
  });

  it('loadLocations rejects unknown Type values', async () => {
    const { client, state } = makeSheetsStub();
    state.values.set('Location!A2:F', [['1', '1', 'X', 'Bogus', 'X', '']]);
    const { store } = makeStore({ sheets: client, sheetsState: state });
    await expect(store.loadLocations()).rejects.toBeInstanceOf(MasterDataParseError);
  });

  it('loadLocations accepts each valid LocationType', async () => {
    const { client, state } = makeSheetsStub();
    state.values.set('Location!A2:F', [
      ['1', '1', 'O', 'Office', 'Borovo', ''],
      ['2', '1', 'P', 'Project', 'Kozloduy', ''],
      ['3', '1', 'A', 'Architect', 'Vratsa', ''],
      ['4', '1', 'C', 'Constructor', 'Pleven', ''],
    ]);
    const { store } = makeStore({ sheets: client, sheetsState: state });
    const out = await store.loadLocations();
    expect(out.map(l => l.Type)).toEqual(['Office', 'Project', 'Architect', 'Constructor']);
  });

  it('loadRoutes parses every numeric field', async () => {
    const { client, state } = makeSheetsStub();
    state.values.set('Route!A2:E', [['1', 'A - B', '1', '2', '35']]);
    const { store } = makeStore({ sheets: client, sheetsState: state });
    const out = await store.loadRoutes();
    expect(out[0]).toEqual({
      Id: 1,
      RouteName: 'A - B',
      StartPointId: 1,
      EndPointId: 2,
      DistanceKm: 35,
    });
  });

  it('loadInvoices parses both ISO and DD.MM.YYYY dates', async () => {
    const { client, state } = makeSheetsStub();
    state.values.set('Invoice!A2:K', [
      ['1', '1', '2026', '1', 'Лукойл', '2026-01-10', '40', '2.89', '115.60', 'BGN', 'drive-1'],
      ['2', '1', '2026', '1', 'Лукойл', '25.01.2026', '45', '2.89', '130.05', 'BGN', 'drive-2'],
    ]);
    const { store } = makeStore({ sheets: client, sheetsState: state });
    const out = await store.loadInvoices();
    expect(out[0].InvoiceDate.getTime()).toBe(new Date('2026-01-10').getTime());
    expect(out[1].InvoiceDate.getFullYear()).toBe(2026);
    expect(out[1].InvoiceDate.getMonth()).toBe(0); // January
    expect(out[1].InvoiceDate.getDate()).toBe(25);
  });

  it('returns empty array when the response has no values', async () => {
    const { store } = makeStore();
    const out = await store.loadCompanies();
    expect(out).toEqual([]);
  });
});

// ── appendInvoice ────────────────────────────────────────────────────────────

describe('SheetsStore.appendInvoice', () => {
  it('appends a row to Invoice!A:K in the supporting sheet, with the date as YYYY-MM-DD', async () => {
    const { store, state } = makeStore();
    await store.appendInvoice({
      Id: 99,
      CompanyId: 1,
      ReportingYear: 2026,
      VehicleId: 1,
      FuelVendor: 'Лукойл',
      InvoiceDate: new Date(2026, 0, 15),
      QuantityLiters: 40,
      UnitPrice: 2.89,
      TotalAmount: 115.60,
      Currency: 'BGN',
      DriveFileId: 'drive-99',
    });
    expect(state.appended).toHaveLength(1);
    expect(state.appended[0].range).toBe('Invoice!A:K');
    expect(state.appended[0].values[0]).toEqual([
      99, 1, 2026, 1, 'Лукойл', '2026-01-15', 40, 2.89, 115.60, 'BGN', 'drive-99',
    ]);
  });
});

// ── writeSheet ───────────────────────────────────────────────────────────────

describe('SheetsStore.writeSheet', () => {
  const CELLS: CellModel[] = [
    { a1: 'A1', value: 'company' },
    { a1: 'A2', value: 'eik' },
    { a1: 'C13', value: 'opening' },
  ];

  it('adds the sheet via batchUpdate, then writes values', async () => {
    const { store, state } = makeStore();
    await store.writeSheet(CELLS, 'м_01');
    expect(state.batches).toHaveLength(1);
    expect(state.batches[0].requests).toEqual([
      { addSheet: { properties: { title: 'м_01' } } },
    ]);
    expect(state.written).toHaveLength(1);
    expect(state.written[0].range).toBe('м_01!A1:H13');
  });

  it('deletes the existing tab before re-adding when name already exists', async () => {
    const { client, state } = makeSheetsStub({
      meta: { sheets: [
        { properties: { sheetId: 0, title: 'Sheet1' } },
        { properties: { sheetId: 42, title: 'м_01' } },
      ]},
    });
    const { store } = makeStore({ sheets: client, sheetsState: state });
    await store.writeSheet(CELLS, 'м_01');
    expect(state.batches[0].requests).toEqual([
      { deleteSheet: { sheetId: 42 } },
      { addSheet: { properties: { title: 'м_01' } } },
    ]);
  });

  it('throws WorkbookNotFoundError when the workbook cannot be located by name', async () => {
    const { store } = makeStore({
      drive: makeDriveStub({ workbookId: null as unknown as string | undefined }),
    });
    await expect(store.writeSheet(CELLS, 'м_01')).rejects.toBeInstanceOf(
      WorkbookNotFoundError,
    );
  });
});

// ── readPreviousMonthClosing ────────────────────────────────────────────────

describe('SheetsStore.readPreviousMonthClosing', () => {
  const vehicle = makeVehicle();

  it('returns null when month <= 1 (prior month is in a different annual workbook)', async () => {
    const { store } = makeStore();
    expect(await store.readPreviousMonthClosing(2026, 1, vehicle)).toBeNull();
  });

  it('returns null when the prior sheet does not exist', async () => {
    const { store } = makeStore(); // default meta has only "Sheet1"
    expect(await store.readPreviousMonthClosing(2026, 3, vehicle)).toBeNull();
  });

  it('returns null when the plate at E9 does not match the supplied vehicle', async () => {
    const { client, state } = makeSheetsStub({
      meta: { sheets: [{ properties: { sheetId: 1, title: 'м_02' } }] },
    });
    state.values.set('м_02!E9', [['SOMEONE-ELSE']]);
    const { store } = makeStore({ sheets: client, sheetsState: state });
    expect(await store.readPreviousMonthClosing(2026, 3, vehicle)).toBeNull();
  });

  it('returns the closing balance from column H when plate matches', async () => {
    const { client, state } = makeSheetsStub({
      meta: { sheets: [{ properties: { sheetId: 1, title: 'м_02' } }] },
    });
    state.values.set('м_02!E9', [[vehicle.RegistrationNumber]]);
    state.values.set('м_02!C:H', [
      ['Начално количество', '', '', '', '', '5'],
      ['Борово - X - Борово', '50', '11.5', '5.75', '', '4.25'],
      ['Крайно количество', '', '', '', '', '4.25'],
    ]);
    const { store } = makeStore({ sheets: client, sheetsState: state });
    expect(await store.readPreviousMonthClosing(2026, 3, vehicle)).toBe(4.25);
  });
});

// ── groupByRow helper ───────────────────────────────────────────────────────

describe('groupByRow', () => {
  it('produces a dense matrix sized to the largest row number', () => {
    const out = groupByRow([
      { a1: 'A1', value: 'a' },
      { a1: 'H3', value: 5 },
    ]);
    expect(out.maxRow).toBe(3);
    expect(out.matrix).toHaveLength(3);
    expect(out.matrix[0]).toHaveLength(8);
    expect(out.matrix[0][0]).toBe('a');
    expect(out.matrix[2][7]).toBe(5);
  });

  it('fills empty cells with null', () => {
    const out = groupByRow([{ a1: 'C2', value: 'x' }]);
    expect(out.matrix[0]).toEqual([null, null, null, null, null, null, null, null]);
    expect(out.matrix[1][2]).toBe('x');
  });

  it('throws on unsupported A1 columns', () => {
    expect(() => groupByRow([{ a1: 'Z1', value: 'x' }])).toThrowError();
  });
});

// ── workbook id resolution caching ──────────────────────────────────────────

describe('SheetsStore — workbook resolution caching', () => {
  it('looks up the workbook only once across multiple calls', async () => {
    const drive = makeDriveStub();
    const { store } = makeStore({ drive });
    await store.writeSheet([{ a1: 'A1', value: 'x' }], 'м_01');
    await store.writeSheet([{ a1: 'A1', value: 'y' }], 'м_02');
    // 2 findByName calls per resolution (folder + workbook) — should only happen once.
    expect((drive.findByName as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(2);
  });
});

// Silence unused-import warning for vi.
void beforeEach;
