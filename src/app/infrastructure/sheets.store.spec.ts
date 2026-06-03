import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';

import {
  SheetsStore,
  groupByRow,
  buildTextFormatRequests,
  buildBorderRequests,
  buildRouteColumnLayoutRequests,
} from './sheets.store';
import { ROUTE_COLUMN_WIDTH_PX } from '../core/config/workbook.template';
import {
  InvoiceNotFoundError,
  InvoiceTabNotFoundError,
  SupportingSheetNotFoundError,
  WorkbookNotFoundError,
  MasterDataParseError,
} from './sheets-store.errors';
import { SheetsClient } from '../core/google/sheets.client';
import { DriveClient } from '../core/google/drive.client';
import {
  DRIVE_FOLDER_NAME,
  SUPPORTING_SHEET_NAME,
  WORKBOOK_NAME,
} from '../core/config/workspace.config';
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

function makeDriveStub(
  opts: {
    workbookId?: string | null;
    folderId?: string | null;
    supportingId?: string | null;
  } = {},
): DriveClient {
  return {
    findByName: vi.fn(async (name: string) => {
      if (name === DRIVE_FOLDER_NAME) {
        return opts.folderId === null
          ? null
          : { id: opts.folderId ?? 'folder-1', name, mimeType: 'application/vnd.google-apps.folder' };
      }
      if (name === WORKBOOK_NAME) {
        return opts.workbookId === null
          ? null
          : { id: opts.workbookId ?? 'wb-1', name, mimeType: 'application/vnd.google-apps.spreadsheet' };
      }
      if (name === SUPPORTING_SHEET_NAME) {
        return opts.supportingId === null
          ? null
          : { id: opts.supportingId ?? 'supporting-1', name, mimeType: 'application/vnd.google-apps.spreadsheet' };
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
      ['1', '1', '2026', '1', 'Лукойл', '2026-01-10', '40', '2.89', '115.60', 'EUR', 'drive-1'],
      ['2', '1', '2026', '1', 'Лукойл', '25.01.2026', '45', '2.89', '130.05', 'EUR', 'drive-2'],
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
      Currency: 'EUR',
      DriveFileId: 'drive-99',
    });
    expect(state.appended).toHaveLength(1);
    expect(state.appended[0].range).toBe('Invoice!A:K');
    expect(state.appended[0].values[0]).toEqual([
      99, 1, 2026, 1, 'Лукойл', '2026-01-15', 40, 2.89, 115.60, 'EUR', 'drive-99',
    ]);
  });
});

// ── updateInvoice / deleteInvoice ───────────────────────────────────────────

const INVOICE_ROWS: (string | number | boolean | null)[][] = [
  ['1', '1', '2026', '1', 'Лукойл', '2026-01-10', '40', '2.89', '115.60', 'EUR', 'drive-1'],
  ['2', '1', '2026', '1', 'Лукойл', '2026-01-25', '45', '2.89', '130.05', 'EUR', 'drive-2'],
];

describe('SheetsStore.updateInvoice', () => {
  it('writes the row to Invoice!A{n}:K{n} based on the position of the matching Id', async () => {
    const { client, state } = makeSheetsStub();
    state.values.set('Invoice!A2:K', INVOICE_ROWS);
    const { store } = makeStore({ sheets: client, sheetsState: state });
    await store.updateInvoice({
      Id: 2,
      CompanyId: 1,
      ReportingYear: 2026,
      VehicleId: 1,
      FuelVendor: 'OMV',
      InvoiceDate: new Date(2026, 0, 26),
      QuantityLiters: 50,
      UnitPrice: 3.0,
      TotalAmount: 150,
      Currency: 'EUR',
      DriveFileId: 'drive-2',
    });
    expect(state.written).toHaveLength(1);
    expect(state.written[0].range).toBe('Invoice!A3:K3');
    expect(state.written[0].values[0]).toEqual([
      2, 1, 2026, 1, 'OMV', '2026-01-26', 50, 3.0, 150, 'EUR', 'drive-2',
    ]);
  });

  it('throws InvoiceNotFoundError when the Id is absent', async () => {
    const { client, state } = makeSheetsStub();
    state.values.set('Invoice!A2:K', INVOICE_ROWS);
    const { store } = makeStore({ sheets: client, sheetsState: state });
    await expect(
      store.updateInvoice({
        Id: 99,
        CompanyId: 1,
        ReportingYear: 2026,
        VehicleId: 1,
        FuelVendor: 'X',
        InvoiceDate: new Date(2026, 0, 1),
        QuantityLiters: 1,
        UnitPrice: 1,
        TotalAmount: 1,
        Currency: 'EUR',
        DriveFileId: 'd',
      }),
    ).rejects.toBeInstanceOf(InvoiceNotFoundError);
  });
});

describe('SheetsStore.deleteInvoice', () => {
  it('emits a deleteDimension request scoped to the matching row of the Invoice tab', async () => {
    const { client, state } = makeSheetsStub({
      meta: { sheets: [{ properties: { sheetId: 77, title: 'Invoice' } }] },
    });
    state.values.set('Invoice!A2:K', INVOICE_ROWS);
    const { store } = makeStore({ sheets: client, sheetsState: state });
    await store.deleteInvoice(1);
    expect(state.batches).toHaveLength(1);
    expect(state.batches[0].requests).toEqual([
      {
        deleteDimension: {
          range: {
            sheetId: 77,
            dimension: 'ROWS',
            startIndex: 1,
            endIndex: 2,
          },
        },
      },
    ]);
  });

  it('throws InvoiceNotFoundError when the Id is absent', async () => {
    const { client, state } = makeSheetsStub();
    state.values.set('Invoice!A2:K', INVOICE_ROWS);
    const { store } = makeStore({ sheets: client, sheetsState: state });
    await expect(store.deleteInvoice(404)).rejects.toBeInstanceOf(InvoiceNotFoundError);
  });

  it('throws InvoiceTabNotFoundError when the Invoice tab is missing in metadata', async () => {
    const { client, state } = makeSheetsStub({
      meta: { sheets: [{ properties: { sheetId: 0, title: 'Sheet1' } }] },
    });
    state.values.set('Invoice!A2:K', INVOICE_ROWS);
    const { store } = makeStore({ sheets: client, sheetsState: state });
    await expect(store.deleteInvoice(1)).rejects.toBeInstanceOf(InvoiceTabNotFoundError);
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
    const { store } = makeStore({ drive: makeDriveStub({ workbookId: null }) });
    await expect(store.writeSheet(CELLS, 'м_01')).rejects.toBeInstanceOf(
      WorkbookNotFoundError,
    );
  });
});

// ── supporting-sheet resolution ─────────────────────────────────────────────

describe('SheetsStore.resolveSupportingSheetId', () => {
  it('resolves the supporting spreadsheet id by name inside the configured folder', async () => {
    const drive = makeDriveStub({ folderId: 'folder-X', supportingId: 'sup-X' });
    const { store } = makeStore({ drive });
    await expect(store.resolveSupportingSheetId()).resolves.toBe('sup-X');
    // Drive was queried by name with the configured folder as parent and spreadsheet MIME.
    const calls = (drive.findByName as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const supportingCall = calls.find(c => c[0] === SUPPORTING_SHEET_NAME);
    expect(supportingCall).toBeDefined();
    expect(supportingCall?.[1]).toMatchObject({
      mimeType: 'application/vnd.google-apps.spreadsheet',
      parentId: 'folder-X',
    });
  });

  it('memoizes resolution — repeated calls do not re-query Drive', async () => {
    const drive = makeDriveStub();
    const { store } = makeStore({ drive });
    await store.resolveSupportingSheetId();
    await store.resolveSupportingSheetId();
    const calls = (drive.findByName as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const supportingCalls = calls.filter(c => c[0] === SUPPORTING_SHEET_NAME);
    expect(supportingCalls.length).toBe(1);
  });

  it('throws SupportingSheetNotFoundError when the spreadsheet cannot be located', async () => {
    const { store } = makeStore({ drive: makeDriveStub({ supportingId: null }) });
    await expect(store.resolveSupportingSheetId()).rejects.toBeInstanceOf(
      SupportingSheetNotFoundError,
    );
  });

  it('shares the folder lookup with the workbook resolver — folder is queried only once', async () => {
    const drive = makeDriveStub();
    const { store } = makeStore({ drive });
    await store.resolveSupportingSheetId();
    await store.writeSheet([{ a1: 'A1', value: 'x' }], 'м_01');
    const calls = (drive.findByName as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const folderCalls = calls.filter(c => c[0] === DRIVE_FOLDER_NAME);
    expect(folderCalls.length).toBe(1);
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

// ── buildTextFormatRequests ─────────────────────────────────────────────────

describe('buildTextFormatRequests', () => {
  const SHEET_ID = 99;

  function repeatCellOf(req: unknown): {
    range: { sheetId: number; startRowIndex: number; endRowIndex: number;
             startColumnIndex: number; endColumnIndex: number };
    cell: { userEnteredFormat: Record<string, unknown> };
    fields: string;
  } {
    return (req as { repeatCell: ReturnType<typeof repeatCellOf> }).repeatCell;
  }

  it('skips cells with no bold / italic / align (returns empty array)', () => {
    const out = buildTextFormatRequests(
      [
        { a1: 'A1', value: 'plain' },
        { a1: 'B2', value: 42, format: '#,##0.00' },
      ],
      SHEET_ID,
    );
    expect(out).toEqual([]);
  });

  it('emits bold-only request without horizontalAlignment field', () => {
    const out = buildTextFormatRequests([{ a1: 'C3', value: 'x', bold: true }], SHEET_ID);
    expect(out).toHaveLength(1);
    const r = repeatCellOf(out[0]);
    expect(r.range).toEqual({
      sheetId: SHEET_ID,
      startRowIndex: 2,
      endRowIndex: 3,
      startColumnIndex: 2,
      endColumnIndex: 3,
    });
    expect(r.cell.userEnteredFormat).toEqual({
      textFormat: { bold: true, italic: false },
    });
    expect(r.fields).toBe(
      'userEnteredFormat.textFormat.bold,userEnteredFormat.textFormat.italic',
    );
  });

  it('emits italic-only request (bold defaults to false)', () => {
    const out = buildTextFormatRequests([{ a1: 'D5', value: 'x', italic: true }], SHEET_ID);
    const r = repeatCellOf(out[0]);
    expect(r.cell.userEnteredFormat).toEqual({
      textFormat: { bold: false, italic: true },
    });
    expect(r.fields).toBe(
      'userEnteredFormat.textFormat.bold,userEnteredFormat.textFormat.italic',
    );
  });

  it('emits align-only request with horizontalAlignment + matching fields mask, NO textFormat', () => {
    const out = buildTextFormatRequests([{ a1: 'A12', value: '№', align: 'center' }], SHEET_ID);
    expect(out).toHaveLength(1);
    const r = repeatCellOf(out[0]);
    expect(r.cell.userEnteredFormat).toEqual({ horizontalAlignment: 'CENTER' });
    expect(r.fields).toBe('userEnteredFormat.horizontalAlignment');
  });

  it('combines bold + align: textFormat AND horizontalAlignment, both fields in the mask', () => {
    const out = buildTextFormatRequests(
      [{ a1: 'H12', value: 'Наличност литри', bold: true, align: 'center' }],
      SHEET_ID,
    );
    const r = repeatCellOf(out[0]);
    expect(r.cell.userEnteredFormat).toEqual({
      textFormat: { bold: true, italic: false },
      horizontalAlignment: 'CENTER',
    });
    expect(r.fields).toBe(
      'userEnteredFormat.textFormat.bold,userEnteredFormat.textFormat.italic,userEnteredFormat.horizontalAlignment',
    );
  });

  it('uppercases the align value (left → LEFT, right → RIGHT)', () => {
    const out = buildTextFormatRequests(
      [
        { a1: 'A1', value: 'l', align: 'left' },
        { a1: 'B1', value: 'r', align: 'right' },
      ],
      SHEET_ID,
    );
    expect(repeatCellOf(out[0]).cell.userEnteredFormat).toEqual({ horizontalAlignment: 'LEFT' });
    expect(repeatCellOf(out[1]).cell.userEnteredFormat).toEqual({ horizontalAlignment: 'RIGHT' });
  });

  it('emits one repeatCell request per formatted cell', () => {
    const out = buildTextFormatRequests(
      [
        { a1: 'A1', value: 'a', bold: true },
        { a1: 'B2', value: 'b', italic: true },
        { a1: 'C3', value: 'c', align: 'center' },
        { a1: 'D4', value: 'd' }, // not formatted — skipped
      ],
      SHEET_ID,
    );
    expect(out).toHaveLength(3);
  });

  it('emits bgColor-only request with backgroundColor + matching fields mask, NO textFormat', () => {
    const out = buildTextFormatRequests(
      [{ a1: 'A12', value: '№', bgColor: { red: 0.5, green: 0.6, blue: 0.7 } }],
      SHEET_ID,
    );
    expect(out).toHaveLength(1);
    const r = repeatCellOf(out[0]);
    expect(r.cell.userEnteredFormat).toEqual({
      backgroundColor: { red: 0.5, green: 0.6, blue: 0.7 },
    });
    expect(r.fields).toBe('userEnteredFormat.backgroundColor');
  });

  it('combines bold + bgColor: textFormat AND backgroundColor in cell + fields mask', () => {
    const out = buildTextFormatRequests(
      [{ a1: 'A12', value: '№', bold: true, bgColor: { red: 0.1, green: 0.2, blue: 0.3 } }],
      SHEET_ID,
    );
    const r = repeatCellOf(out[0]);
    expect(r.cell.userEnteredFormat).toEqual({
      textFormat: { bold: true, italic: false },
      backgroundColor: { red: 0.1, green: 0.2, blue: 0.3 },
    });
    expect(r.fields).toBe(
      'userEnteredFormat.textFormat.bold,userEnteredFormat.textFormat.italic,userEnteredFormat.backgroundColor',
    );
  });

  it('combines all four: bold + align + bgColor produces single request with all field-mask entries', () => {
    const out = buildTextFormatRequests(
      [{
        a1: 'A12', value: '№',
        bold: true, align: 'center',
        bgColor: { red: 0.8, green: 0.9, blue: 1 },
      }],
      SHEET_ID,
    );
    const r = repeatCellOf(out[0]);
    expect(r.cell.userEnteredFormat).toEqual({
      textFormat: { bold: true, italic: false },
      horizontalAlignment: 'CENTER',
      backgroundColor: { red: 0.8, green: 0.9, blue: 1 },
    });
    expect(r.fields).toBe(
      'userEnteredFormat.textFormat.bold,userEnteredFormat.textFormat.italic,userEnteredFormat.horizontalAlignment,userEnteredFormat.backgroundColor',
    );
  });
});

// ── buildBorderRequests ─────────────────────────────────────────────────────

describe('buildBorderRequests', () => {
  const SHEET_ID = 77;
  const SOLID = { style: 'SOLID' };

  function updateBordersOf(req: unknown): {
    range: { sheetId: number; startRowIndex: number; endRowIndex: number;
             startColumnIndex: number; endColumnIndex: number };
    top: unknown; bottom: unknown; left: unknown; right: unknown;
    innerHorizontal: unknown; innerVertical: unknown;
  } {
    return (req as { updateBorders: ReturnType<typeof updateBordersOf> }).updateBorders;
  }

  it('returns empty array for empty input', () => {
    expect(buildBorderRequests([], SHEET_ID)).toEqual([]);
  });

  it('emits one updateBorders request per region with all six sides set to SOLID', () => {
    const out = buildBorderRequests([{ start: 'A9', end: 'E9' }], SHEET_ID);
    expect(out).toHaveLength(1);
    const r = updateBordersOf(out[0]);
    expect(r.top).toEqual(SOLID);
    expect(r.bottom).toEqual(SOLID);
    expect(r.left).toEqual(SOLID);
    expect(r.right).toEqual(SOLID);
    expect(r.innerHorizontal).toEqual(SOLID);
    expect(r.innerVertical).toEqual(SOLID);
  });

  it('converts inclusive A1 corners to 0-based exclusive indices', () => {
    const out = buildBorderRequests([{ start: 'A1', end: 'B2' }], SHEET_ID);
    expect(updateBordersOf(out[0]).range).toEqual({
      sheetId: SHEET_ID,
      startRowIndex: 0,
      endRowIndex: 2,
      startColumnIndex: 0,
      endColumnIndex: 2,
    });
  });

  it('parses multi-row data-table range A12:H20 correctly', () => {
    const out = buildBorderRequests([{ start: 'A12', end: 'H20' }], SHEET_ID);
    expect(updateBordersOf(out[0]).range).toEqual({
      sheetId: SHEET_ID,
      startRowIndex: 11,
      endRowIndex: 20,
      startColumnIndex: 0,
      endColumnIndex: 8,
    });
  });

  it('emits one request per input region (order preserved)', () => {
    const out = buildBorderRequests(
      [
        { start: 'A9',  end: 'E9'  },
        { start: 'A10', end: 'E10' },
        { start: 'A12', end: 'H18' },
      ],
      SHEET_ID,
    );
    expect(out).toHaveLength(3);
    expect(updateBordersOf(out[0]).range.startRowIndex).toBe(8);
    expect(updateBordersOf(out[1]).range.startRowIndex).toBe(9);
    expect(updateBordersOf(out[2]).range.startRowIndex).toBe(11);
  });
});

// ── buildRouteColumnLayoutRequests ──────────────────────────────────────────

describe('buildRouteColumnLayoutRequests', () => {
  const SHEET_ID = 55;

  it('returns exactly two requests: one updateDimensionProperties, one repeatCell', () => {
    const out = buildRouteColumnLayoutRequests(SHEET_ID);
    expect(out).toHaveLength(2);
    expect(out[0]).toHaveProperty('updateDimensionProperties');
    expect(out[1]).toHaveProperty('repeatCell');
  });

  it('updateDimensionProperties targets column C with ROUTE_COLUMN_WIDTH_PX', () => {
    const req = (buildRouteColumnLayoutRequests(SHEET_ID)[0] as {
      updateDimensionProperties: {
        range: { sheetId: number; dimension: string; startIndex: number; endIndex: number };
        properties: { pixelSize: number };
        fields: string;
      };
    }).updateDimensionProperties;
    expect(req.range).toEqual({
      sheetId: SHEET_ID,
      dimension: 'COLUMNS',
      startIndex: 2,   // column C, 0-based
      endIndex:   3,
    });
    expect(req.properties.pixelSize).toBe(ROUTE_COLUMN_WIDTH_PX);
    expect(req.properties.pixelSize).toBe(330);
    expect(req.fields).toBe('pixelSize');
  });

  it('repeatCell targets the whole column C with wrapStrategy WRAP', () => {
    const req = (buildRouteColumnLayoutRequests(SHEET_ID)[1] as {
      repeatCell: {
        range: { sheetId: number; startColumnIndex: number; endColumnIndex: number };
        cell: { userEnteredFormat: { wrapStrategy: string } };
        fields: string;
      };
    }).repeatCell;
    expect(req.range).toEqual({
      sheetId: SHEET_ID,
      startColumnIndex: 2,
      endColumnIndex:   3,
    });
    expect(req.cell.userEnteredFormat.wrapStrategy).toBe('WRAP');
    expect(req.fields).toBe('userEnteredFormat.wrapStrategy');
  });
});

// Silence unused-import warning for vi.
void beforeEach;
