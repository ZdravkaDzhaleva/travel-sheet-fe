import { ChangeDetectionStrategy, Component, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { form, submit, required, validate, FormField } from '@angular/forms/signals';

import { InvoiceService } from '../../application/invoice.service';
import { MasterDataService } from '../../application/master-data.service';
import { ModalComponent } from '../../shared/ui/modal/modal.component';
import { ToastService } from '../../shared/ui/toast/toast.service';
import { ErrorAlertComponent } from '../../shared/ui/error-alert/error-alert.component';
import type { Invoice } from '../../domain/entities/index';
import { isPositive } from '../../domain/util/number';
import { parseDateInput, formatDateInput, formatDateDisplay } from '../../domain/util/date';

/**
 * Signal Forms model. Numeric fields default to 0 (never null — Signal Forms
 * require non-null bound values); a positivity validator enforces fuel 
 * quantities/prices to be always > 0.
 */
interface InvoiceFormModel {
  fuelVendor: string;
  invoiceDate: string; // YYYY-MM-DD from <input type="date">
  quantityLiters: number;
  unitPrice: number;
  totalAmount: number;
  currency: string;
}

function emptyModel(): InvoiceFormModel {
  return {
    fuelVendor: '',
    invoiceDate: '',
    quantityLiters: 0,
    unitPrice: 0,
    totalAmount: 0,
    currency: 'EUR',
  };
}

@Component({
  selector: 'app-invoices',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormField, ModalComponent, ErrorAlertComponent],
  templateUrl: './invoices.component.html',
  styleUrl: './invoices.component.scss',
})
export class InvoicesComponent implements OnInit {
  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileEl');

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

  /** Placeholder rows for the loading skeleton. */
  protected readonly skeletonRows = [0, 1, 2, 3];

  protected readonly model = signal<InvoiceFormModel>(emptyModel());
  protected readonly form = form(this.model, (path) => {
    required(path.fuelVendor, { message: 'Fuel vendor is required.' });
    validate(path.invoiceDate, ({ value }) =>
      parseDateInput(value()) === null
        ? { kind: 'invalidDate', message: 'Pick a valid invoice date.' }
        : undefined,
    );
    validate(path.quantityLiters, ({ value }) =>
      isPositive(value()) ? undefined : { kind: 'required', message: 'Quantity is required.' },
    );
    validate(path.unitPrice, ({ value }) =>
      isPositive(value()) ? undefined : { kind: 'required', message: 'Unit price is required.' },
    );
    validate(path.totalAmount, ({ value }) =>
      isPositive(value()) ? undefined : { kind: 'required', message: 'Total amount is required.' },
    );
  });

  /** The file lives outside the form: file inputs can't bind to `[formField]`. */
  protected readonly file = signal<File | null>(null);
  protected readonly editingId = signal<number | null>(null);
  protected readonly formOpen = signal(false);
  protected readonly confirmTarget = signal<Invoice | null>(null);
  protected readonly localError = signal<string | null>(null);
  /** Becomes true on the first submit attempt; gates inline field errors. */
  protected readonly submitted = signal(false);

  /** File is required only when adding (edits keep the existing Drive file). */
  protected readonly fileError = computed<string | null>(() =>
    this.editingId() === null && this.file() === null ? 'Choose an invoice file.' : null,
  );

  /** Flat list of error messages for the form summary (file + all field errors). */
  protected readonly errorMessages = computed<string[]>(() => {
    const messages: string[] = [];
    const fe = this.fileError();
    if (fe) messages.push(fe);
    for (const err of this.form().errorSummary()) {
      if (err.message) messages.push(err.message);
    }
    return messages;
  });

  ngOnInit(): void {
    void this.masterData.ensureLoaded();
    void this.invoiceService.load();
  }

  /** Retry the master-data + invoice load, forcing the Google consent prompt. */
  protected retryMaster(): void {
    void this.masterData.load({ forceConsent: true }).catch(() => undefined);
    void this.invoiceService.load();
  }

  protected onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.file.set(input.files?.[0] ?? null);
  }

  protected openAddForm(): void {
    this.editingId.set(null);
    this.resetForm();
    const input = this.fileInput()?.nativeElement;
    if (input) input.value = '';
    this.formOpen.set(true);
  }

  protected openEditForm(invoice: Invoice): void {
    this.startEdit(invoice);
  }

  protected startEdit(invoice: Invoice): void {
    this.editingId.set(invoice.Id);
    this.model.set({
      fuelVendor: invoice.FuelVendor,
      invoiceDate: formatDateInput(invoice.InvoiceDate),
      quantityLiters: invoice.QuantityLiters,
      unitPrice: invoice.UnitPrice,
      totalAmount: invoice.TotalAmount,
      currency: invoice.Currency,
    });
    this.file.set(null);
    this.localError.set(null);
    this.submitted.set(false);
    this.form().reset();
    this.formOpen.set(true);
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.resetForm();
    this.formOpen.set(false);
  }

  private resetForm(): void {
    this.model.set(emptyModel());
    this.file.set(null);
    this.localError.set(null);
    this.submitted.set(false);
    this.form().reset();
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
      this.toast.show(`Delete failed: ${errorMessage(err)}`, 'error');
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

    const editingId = this.editingId();
    // File is validated outside the form; block before touching the form action.
    if (editingId === null && this.file() === null) {
      this.form().markAsTouched();
      return;
    }

    await submit(this.form, async () => {
      // Only reached when every field validator passes.
      const m = this.model();
      const date = parseDateInput(m.invoiceDate)!;

      if (editingId !== null) {
        const existing = this.invoices().find(i => i.Id === editingId);
        if (!existing) {
          this.localError.set('Invoice not found — it may have been deleted in another tab.');
          return;
        }
        try {
          await this.invoiceService.update({
            ...existing,
            FuelVendor: m.fuelVendor.trim(),
            InvoiceDate: date,
            QuantityLiters: m.quantityLiters,
            UnitPrice: m.unitPrice,
            TotalAmount: m.totalAmount,
            Currency: m.currency.trim(),
          });
          this.cancelEdit();
          this.toast.show('Invoice updated', 'success');
        } catch (err) {
          this.toast.show(`Update failed: ${errorMessage(err)}`, 'error');
        }
        return;
      }

      const file = this.file()!;
      try {
        await this.invoiceService.upload({
          companyId: company.Id,
          reportingYear: company.ReportingYear,
          vehicleId: vehicle.Id,
          fuelVendor: m.fuelVendor.trim(),
          invoiceDate: date,
          quantityLiters: m.quantityLiters,
          unitPrice: m.unitPrice,
          totalAmount: m.totalAmount,
          currency: m.currency.trim(),
          file,
          fileName: file.name,
        });
        this.resetForm();
        this.formOpen.set(false);
        this.toast.show('Invoice uploaded', 'success');
      } catch (err) {
        this.toast.show(`Upload failed: ${errorMessage(err)}`, 'error');
      }
    });
  }

  protected formatDate(d: Date): string {
    return formatDateDisplay(d);
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
