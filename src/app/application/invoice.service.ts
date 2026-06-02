import { Injectable, inject, signal } from '@angular/core';

import { SheetsStore } from '../infrastructure/sheets.store';
import { DriveStore, type DriveFileId } from '../infrastructure/drive.store';
import type { Invoice } from '../domain/entities/index';

export interface InvoiceUploadInput {
  readonly companyId: number;
  readonly reportingYear: number;
  readonly vehicleId: number;
  readonly fuelVendor: string;
  readonly invoiceDate: Date;
  readonly quantityLiters: number;
  readonly unitPrice: number;
  readonly totalAmount: number;
  readonly currency: string;
  readonly file: Blob;
  readonly fileName?: string;
}

@Injectable({ providedIn: 'root' })
export class InvoiceService {
  private readonly sheets = inject(SheetsStore);
  private readonly drive = inject(DriveStore);

  private readonly _invoices = signal<readonly Invoice[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<Error | null>(null);

  readonly invoices = this._invoices.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  /** Reads all invoices from the supporting sheet into the signal. */
  async load(): Promise<readonly Invoice[]> {
    return this.run(async () => {
      const list = await this.sheets.loadInvoices();
      this._invoices.set(list);
      return list;
    });
  }

  /** Uploads the file to Drive, appends the metadata row, and returns the new Invoice. */
  async upload(input: InvoiceUploadInput): Promise<Invoice> {
    return this.run(async () => {
      const existing = await this.sheets.loadInvoices();
      const driveFileId: DriveFileId = await this.drive.uploadInvoice(
        input.file,
        input.fileName,
      );
      const invoice: Invoice = {
        Id: nextId(existing),
        CompanyId: input.companyId,
        ReportingYear: input.reportingYear,
        VehicleId: input.vehicleId,
        FuelVendor: input.fuelVendor,
        InvoiceDate: input.invoiceDate,
        QuantityLiters: input.quantityLiters,
        UnitPrice: input.unitPrice,
        TotalAmount: input.totalAmount,
        Currency: input.currency,
        DriveFileId: driveFileId,
      };
      await this.sheets.appendInvoice(invoice);
      this._invoices.set([...existing, invoice]);
      return invoice;
    });
  }

  /** Overwrites the row whose Id matches `invoice.Id` and refreshes the signal. */
  async update(invoice: Invoice): Promise<void> {
    await this.run(async () => {
      await this.sheets.updateInvoice(invoice);
      this._invoices.update(list =>
        list.map(i => (i.Id === invoice.Id ? invoice : i)),
      );
    });
  }

  /** Removes the row with the given Id and refreshes the signal. */
  async delete(invoiceId: number): Promise<void> {
    await this.run(async () => {
      await this.sheets.deleteInvoice(invoiceId);
      this._invoices.update(list => list.filter(i => i.Id !== invoiceId));
    });
  }

  private async run<T>(fn: () => Promise<T>): Promise<T> {
    this._loading.set(true);
    this._error.set(null);
    try {
      return await fn();
    } catch (err) {
      this._error.set(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      this._loading.set(false);
    }
  }
}

function nextId(existing: readonly Invoice[]): number {
  let max = 0;
  for (const inv of existing) if (inv.Id > max) max = inv.Id;
  return max + 1;
}
