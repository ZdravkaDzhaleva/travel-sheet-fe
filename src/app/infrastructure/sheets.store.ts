import { Injectable, inject } from '@angular/core';

import {
  SheetsClient,
  type SheetCellValue,
  type SheetsBatchRequest,
} from '../core/google/sheets.client';
import { DriveClient } from '../core/google/drive.client';
import { SUPPORTING_MAP } from '../core/config/supporting.map';
import {
  DRIVE_FOLDER_NAME,
  SUPPORTING_SHEET_ID,
  WORKBOOK_NAME,
} from '../core/config/workspace.config';
import {
  CELL_VEHICLE_PLATE,
  ROW_CLOSING_LABEL,
  monthSheetName,
} from '../core/config/workbook.template';
import type {
  Company,
  Invoice,
  Location,
  LocationType,
  RouteLeg,
  Vehicle,
} from '../domain/entities/index';
import type { CellModel } from '../domain/mapping/cell-model';
import {
  InvoiceNotFoundError,
  InvoiceTabNotFoundError,
  MasterDataParseError,
  WorkbookNotFoundError,
} from './sheets-store.errors';

const MIME_SPREADSHEET = 'application/vnd.google-apps.spreadsheet';
const MIME_FOLDER = 'application/vnd.google-apps.folder';
const LOCATION_TYPES: ReadonlySet<LocationType> = new Set([
  'Office',
  'Constructor',
  'Architect',
  'Project',
]);

@Injectable({ providedIn: 'root' })
export class SheetsStore {
  private readonly sheets = inject(SheetsClient);
  private readonly drive = inject(DriveClient);
  private workbookIdPromise: Promise<string> | null = null;
  private invoiceTabSheetIdPromise: Promise<number> | null = null;

  async loadCompanies(): Promise<Company[]> {
    const rows = await this.getValues(`${SUPPORTING_MAP.company.tab}!A2:E`);
    const cols = SUPPORTING_MAP.company.cols;
    return rows.map((row, i) => ({
      Id: numAt(row, cols.id, 'Company', i),
      Name: strAt(row, cols.name),
      Eik: strAt(row, cols.eik),
      Address: strAt(row, cols.address),
      ReportingYear: numAt(row, cols.reportingYear, 'Company', i),
    }));
  }

  async loadVehicles(): Promise<Vehicle[]> {
    const rows = await this.getValues(`${SUPPORTING_MAP.vehicle.tab}!A2:J`);
    const cols = SUPPORTING_MAP.vehicle.cols;
    return rows.map((row, i) => ({
      Id: numAt(row, cols.id, 'Vehicle', i),
      CompanyId: numAt(row, cols.companyId, 'Vehicle', i),
      Name: strAt(row, cols.name),
      RegistrationNumber: strAt(row, cols.registrationNumber),
      FuelType: strAt(row, cols.fuelType),
      SeatCount: strAt(row, cols.seatCount),
      AverageConsumptionLitersPer100Km: numAt(
        row,
        cols.averageConsumptionLitersPer100Km,
        'Vehicle',
        i,
      ),
      TankCapacityLiters: numAt(row, cols.tankCapacityLiters, 'Vehicle', i),
      IsActive: boolAt(row, cols.isActive),
      OpeningFuelBalance: numAt(row, cols.openingFuelBalance, 'Vehicle', i),
    }));
  }

  async loadLocations(): Promise<Location[]> {
    const rows = await this.getValues(`${SUPPORTING_MAP.location.tab}!A2:F`);
    const cols = SUPPORTING_MAP.location.cols;
    return rows.map((row, i) => {
      const type = strAt(row, cols.type);
      if (!LOCATION_TYPES.has(type as LocationType)) {
        throw new MasterDataParseError('Location', i, `unknown type "${type}"`);
      }
      return {
        Id: numAt(row, cols.id, 'Location', i),
        CompanyId: numAt(row, cols.companyId, 'Location', i),
        Name: strAt(row, cols.name),
        Type: type as LocationType,
        NameBg: strAt(row, cols.nameBg),
        Address: strAt(row, cols.address),
      };
    });
  }

  async loadRoutes(): Promise<RouteLeg[]> {
    const rows = await this.getValues(`${SUPPORTING_MAP.route.tab}!A2:E`);
    const cols = SUPPORTING_MAP.route.cols;
    return rows.map((row, i) => ({
      Id: numAt(row, cols.id, 'Route', i),
      RouteName: strAt(row, cols.routeName),
      StartPointId: numAt(row, cols.startPointId, 'Route', i),
      EndPointId: numAt(row, cols.endPointId, 'Route', i),
      DistanceKm: numAt(row, cols.distanceKm, 'Route', i),
    }));
  }

  async loadInvoices(): Promise<Invoice[]> {
    const rows = await this.getValues(`${SUPPORTING_MAP.invoice.tab}!A2:K`);
    const cols = SUPPORTING_MAP.invoice.cols;
    return rows.map((row, i) => ({
      Id: numAt(row, cols.id, 'Invoice', i),
      CompanyId: numAt(row, cols.companyId, 'Invoice', i),
      ReportingYear: numAt(row, cols.reportingYear, 'Invoice', i),
      VehicleId: numAt(row, cols.vehicleId, 'Invoice', i),
      FuelVendor: strAt(row, cols.fuelVendor),
      InvoiceDate: parseDateOrFail(strAt(row, cols.invoiceDate), 'Invoice', i),
      QuantityLiters: numAt(row, cols.quantityLiters, 'Invoice', i),
      UnitPrice: numAt(row, cols.unitPrice, 'Invoice', i),
      TotalAmount: numAt(row, cols.totalAmount, 'Invoice', i),
      Currency: strAt(row, cols.currency),
      DriveFileId: strAt(row, cols.driveFileId),
    }));
  }

  async appendInvoice(invoice: Invoice): Promise<void> {
    await this.sheets.valuesAppend(
      SUPPORTING_SHEET_ID,
      `${SUPPORTING_MAP.invoice.tab}!A:K`,
      [invoiceToRow(invoice)],
    );
  }

  /** Overwrites the existing Invoice row whose Id matches; throws if absent. */
  async updateInvoice(invoice: Invoice): Promise<void> {
    const sheetRow = await this.findInvoiceSheetRow(invoice.Id);
    await this.sheets.valuesUpdate(
      SUPPORTING_SHEET_ID,
      `${SUPPORTING_MAP.invoice.tab}!A${sheetRow}:K${sheetRow}`,
      [invoiceToRow(invoice)],
    );
  }

  /** Removes the Invoice row with the given Id; throws if absent. */
  async deleteInvoice(invoiceId: number): Promise<void> {
    const sheetRow = await this.findInvoiceSheetRow(invoiceId);
    const sheetId = await this.resolveInvoiceTabSheetId();
    await this.sheets.batchUpdate(SUPPORTING_SHEET_ID, [
      {
        deleteDimension: {
          range: {
            sheetId,
            dimension: 'ROWS',
            startIndex: sheetRow - 1, // 0-based, header occupies index 0
            endIndex: sheetRow,
          },
        },
      },
    ]);
  }

  /** Adds or clears+re-adds `sheetName`, then writes `cells` into it. */
  async writeSheet(
    cells: readonly CellModel[],
    sheetName: string,
  ): Promise<void> {
    const workbookId = await this.resolveWorkbookId();
    const meta = await this.sheets.getSpreadsheet(workbookId);
    const existing = meta.sheets.find(s => s.properties.title === sheetName);

    const requests: SheetsBatchRequest[] = [];
    if (existing) {
      requests.push({ deleteSheet: { sheetId: existing.properties.sheetId } });
    }
    requests.push({ addSheet: { properties: { title: sheetName } } });
    await this.sheets.batchUpdate(workbookId, requests);

    const grouped = groupByRow(cells);
    const range = `${sheetName}!A1:H${grouped.maxRow}`;
    await this.sheets.valuesUpdate(workbookId, range, grouped.matrix);
  }

  /**
   * Returns the prior `м_MM` sheet's closing balance if it exists and matches
   * the supplied vehicle plate (cell E9); else null.
   */
  async readPreviousMonthClosing(
    year: number,
    month: number,
    vehicle: Vehicle,
  ): Promise<number | null> {
    if (month <= 1) return null; // prior month lives in a different annual workbook
    const prevSheet = monthSheetName(month - 1);
    const workbookId = await this.resolveWorkbookId();
    const meta = await this.sheets.getSpreadsheet(workbookId);
    if (!meta.sheets.some(s => s.properties.title === prevSheet)) return null;

    // Plate check (E9 of prior sheet must equal current vehicle plate).
    const plateRange = `${prevSheet}!${CELL_VEHICLE_PLATE}`;
    const plateRes = await this.sheets.valuesGet(workbookId, plateRange);
    const plate = plateRes.values?.[0]?.[0];
    if (String(plate ?? '').trim() !== vehicle.RegistrationNumber) return null;

    // Scan column C for the closing label; take same-row H.
    const res = await this.sheets.valuesGet(workbookId, `${prevSheet}!C:H`);
    const rows = res.values ?? [];
    for (const row of rows) {
      if (String(row[0] ?? '').trim() === ROW_CLOSING_LABEL) {
        const closing = row[5]; // H is index 5 within C:H
        const n = parseMaybeNumber(closing);
        return Number.isFinite(n) ? n : null;
      }
    }
    return null;
  }

  private async getValues(range: string): Promise<readonly (readonly SheetCellValue[])[]> {
    const res = await this.sheets.valuesGet(SUPPORTING_SHEET_ID, range);
    return res.values ?? [];
  }

  private resolveWorkbookId(): Promise<string> {
    if (!this.workbookIdPromise) {
      this.workbookIdPromise = this.lookupWorkbookId();
    }
    return this.workbookIdPromise;
  }

  private async findInvoiceSheetRow(invoiceId: number): Promise<number> {
    const invoices = await this.loadInvoices();
    const idx = invoices.findIndex(inv => inv.Id === invoiceId);
    if (idx === -1) throw new InvoiceNotFoundError(invoiceId);
    return idx + 2; // 1-based row; header occupies row 1
  }

  private resolveInvoiceTabSheetId(): Promise<number> {
    if (!this.invoiceTabSheetIdPromise) {
      this.invoiceTabSheetIdPromise = this.lookupInvoiceTabSheetId();
    }
    return this.invoiceTabSheetIdPromise;
  }

  private async lookupInvoiceTabSheetId(): Promise<number> {
    const meta = await this.sheets.getSpreadsheet(SUPPORTING_SHEET_ID);
    const sheet = meta.sheets.find(
      s => s.properties.title === SUPPORTING_MAP.invoice.tab,
    );
    if (!sheet) throw new InvoiceTabNotFoundError(SUPPORTING_MAP.invoice.tab);
    return sheet.properties.sheetId;
  }

  private async lookupWorkbookId(): Promise<string> {
    const folder = await this.drive.findByName(DRIVE_FOLDER_NAME, {
      mimeType: MIME_FOLDER,
    });
    const workbook = await this.drive.findByName(WORKBOOK_NAME, {
      mimeType: MIME_SPREADSHEET,
      parentId: folder?.id,
    });
    if (!workbook) {
      throw new WorkbookNotFoundError(
        WORKBOOK_NAME,
        folder ? DRIVE_FOLDER_NAME : null,
      );
    }
    return workbook.id;
  }
}

function strAt(row: readonly SheetCellValue[], i: number): string {
  return String(row[i] ?? '').trim();
}

function numAt(
  row: readonly SheetCellValue[],
  i: number,
  entity: string,
  rowIndex: number,
): number {
  const n = parseMaybeNumber(row[i]);
  if (!Number.isFinite(n)) {
    throw new MasterDataParseError(
      entity,
      rowIndex,
      `expected a number at column ${i}, got ${JSON.stringify(row[i])}`,
    );
  }
  return n;
}

function boolAt(row: readonly SheetCellValue[], i: number): boolean {
  const v = row[i];
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const s = v.trim().toUpperCase();
    return s === 'TRUE' || s === 'ИСТИНА' || s === '1' || s === 'YES';
  }
  return Boolean(v);
}

function parseMaybeNumber(v: SheetCellValue | undefined): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const trimmed = v.replace(/\s/g, '').replace(',', '.');
    return Number(trimmed);
  }
  return NaN;
}

function parseDateOrFail(
  s: string,
  entity: string,
  rowIndex: number,
): Date {
  // Accepts ISO (YYYY-MM-DD) and DD.MM.YYYY.
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  if (m) {
    const [, dd, mm, yyyy] = m;
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  }
  throw new MasterDataParseError(
    entity,
    rowIndex,
    `unrecognised date "${s}" (expected YYYY-MM-DD or DD.MM.YYYY)`,
  );
}

function invoiceToRow(invoice: Invoice): SheetCellValue[] {
  return [
    invoice.Id,
    invoice.CompanyId,
    invoice.ReportingYear,
    invoice.VehicleId,
    invoice.FuelVendor,
    isoDateOnly(invoice.InvoiceDate),
    invoice.QuantityLiters,
    invoice.UnitPrice,
    invoice.TotalAmount,
    invoice.Currency,
    invoice.DriveFileId,
  ];
}

function isoDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const COL_INDEX = new Map(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((c, i) => [c, i]));

interface GroupedCells {
  readonly matrix: readonly (readonly SheetCellValue[])[];
  readonly maxRow: number;
}

/** Builds a dense A1-rectangle from a sparse CellModel[]. */
export function groupByRow(cells: readonly CellModel[]): GroupedCells {
  let maxRow = 0;
  const parsed = cells.map(c => {
    const m = /^([A-H])(\d+)$/.exec(c.a1);
    if (!m) throw new Error(`Unsupported A1 address: ${c.a1}`);
    const col = COL_INDEX.get(m[1])!;
    const row = Number(m[2]);
    if (row > maxRow) maxRow = row;
    return { col, row, value: c.value };
  });
  const matrix: SheetCellValue[][] = Array.from({ length: maxRow }, () =>
    Array<SheetCellValue>(8).fill(null),
  );
  for (const p of parsed) matrix[p.row - 1][p.col] = p.value;
  return { matrix, maxRow };
}
