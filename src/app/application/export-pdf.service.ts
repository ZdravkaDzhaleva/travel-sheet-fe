import { Injectable, inject, signal } from '@angular/core';

import { SheetsStore, type MonthSheetEntry } from '../infrastructure/sheets.store';
import { DriveStore } from '../infrastructure/drive.store';
import { MONTH_SHEET_PREFIX } from '../core/config/workbook.template';
import {
  SheetNotFoundError,
  ExportFailedError,
  DriveWriteFailedError,
} from './export-pdf.errors';

export type { MonthSheetEntry };
export type ExportPdfError = SheetNotFoundError | ExportFailedError | DriveWriteFailedError;

export interface ExportPdfResult {
  readonly filename: string;
  readonly driveUrl: string;
}

@Injectable({ providedIn: 'root' })
export class ExportPdfService {
  private readonly sheetsStore = inject(SheetsStore);
  private readonly driveStore = inject(DriveStore);

  private readonly _loading = signal(false);
  private readonly _months = signal<MonthSheetEntry[]>([]);
  private readonly _result = signal<ExportPdfResult | null>(null);
  private readonly _error = signal<ExportPdfError | null>(null);

  readonly loading = this._loading.asReadonly();
  readonly months = this._months.asReadonly();
  readonly result = this._result.asReadonly();
  readonly error = this._error.asReadonly();

  /** Refreshes the dropdown list from the workbook's current tab metadata. */
  async loadMonths(year: number): Promise<void> {
    const entries = await this.sheetsStore.listMonthSheets(year);
    this._months.set(entries);
  }

  /**
   * Exports `entry` as a PDF and saves it to Drive.
   * Sequence: sheetExists check → exportSheetAsPdf → savePdfToFolder.
   * Nothing is written to Drive if any step before the save fails.
   */
  async exportMonth(entry: MonthSheetEntry, year: number): Promise<void> {
    if (this._loading()) return;
    this._loading.set(true);
    this._result.set(null);
    this._error.set(null);
    try {
      const exists = await this.sheetsStore.sheetExists(entry.sheetName);
      if (!exists) throw new SheetNotFoundError(entry.sheetName);

      let blob: Blob;
      try {
        blob = await this.sheetsStore.exportSheetAsPdf(entry.sheetId);
      } catch (exportErr) {
        throw new ExportFailedError(entry.sheetName, asError(exportErr));
      }

      const filename = buildPdfFilename(entry.sheetName, year);
      try {
        const driveUrl = await this.driveStore.savePdfToFolder(blob, filename);
        this._result.set({ filename, driveUrl });
      } catch (driveErr) {
        throw new DriveWriteFailedError(filename, asError(driveErr));
      }
    } catch (err) {
      this._error.set(err as ExportPdfError);
    } finally {
      this._loading.set(false);
    }
  }
}

function buildPdfFilename(sheetName: string, year: number): string {
  const mm = sheetName.slice(MONTH_SHEET_PREFIX.length);
  return `Patenlist_${year}_${mm}.pdf`;
}

function asError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}
