import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { InvoiceService } from '../../application/invoice.service';
import { MasterDataService } from '../../application/master-data.service';
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
  imports: [FormsModule, RouterLink],
  templateUrl: './invoices.component.html',
  styleUrl: './invoices.component.scss',
})
export class InvoicesComponent implements OnInit {
  private readonly invoiceService = inject(InvoiceService);
  private readonly masterData = inject(MasterDataService);

  protected readonly invoices = this.invoiceService.invoices;
  protected readonly serviceLoading = this.invoiceService.loading;
  protected readonly serviceError = this.invoiceService.error;
  protected readonly company = this.masterData.company;
  protected readonly vehicle = this.masterData.vehicle;
  protected readonly masterReady = this.masterData.ready;
  protected readonly masterError = this.masterData.error;

  protected formData: InvoiceFormState = emptyForm();
  protected file: File | null = null;
  protected readonly editingId = signal<number | null>(null);
  protected readonly localError = signal<string | null>(null);

  ngOnInit(): void {
    if (!this.masterReady() && !this.masterData.loading() && this.masterError() === null) {
      void this.masterData.load();
    }
    void this.invoiceService.load();
  }

  protected onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.file = input.files?.[0] ?? null;
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
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.formData = emptyForm();
    this.file = null;
    this.localError.set(null);
  }

  protected async submit(): Promise<void> {
    this.localError.set(null);

    const company = this.company();
    const vehicle = this.vehicle();
    if (company === null || vehicle === null) {
      this.localError.set('Master data is not loaded yet — try again in a moment.');
      return;
    }

    const date = parseDateInput(this.formData.invoiceDate);
    if (date === null) {
      this.localError.set('Pick a valid invoice date.');
      return;
    }
    const quantity = this.formData.quantityLiters;
    const price = this.formData.unitPrice;
    const total = this.formData.totalAmount;
    if (quantity === null || price === null || total === null) {
      this.localError.set('Quantity, unit price, and total are all required.');
      return;
    }
    if (!this.formData.fuelVendor.trim()) {
      this.localError.set('Fuel vendor is required.');
      return;
    }

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
      } catch {
        // Error already exposed via invoiceService.error signal; keep form open.
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
    } catch {
      // Error surfaced via invoiceService.error; keep form filled so the user can retry.
    }
  }

  protected async deleteInvoice(invoice: Invoice): Promise<void> {
    const ok = window.confirm(
      `Delete invoice ${invoice.FuelVendor} ${formatDateDisplay(invoice.InvoiceDate)}?`,
    );
    if (!ok) return;
    try {
      await this.invoiceService.delete(invoice.Id);
    } catch {
      // Service exposes error via signal.
    }
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
