import { Component, ElementRef, OnInit, ViewChild, effect, inject, signal } from '@angular/core';
import { FormsModule, } from '@angular/forms';
import { KeyValuePipe } from '@angular/common';

import { InvoiceService } from '../../application/invoice.service';
import { MasterDataService } from '../../application/master-data.service';
import { ModalComponent } from '../../shared/ui/modal/modal.component';
import { ToastService } from '../../shared/ui/toast/toast.service';
import { ErrorAlertComponent } from '../../shared/ui/error-alert/error-alert.component';
import type { Invoice } from '../../domain/entities/index';

interface InvoiceFormState {
  fuelVendor: string;
  invoiceDate: string; // YYYY-MM-DD from <input type="date">
  quantityLiters: number | null;
  unitPrice: number | null;
  totalAmount: number | null;
  currency: string;
}

function emptyForm(): InvoiceFormState {
  return {
    fuelVendor: '',
    invoiceDate: '',
    quantityLiters: null,
    unitPrice: null,
    totalAmount: null,
    currency: 'EUR',
  };
}

@Component({
  selector: 'app-invoices',
  standalone: true,
  imports: [FormsModule, KeyValuePipe, ModalComponent, ErrorAlertComponent],
  templateUrl: './invoices.component.html',
  styleUrl: './invoices.component.scss',
})
export class InvoicesComponent implements OnInit {

  @ViewChild('fileEl') private fileElRef!: ElementRef<HTMLInputElement>;
  
  private readonly invoiceService = inject(InvoiceService);
  private readonly masterData = inject(MasterDataService);
  private readonly toast = inject(ToastService);

  protected readonly invoices = this.invoiceService.invoices;
  protected readonly serviceLoading = this.invoiceService.loading;
  protected readonly serviceError = this.invoiceService.error;
  protected readonly company = this.masterData.company;
  protected readonly vehicle = this.masterData.vehicle;
  protected readonly masterReady = this.masterData.ready;
  protected readonly masterError = this.masterData.error;
  protected readonly masterLoading = this.masterData.loading;

  /** Placeholder rows for the loading skeleton. */
  protected readonly skeletonRows = [0, 1, 2, 3];

  protected formData: InvoiceFormState = emptyForm();
  protected file: File | null = null;
  protected readonly editingId = signal<number | null>(null);
  protected readonly formOpen = signal(false);
  protected readonly confirmTarget = signal<Invoice | null>(null);
  protected readonly localError = signal<string | null>(null);
  /** Becomes true on the first submit attempt; gates inline field errors. */
  protected readonly submitted = signal(false);

  /** Mirror a master-data load failure to a toast once per distinct error. */
  private lastToastedMasterError: Error | null = null;
  private readonly _masterErrorToast = effect(() => {
    const err = this.masterError();
    if (err && err !== this.lastToastedMasterError) {
      this.lastToastedMasterError = err;
      this.toast.show('Could not load your workspace', 'error', {
        label: 'Retry',
        fn: () => this.retryMaster(),
      });
    } else if (!err) {
      this.lastToastedMasterError = null;
    }
  });

  ngOnInit(): void {
    if (!this.masterReady() && !this.masterLoading() && this.masterError() === null) {
      void this.masterData.load();
    }
    void this.invoiceService.load();
  }

  /** Retry the master-data + invoice load, forcing the Google consent prompt. */
  protected retryMaster(): void {
    void this.masterData.load({ forceConsent: true }).catch(() => undefined);
    void this.invoiceService.load();
  }

  protected onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.file = input.files?.[0] ?? null;
  }

  protected openAddForm(): void {
    this.editingId.set(null);
    this.formData = emptyForm();
    this.file = null;
    this.fileElRef.nativeElement.value = '';
    this.localError.set(null);
    this.formOpen.set(true);
  }

  protected openEditForm(invoice: Invoice): void {
    this.startEdit(invoice);
  }

  protected startEdit(invoice: Invoice): void {
    this.editingId.set(invoice.Id);
    this.formData = {
      fuelVendor: invoice.FuelVendor,
      invoiceDate: formatDateInput(invoice.InvoiceDate),
      quantityLiters: invoice.QuantityLiters,
      unitPrice: invoice.UnitPrice,
      totalAmount: invoice.TotalAmount,
      currency: invoice.Currency,
    };
    this.file = null;
    this.localError.set(null);
    this.formOpen.set(true);
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.formData = emptyForm();
    this.file = null;
    this.localError.set(null);
    this.submitted.set(false);
    this.formOpen.set(false);
  }

  protected fieldErrors(): Record<string, string> {
    const f = this.formData;
    const isAdd = this.editingId() === null;
    const errors: Record<string, string> = {};
    if (isAdd && this.file === null) errors['file'] = 'Choose an invoice file.';
    if (!f.fuelVendor.trim()) errors['fuelVendor'] = 'Fuel vendor is required.';
    if (!f.invoiceDate || parseDateInput(f.invoiceDate) === null) errors['invoiceDate'] = 'Pick a valid invoice date.';
    if (f.quantityLiters === null) errors['quantityLiters'] = 'Quantity is required.';
    if (f.unitPrice === null) errors['unitPrice'] = 'Unit price is required.';
    if (f.totalAmount === null) errors['totalAmount'] = 'Total amount is required.';
    return errors;
  }

  protected requestDelete(invoice: Invoice): void {
    this.confirmTarget.set(invoice);
  }

  protected cancelDelete(): void {
    this.confirmTarget.set(null);
  }

  protected async confirmDelete(): Promise<void> {
    const target = this.confirmTarget();
    if (!target) return;
    try {
      await this.invoiceService.delete(target.Id);
      this.confirmTarget.set(null);
      this.toast.show(`${target.FuelVendor} invoice deleted`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.toast.show(`Delete failed: ${msg}`, 'error');
    }
  }

  protected async submit(): Promise<void> {
    this.submitted.set(true);
    this.localError.set(null);

    const company = this.company();
    const vehicle = this.vehicle();
    if (company === null || vehicle === null) {
      this.localError.set('Master data is not loaded yet — try again in a moment.');
      return;
    }

    const errors = this.fieldErrors();
    if (Object.keys(errors).length > 0) {
      // fieldErrors() drives inline messages; localError stays null so only the summary shows.
      return;
    }

    const date = parseDateInput(this.formData.invoiceDate)!;
    const quantity = this.formData.quantityLiters!;
    const price = this.formData.unitPrice!;
    const total = this.formData.totalAmount!;

    const editingId = this.editingId();
    if (editingId !== null) {
      const existing = this.invoices().find(i => i.Id === editingId);
      if (!existing) {
        this.localError.set('Invoice not found — it may have been deleted in another tab.');
        return;
      }
      try {
        await this.invoiceService.update({
          ...existing,
          FuelVendor: this.formData.fuelVendor.trim(),
          InvoiceDate: date,
          QuantityLiters: quantity,
          UnitPrice: price,
          TotalAmount: total,
          Currency: this.formData.currency.trim(),
        });
        this.cancelEdit();
        this.toast.show('Invoice updated', 'success');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.toast.show(`Update failed: ${msg}`, 'error');
      }
      return;
    }

    if (this.file === null) {
      this.localError.set('Pick an invoice file to upload.');
      return;
    }

    try {
      await this.invoiceService.upload({
        companyId: company.Id,
        reportingYear: company.ReportingYear,
        vehicleId: vehicle.Id,
        fuelVendor: this.formData.fuelVendor.trim(),
        invoiceDate: date,
        quantityLiters: quantity,
        unitPrice: price,
        totalAmount: total,
        currency: this.formData.currency.trim(),
        file: this.file,
        fileName: this.file.name,
      });
      this.formData = emptyForm();
      this.file = null;
      this.submitted.set(false);
      this.formOpen.set(false);
      this.toast.show('Invoice uploaded', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.toast.show(`Upload failed: ${msg}`, 'error');
    }
  }

  // Keep for legacy spec compatibility — used in existing tests via instance()
  protected async deleteInvoice(invoice: Invoice): Promise<void> {
    this.requestDelete(invoice);
  }

  protected formatDate(d: Date): string {
    return formatDateDisplay(d);
  }
}

/** YYYY-MM-DD → local Date (avoids the UTC-midnight roll-back from `new Date('YYYY-MM-DD')`). */
function parseDateInput(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) {
    return null;
  }
  return date;
}

/** Date → YYYY-MM-DD (local parts, for <input type="date">). */
function formatDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Date → DD.MM.YYYY (local parts, for display). */
function formatDateDisplay(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0');
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}.${m}.${d.getFullYear()}`;
}
