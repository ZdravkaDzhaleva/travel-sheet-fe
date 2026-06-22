import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';

import { ExportPdfService } from './export-pdf.service';
import {
  SheetNotFoundError,
  ExportFailedError,
  DriveWriteFailedError,
} from './export-pdf.errors';
import { SheetsStore, type MonthSheetEntry } from '../infrastructure/sheets.store';
import { DriveStore } from '../infrastructure/drive.store';
import { GoogleApiError } from '../core/google/google-http';

const ENTRY: MonthSheetEntry = {
  sheetName: 'м_01',
  sheetId: 5,
  label: 'January 2026 (м_01)',
};
const YEAR = 2026;
const FILENAME = 'Pyten_list_2026_01.pdf';
const DRIVE_URL = 'https://drive.google.com/file/d/pdf-1/view';
const PDF_BLOB = new Blob(['%PDF'], { type: 'application/pdf' });

interface StubOpts {
  sheetExists?: boolean;
  exportBlob?: Blob | Error;
  driveUrl?: string | Error;
  monthEntries?: MonthSheetEntry[];
}

function makeStubs(opts: StubOpts = {}) {
  const sheetExists = vi.fn(async () => opts.sheetExists ?? true);
  const exportSheetAsPdf = vi.fn(async () => {
    const v = opts.exportBlob ?? PDF_BLOB;
    if (v instanceof Error) throw v;
    return v;
  });
  const listMonthSheets = vi.fn(async () => opts.monthEntries ?? [ENTRY]);
  const sheets = { sheetExists, exportSheetAsPdf, listMonthSheets } as unknown as SheetsStore;

  const savePdfToFolder = vi.fn(async () => {
    const v = opts.driveUrl ?? DRIVE_URL;
    if (v instanceof Error) throw v;
    return v;
  });
  const drive = { savePdfToFolder } as unknown as DriveStore;

  return { sheets, drive, sheetExists, exportSheetAsPdf, listMonthSheets, savePdfToFolder };
}

function makeService(stubs: ReturnType<typeof makeStubs>): ExportPdfService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: SheetsStore, useValue: stubs.sheets },
      { provide: DriveStore, useValue: stubs.drive },
    ],
  });
  return TestBed.inject(ExportPdfService);
}

// ── loadMonths ───────────────────────────────────────────────────────────────

describe('ExportPdfService.loadMonths', () => {
  it('calls listMonthSheets with the supplied year and sets months signal', async () => {
    const entries: MonthSheetEntry[] = [
      { sheetName: 'м_01', sheetId: 1, label: 'January 2026 (м_01)' },
      { sheetName: 'м_03', sheetId: 3, label: 'March 2026 (м_03)' },
    ];
    const stubs = makeStubs({ monthEntries: entries });
    const svc = makeService(stubs);

    await svc.loadMonths(2026);

    expect(stubs.listMonthSheets).toHaveBeenCalledWith(2026);
    expect(svc.months()).toEqual(entries);
  });
});

// ── exportMonth — happy path ─────────────────────────────────────────────────

describe('ExportPdfService.exportMonth — happy path', () => {
  it('sets result with filename and driveUrl on success', async () => {
    const stubs = makeStubs();
    const svc = makeService(stubs);

    await svc.exportMonth(ENTRY, YEAR);

    expect(svc.result()).toEqual({ filename: FILENAME, driveUrl: DRIVE_URL });
    expect(svc.error()).toBeNull();
  });

  it('builds the filename as Pyten_list_{year}_{MM}.pdf from the sheet name', async () => {
    const entry: MonthSheetEntry = { sheetName: 'м_09', sheetId: 9, label: 'September 2026 (м_09)' };
    const stubs = makeStubs();
    const svc = makeService(stubs);

    await svc.exportMonth(entry, 2026);

    expect(stubs.savePdfToFolder).toHaveBeenCalledWith(expect.any(Blob), 'Pyten_list_2026_09.pdf');
  });

  it('calls exportSheetAsPdf with entry.sheetId', async () => {
    const stubs = makeStubs();
    const svc = makeService(stubs);

    await svc.exportMonth(ENTRY, YEAR);

    expect(stubs.exportSheetAsPdf).toHaveBeenCalledWith(ENTRY.sheetId);
  });

  it('passes the exported blob and correct filename to savePdfToFolder', async () => {
    const stubs = makeStubs();
    const svc = makeService(stubs);

    await svc.exportMonth(ENTRY, YEAR);

    expect(stubs.savePdfToFolder).toHaveBeenCalledWith(PDF_BLOB, FILENAME);
  });

  it('loading is false after a successful export', async () => {
    const stubs = makeStubs();
    const svc = makeService(stubs);

    await svc.exportMonth(ENTRY, YEAR);

    expect(svc.loading()).toBe(false);
  });
});

// ── exportMonth — SheetNotFoundError ─────────────────────────────────────────

describe('ExportPdfService.exportMonth — sheet not found', () => {
  it('sets SheetNotFoundError when sheetExists returns false', async () => {
    const stubs = makeStubs({ sheetExists: false });
    const svc = makeService(stubs);

    await svc.exportMonth(ENTRY, YEAR);

    expect(svc.error()).toBeInstanceOf(SheetNotFoundError);
    expect(svc.result()).toBeNull();
  });

  it('does not call exportSheetAsPdf when the sheet is missing', async () => {
    const stubs = makeStubs({ sheetExists: false });
    const svc = makeService(stubs);

    await svc.exportMonth(ENTRY, YEAR);

    expect(stubs.exportSheetAsPdf).not.toHaveBeenCalled();
    expect(stubs.savePdfToFolder).not.toHaveBeenCalled();
  });
});

// ── exportMonth — ExportFailedError ──────────────────────────────────────────

describe('ExportPdfService.exportMonth — export fails', () => {
  it('sets ExportFailedError when exportSheetAsPdf throws', async () => {
    const stubs = makeStubs({
      exportBlob: new GoogleApiError(400, 'url', 'bad request'),
    });
    const svc = makeService(stubs);

    await svc.exportMonth(ENTRY, YEAR);

    expect(svc.error()).toBeInstanceOf(ExportFailedError);
    expect(svc.result()).toBeNull();
  });

  it('does not call savePdfToFolder when export fails (nothing saved)', async () => {
    const stubs = makeStubs({ exportBlob: new Error('export boom') });
    const svc = makeService(stubs);

    await svc.exportMonth(ENTRY, YEAR);

    expect(stubs.savePdfToFolder).not.toHaveBeenCalled();
  });

  it('loading is false after export failure', async () => {
    const stubs = makeStubs({ exportBlob: new Error('boom') });
    const svc = makeService(stubs);

    await svc.exportMonth(ENTRY, YEAR);

    expect(svc.loading()).toBe(false);
  });
});

// ── exportMonth — DriveWriteFailedError ──────────────────────────────────────

describe('ExportPdfService.exportMonth — Drive save fails', () => {
  it('sets DriveWriteFailedError when savePdfToFolder throws', async () => {
    const stubs = makeStubs({ driveUrl: new GoogleApiError(500, 'url', 'drive error') });
    const svc = makeService(stubs);

    await svc.exportMonth(ENTRY, YEAR);

    expect(svc.error()).toBeInstanceOf(DriveWriteFailedError);
    expect(svc.result()).toBeNull();
  });

  it('loading is false after Drive write failure', async () => {
    const stubs = makeStubs({ driveUrl: new Error('drive boom') });
    const svc = makeService(stubs);

    await svc.exportMonth(ENTRY, YEAR);

    expect(svc.loading()).toBe(false);
  });
});
