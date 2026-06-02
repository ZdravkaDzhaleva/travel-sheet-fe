import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';

import { InvoiceService, type InvoiceUploadInput } from './invoice.service';
import { SheetsStore } from '../infrastructure/sheets.store';
import { DriveStore } from '../infrastructure/drive.store';
import { InvoiceNotFoundError } from '../infrastructure/sheets-store.errors';
import { makeInvoices } from '../../test-fixtures/index';
import type { Invoice } from '../domain/entities/index';

interface StoreStub {
  readonly sheets: SheetsStore;
  readonly drive: DriveStore;
  readonly loadInvoices: ReturnType<typeof vi.fn>;
  readonly appendInvoice: ReturnType<typeof vi.fn>;
  readonly updateInvoice: ReturnType<typeof vi.fn>;
  readonly deleteInvoice: ReturnType<typeof vi.fn>;
  readonly uploadInvoice: ReturnType<typeof vi.fn>;
}

function makeStubs(initial: Invoice[] = []): StoreStub {
  // Mutable backing list so service updates can be observed through subsequent loads.
  let invoices: Invoice[] = [...initial];

  const loadInvoices = vi.fn(async () => [...invoices]);
  const appendInvoice = vi.fn(async (inv: Invoice) => {
    invoices = [...invoices, inv];
  });
  const updateInvoice = vi.fn(async (inv: Invoice) => {
    const i = invoices.findIndex(x => x.Id === inv.Id);
    if (i === -1) throw new InvoiceNotFoundError(inv.Id);
    invoices = invoices.map(x => (x.Id === inv.Id ? inv : x));
  });
  const deleteInvoice = vi.fn(async (id: number) => {
    const i = invoices.findIndex(x => x.Id === id);
    if (i === -1) throw new InvoiceNotFoundError(id);
    invoices = invoices.filter(x => x.Id !== id);
  });
  const uploadInvoice = vi.fn(async () => 'drive-new');

  const sheets = { loadInvoices, appendInvoice, updateInvoice, deleteInvoice } as unknown as SheetsStore;
  const drive = { uploadInvoice } as unknown as DriveStore;
  return { sheets, drive, loadInvoices, appendInvoice, updateInvoice, deleteInvoice, uploadInvoice };
}

function makeService(stubs: StoreStub): InvoiceService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: SheetsStore, useValue: stubs.sheets },
      { provide: DriveStore, useValue: stubs.drive },
    ],
  });
  return TestBed.inject(InvoiceService);
}

const UPLOAD_INPUT: InvoiceUploadInput = {
  companyId: 1,
  reportingYear: 2026,
  vehicleId: 1,
  fuelVendor: 'OMV',
  invoiceDate: new Date(2026, 0, 12),
  quantityLiters: 30,
  unitPrice: 2.95,
  totalAmount: 88.5,
  currency: 'BGN',
  file: new Blob(['pdf-bytes'], { type: 'application/pdf' }),
  fileName: 'invoice-3.pdf',
};

describe('InvoiceService — initial state', () => {
  it('starts with an empty list and no error', () => {
    const svc = makeService(makeStubs());
    expect(svc.invoices()).toEqual([]);
    expect(svc.loading()).toBe(false);
    expect(svc.error()).toBeNull();
  });
});

describe('InvoiceService.load', () => {
  it('reads invoices from SheetsStore and exposes them via the signal', async () => {
    const stubs = makeStubs(makeInvoices());
    const svc = makeService(stubs);
    const out = await svc.load();
    expect(out).toHaveLength(2);
    expect(svc.invoices()).toHaveLength(2);
    expect(stubs.loadInvoices).toHaveBeenCalledOnce();
  });

  it('captures the error in the signal and rethrows', async () => {
    const stubs = makeStubs();
    stubs.loadInvoices.mockRejectedValueOnce(new Error('boom'));
    const svc = makeService(stubs);
    await expect(svc.load()).rejects.toThrow('boom');
    expect(svc.error()?.message).toBe('boom');
    expect(svc.loading()).toBe(false);
  });
});

describe('InvoiceService.upload', () => {
  it('uploads the file then appends a row with the Drive id and the next free Id', async () => {
    const stubs = makeStubs(makeInvoices()); // existing Ids: 1, 2
    const svc = makeService(stubs);
    const created = await svc.upload(UPLOAD_INPUT);

    expect(stubs.uploadInvoice).toHaveBeenCalledWith(
      UPLOAD_INPUT.file,
      'invoice-3.pdf',
    );
    expect(stubs.appendInvoice).toHaveBeenCalledOnce();
    expect(created).toEqual({
      Id: 3,
      CompanyId: 1,
      ReportingYear: 2026,
      VehicleId: 1,
      FuelVendor: 'OMV',
      InvoiceDate: UPLOAD_INPUT.invoiceDate,
      QuantityLiters: 30,
      UnitPrice: 2.95,
      TotalAmount: 88.5,
      Currency: 'BGN',
      DriveFileId: 'drive-new',
    });
    expect(svc.invoices()).toHaveLength(3);
    expect(svc.invoices()[2]).toEqual(created);
  });

  it('allocates Id = 1 when no invoices exist yet', async () => {
    const stubs = makeStubs();
    const svc = makeService(stubs);
    const created = await svc.upload(UPLOAD_INPUT);
    expect(created.Id).toBe(1);
  });

  it('calls Drive before Sheets so a sheet append never references a missing file', async () => {
    const stubs = makeStubs();
    const order: string[] = [];
    stubs.uploadInvoice.mockImplementationOnce(async () => {
      order.push('drive');
      return 'drive-new';
    });
    stubs.appendInvoice.mockImplementationOnce(async () => {
      order.push('sheets');
    });
    const svc = makeService(stubs);
    await svc.upload(UPLOAD_INPUT);
    expect(order).toEqual(['drive', 'sheets']);
  });

  it('does not append to the sheet when the Drive upload fails', async () => {
    const stubs = makeStubs();
    stubs.uploadInvoice.mockRejectedValueOnce(new Error('drive 500'));
    const svc = makeService(stubs);
    await expect(svc.upload(UPLOAD_INPUT)).rejects.toThrow('drive 500');
    expect(stubs.appendInvoice).not.toHaveBeenCalled();
    expect(svc.invoices()).toEqual([]);
    expect(svc.error()?.message).toBe('drive 500');
  });
});

describe('InvoiceService.update', () => {
  it('updates the matching invoice in the signal after SheetsStore confirms', async () => {
    const stubs = makeStubs(makeInvoices());
    const svc = makeService(stubs);
    await svc.load();

    const edited: Invoice = { ...makeInvoices()[0], FuelVendor: 'Shell' };
    await svc.update(edited);

    expect(stubs.updateInvoice).toHaveBeenCalledWith(edited);
    expect(svc.invoices().find(i => i.Id === edited.Id)?.FuelVendor).toBe('Shell');
    expect(svc.invoices()).toHaveLength(2);
  });

  it('propagates InvoiceNotFoundError from SheetsStore', async () => {
    const stubs = makeStubs(makeInvoices());
    const svc = makeService(stubs);
    const ghost: Invoice = { ...makeInvoices()[0], Id: 999 };
    await expect(svc.update(ghost)).rejects.toBeInstanceOf(InvoiceNotFoundError);
    expect(svc.error()).toBeInstanceOf(InvoiceNotFoundError);
  });
});

describe('InvoiceService.delete', () => {
  it('removes the row from the signal after SheetsStore confirms', async () => {
    const stubs = makeStubs(makeInvoices());
    const svc = makeService(stubs);
    await svc.load();
    await svc.delete(1);
    expect(stubs.deleteInvoice).toHaveBeenCalledWith(1);
    expect(svc.invoices().map(i => i.Id)).toEqual([2]);
  });

  it('propagates InvoiceNotFoundError from SheetsStore', async () => {
    const stubs = makeStubs(makeInvoices());
    const svc = makeService(stubs);
    await expect(svc.delete(999)).rejects.toBeInstanceOf(InvoiceNotFoundError);
    expect(svc.error()).toBeInstanceOf(InvoiceNotFoundError);
  });
});
