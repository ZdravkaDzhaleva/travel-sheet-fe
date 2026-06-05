import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal, type Signal, type WritableSignal } from '@angular/core';

import { InvoicesComponent } from './invoices.component';
import { InvoiceService } from '../../application/invoice.service';
import { MasterDataService } from '../../application/master-data.service';
import { ToastService } from '../../shared/ui/toast/toast.service';
import {
  makeCompany,
  makeVehicle,
  makeInvoices,
} from '../../../test-fixtures/index';
import type { Company, Invoice, Vehicle } from '../../domain/entities/index';

interface MasterStubs {
  readonly company: ReturnType<typeof signal<Company | null>>;
  readonly vehicle: ReturnType<typeof signal<Vehicle | null>>;
  readonly loading: ReturnType<typeof signal<boolean>>;
  readonly error: ReturnType<typeof signal<Error | null>>;
  readonly load: ReturnType<typeof vi.fn>;
  readonly service: MasterDataService;
}

interface InvoiceStubs {
  readonly invoices: ReturnType<typeof signal<readonly Invoice[]>>;
  readonly loading: ReturnType<typeof signal<boolean>>;
  readonly error: ReturnType<typeof signal<Error | null>>;
  readonly load: ReturnType<typeof vi.fn>;
  readonly upload: ReturnType<typeof vi.fn>;
  readonly update: ReturnType<typeof vi.fn>;
  readonly delete: ReturnType<typeof vi.fn>;
  readonly service: InvoiceService;
}

function makeMasterStubs(initial: {
  company?: Company | null;
  vehicle?: Vehicle | null;
} = {}): MasterStubs {
  const company = signal<Company | null>(initial.company !== undefined ? initial.company : makeCompany());
  const vehicle = signal<Vehicle | null>(initial.vehicle !== undefined ? initial.vehicle : makeVehicle());
  const loading = signal<boolean>(false);
  const error = signal<Error | null>(null);
  const load = vi.fn(async () => undefined);
  const service = {
    company: company.asReadonly() as Signal<Company | null>,
    vehicle: vehicle.asReadonly() as Signal<Vehicle | null>,
    loading: loading.asReadonly() as Signal<boolean>,
    error: error.asReadonly() as Signal<Error | null>,
    ready: () => company() !== null && vehicle() !== null,
    load,
  } as unknown as MasterDataService;
  return { company, vehicle, loading, error, load, service };
}

function makeInvoiceStubs(initial: readonly Invoice[] = []): InvoiceStubs {
  const invoices = signal<readonly Invoice[]>(initial);
  const loading = signal<boolean>(false);
  const error = signal<Error | null>(null);
  const load = vi.fn(async () => initial);
  const upload = vi.fn(async () => initial[0] ?? null);
  const update = vi.fn(async () => undefined);
  const del = vi.fn(async () => undefined);
  const service = {
    invoices: invoices.asReadonly() as Signal<readonly Invoice[]>,
    loading: loading.asReadonly() as Signal<boolean>,
    error: error.asReadonly() as Signal<Error | null>,
    load,
    upload,
    update,
    delete: del,
  } as unknown as InvoiceService;
  return { invoices, loading, error, load, upload, update, delete: del, service };
}

function render(master: MasterStubs, inv: InvoiceStubs): ComponentFixture<InvoicesComponent> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [InvoicesComponent],
    providers: [
      provideRouter([]),
      { provide: MasterDataService, useValue: master.service },
      { provide: InvoiceService, useValue: inv.service },
    ],
  });
  const fixture = TestBed.createComponent(InvoicesComponent);
  fixture.detectChanges();
  return fixture;
}

function instance(fixture: ComponentFixture<InvoicesComponent>): {
  submit(): Promise<void>;
  fieldErrors(): Record<string, string>;
  openAddForm(): void;
  startEdit(invoice: Invoice): void;
  openEditForm(invoice: Invoice): void;
  cancelEdit(): void;
  requestDelete(invoice: Invoice): void;
  cancelDelete(): void;
  confirmDelete(): Promise<void>;
  deleteInvoice(invoice: Invoice): Promise<void>;
  formData: {
    fuelVendor: string;
    invoiceDate: string;
    quantityLiters: number | null;
    unitPrice: number | null;
    totalAmount: number | null;
    currency: string;
  };
  file: File | null;
  editingId: () => number | null;
  formOpen: WritableSignal<boolean>;
  submitted: WritableSignal<boolean>;
  confirmTarget: () => Invoice | null;
  localError: () => string | null;
} {
  return fixture.componentInstance as unknown as ReturnType<typeof instance>;
}

describe('InvoicesComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('triggers MasterDataService.load + InvoiceService.load on init', () => {
    const master = makeMasterStubs({ company: null, vehicle: null });
    const inv = makeInvoiceStubs();
    render(master, inv);
    expect(master.load).toHaveBeenCalledOnce();
    expect(inv.load).toHaveBeenCalledOnce();
  });

  it('skips MasterDataService.load when master data is already ready', () => {
    const master = makeMasterStubs();
    const inv = makeInvoiceStubs();
    render(master, inv);
    expect(master.load).not.toHaveBeenCalled();
    expect(inv.load).toHaveBeenCalledOnce();
  });

  it('renders each invoice with vendor, date, and amounts', () => {
    const master = makeMasterStubs();
    const inv = makeInvoiceStubs(makeInvoices());
    const fixture = render(master, inv);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Лукойл');
    expect(text).toContain('10.01.2026');
    expect(text).toContain('25.01.2026');
    expect(text).toContain('40');
    expect(text).toContain('EUR');
  });

  it('renders mobile card labels (Quantity/Unit price/Total) once per invoice', () => {
    const master = makeMasterStubs();
    const rows = makeInvoices();
    const inv = makeInvoiceStubs(rows);
    const fixture = render(master, inv);
    const el = fixture.nativeElement as HTMLElement;
    const labels = Array.from(
      el.querySelectorAll<HTMLElement>('.table__card-label'),
    ).map(n => n.textContent?.trim());
    expect(labels.filter(l => l === 'Quantity').length).toBe(rows.length);
    expect(labels.filter(l => l === 'Unit price').length).toBe(rows.length);
    expect(labels.filter(l => l === 'Total').length).toBe(rows.length);
  });

  it('renders icon edit/delete buttons with aria-labels', () => {
    const master = makeMasterStubs();
    const inv = makeInvoiceStubs(makeInvoices());
    const fixture = render(master, inv);
    const el = fixture.nativeElement as HTMLElement;
    const editBtns = el.querySelectorAll<HTMLButtonElement>('.icon-btn:not(.icon-btn--danger)');
    const deleteBtns = el.querySelectorAll<HTMLButtonElement>('.icon-btn--danger');
    expect(editBtns.length).toBe(makeInvoices().length);
    expect(deleteBtns.length).toBe(makeInvoices().length);
    expect(editBtns[0].getAttribute('aria-label')).toContain('Edit');
    expect(deleteBtns[0].getAttribute('aria-label')).toContain('Delete');
  });

  it('shows "Add invoice" button in the page header', () => {
    const master = makeMasterStubs();
    const inv = makeInvoiceStubs();
    const fixture = render(master, inv);
    const el = fixture.nativeElement as HTMLElement;
    const addBtn = Array.from(el.querySelectorAll('button')).find(b => b.textContent?.includes('Add invoice'));
    expect(addBtn).toBeTruthy();
  });

  it('form is hidden by default and shown after openAddForm()', () => {
    const master = makeMasterStubs();
    const inv = makeInvoiceStubs();
    const fixture = render(master, inv);
    const cmp = instance(fixture);
    expect(cmp.formOpen()).toBe(false);
    cmp.openAddForm();
    expect(cmp.formOpen()).toBe(true);
  });

  it('upload submit calls InvoiceService.upload with parsed local Date and company/vehicle defaults', async () => {
    const master = makeMasterStubs();
    const inv = makeInvoiceStubs();
    const fixture = render(master, inv);
    const cmp = instance(fixture);

    cmp.file = new File(['x'], 'invoice.pdf', { type: 'application/pdf' });
    cmp.formData = {
      fuelVendor: '  OMV  ',
      invoiceDate: '2026-02-14',
      quantityLiters: 30,
      unitPrice: 2.95,
      totalAmount: 88.5,
      currency: 'EUR',
    };
    await cmp.submit();

    expect(inv.upload).toHaveBeenCalledOnce();
    const arg = inv.upload.mock.calls[0][0] as {
      companyId: number;
      reportingYear: number;
      vehicleId: number;
      fuelVendor: string;
      invoiceDate: Date;
      quantityLiters: number;
      unitPrice: number;
      totalAmount: number;
      currency: string;
      file: Blob;
      fileName?: string;
    };
    expect(arg.companyId).toBe(makeCompany().Id);
    expect(arg.vehicleId).toBe(makeVehicle().Id);
    expect(arg.reportingYear).toBe(makeCompany().ReportingYear);
    expect(arg.fuelVendor).toBe('OMV');
    expect(arg.invoiceDate.getFullYear()).toBe(2026);
    expect(arg.invoiceDate.getMonth()).toBe(1);
    expect(arg.invoiceDate.getDate()).toBe(14);
    expect(arg.quantityLiters).toBe(30);
    expect(arg.unitPrice).toBe(2.95);
    expect(arg.totalAmount).toBe(88.5);
    expect(arg.fileName).toBe('invoice.pdf');
  });

  it('blocks upload submit when no file is picked', async () => {
    const master = makeMasterStubs();
    const inv = makeInvoiceStubs();
    const fixture = render(master, inv);
    const cmp = instance(fixture);

    cmp.formData = {
      fuelVendor: 'OMV',
      invoiceDate: '2026-02-14',
      quantityLiters: 30,
      unitPrice: 2.95,
      totalAmount: 88.5,
      currency: 'EUR',
    };
    cmp.file = null;
    await cmp.submit();
    expect(inv.upload).not.toHaveBeenCalled();
    expect(cmp.fieldErrors()['file']).toBeTruthy();
  });

  it('blocks submit when invoice date is missing or malformed', async () => {
    const master = makeMasterStubs();
    const inv = makeInvoiceStubs();
    const fixture = render(master, inv);
    const cmp = instance(fixture);

    cmp.file = new File(['x'], 'i.pdf');
    cmp.formData = {
      fuelVendor: 'OMV',
      invoiceDate: 'not-a-date',
      quantityLiters: 30,
      unitPrice: 2.95,
      totalAmount: 88.5,
      currency: 'EUR',
    };
    await cmp.submit();
    expect(inv.upload).not.toHaveBeenCalled();
    expect(cmp.fieldErrors()['invoiceDate']).toBeTruthy();
  });

  it('startEdit pre-fills the form and opens form', () => {
    const master = makeMasterStubs();
    const inv = makeInvoiceStubs(makeInvoices());
    const fixture = render(master, inv);
    const cmp = instance(fixture);
    const target = makeInvoices()[0];
    cmp.startEdit(target);
    expect(cmp.editingId()).toBe(target.Id);
    expect(cmp.formOpen()).toBe(true);
    expect(cmp.formData.fuelVendor).toBe(target.FuelVendor);
    expect(cmp.formData.invoiceDate).toBe('2026-01-10');
    expect(cmp.formData.quantityLiters).toBe(target.QuantityLiters);
  });

  it('edit submit calls InvoiceService.update with the merged Invoice and closes form', async () => {
    const master = makeMasterStubs();
    const inv = makeInvoiceStubs(makeInvoices());
    const fixture = render(master, inv);
    const cmp = instance(fixture);

    cmp.startEdit(makeInvoices()[0]);
    cmp.formData.fuelVendor = 'Shell';
    cmp.formData.quantityLiters = 99;
    await cmp.submit();

    expect(inv.update).toHaveBeenCalledOnce();
    const arg = inv.update.mock.calls[0][0] as Invoice;
    expect(arg.Id).toBe(makeInvoices()[0].Id);
    expect(arg.FuelVendor).toBe('Shell');
    expect(arg.QuantityLiters).toBe(99);
    expect(arg.DriveFileId).toBe(makeInvoices()[0].DriveFileId);
    expect(cmp.editingId()).toBeNull();
    expect(cmp.formOpen()).toBe(false);
  });

  it('requestDelete sets confirmTarget; cancelDelete clears it without deleting', async () => {
    const master = makeMasterStubs();
    const inv = makeInvoiceStubs(makeInvoices());
    const fixture = render(master, inv);
    const cmp = instance(fixture);
    const target = makeInvoices()[0];

    cmp.requestDelete(target);
    expect(cmp.confirmTarget()).toEqual(target);

    cmp.cancelDelete();
    expect(cmp.confirmTarget()).toBeNull();
    expect(inv.delete).not.toHaveBeenCalled();
  });

  it('confirmDelete calls InvoiceService.delete and fires a success toast', async () => {
    const master = makeMasterStubs();
    const inv = makeInvoiceStubs(makeInvoices());
    const fixture = render(master, inv);
    const cmp = instance(fixture);
    const toast = TestBed.inject(ToastService);
    const target = makeInvoices()[0];

    cmp.requestDelete(target);
    await cmp.confirmDelete();

    expect(inv.delete).toHaveBeenCalledWith(target.Id);
    expect(cmp.confirmTarget()).toBeNull();
    expect(toast.toasts()[0].type).toBe('success');
  });

  it('upload success fires a success toast and closes the form', async () => {
    const master = makeMasterStubs();
    const inv = makeInvoiceStubs();
    const fixture = render(master, inv);
    const cmp = instance(fixture);
    const toast = TestBed.inject(ToastService);

    cmp.formOpen.set(true);
    cmp.file = new File(['x'], 'invoice.pdf', { type: 'application/pdf' });
    cmp.formData = {
      fuelVendor: 'OMV',
      invoiceDate: '2026-02-14',
      quantityLiters: 30,
      unitPrice: 2.95,
      totalAmount: 88.5,
      currency: 'EUR',
    };
    await cmp.submit();

    expect(cmp.formOpen()).toBe(false);
    expect(toast.toasts()[0].type).toBe('success');
  });

  it('edit success fires a success toast and closes the form', async () => {
    const master = makeMasterStubs();
    const inv = makeInvoiceStubs(makeInvoices());
    const fixture = render(master, inv);
    const cmp = instance(fixture);
    const toast = TestBed.inject(ToastService);

    cmp.startEdit(makeInvoices()[0]);
    await cmp.submit();

    expect(cmp.formOpen()).toBe(false);
    expect(toast.toasts()[0].type).toBe('success');
  });

  // ── T7.4: layered error handling ─────────────────────────────────────────

  it('fieldErrors() reports missing file, date, and numeric fields on an empty add form', () => {
    const master = makeMasterStubs();
    const inv = makeInvoiceStubs();
    const fixture = render(master, inv);
    const cmp = instance(fixture);
    cmp.formOpen.set(true);
    // editingId is null → add mode, file is null
    const errors = cmp.fieldErrors();
    expect(errors['file']).toBeTruthy();
    expect(errors['fuelVendor']).toBeTruthy();
    expect(errors['invoiceDate']).toBeTruthy();
    expect(errors['quantityLiters']).toBeTruthy();
    expect(errors['unitPrice']).toBeTruthy();
    expect(errors['totalAmount']).toBeTruthy();
  });

  it('fieldErrors() clears when all required fields are filled', () => {
    const master = makeMasterStubs();
    const inv = makeInvoiceStubs();
    const fixture = render(master, inv);
    const cmp = instance(fixture);
    cmp.file = new File(['x'], 'i.pdf');
    cmp.formData = {
      fuelVendor: 'OMV',
      invoiceDate: '2026-01-10',
      quantityLiters: 40,
      unitPrice: 1.5,
      totalAmount: 60,
      currency: 'EUR',
    };
    expect(Object.keys(cmp.fieldErrors())).toHaveLength(0);
  });

  it('submit() with validation errors sets submitted=true and does not call upload', async () => {
    const master = makeMasterStubs();
    const inv = makeInvoiceStubs();
    const fixture = render(master, inv);
    const cmp = instance(fixture);
    // leave form empty (file=null, no date, etc.)
    await cmp.submit();
    expect(cmp.submitted()).toBe(true);
    expect(inv.upload).not.toHaveBeenCalled();
  });

  it('upload service error fires an error toast (no raw dump in the form)', async () => {
    const master = makeMasterStubs();
    const inv = makeInvoiceStubs();
    inv.upload.mockRejectedValueOnce(new Error('Drive quota exceeded'));
    const fixture = render(master, inv);
    const cmp = instance(fixture);
    const toast = TestBed.inject(ToastService);

    cmp.file = new File(['x'], 'i.pdf');
    cmp.formData = {
      fuelVendor: 'OMV',
      invoiceDate: '2026-01-10',
      quantityLiters: 40,
      unitPrice: 1.5,
      totalAmount: 60,
      currency: 'EUR',
    };
    await cmp.submit();

    expect(toast.toasts()[0].type).toBe('error');
    expect(toast.toasts()[0].message).toContain('Drive quota exceeded');
    // localError stays null — no raw dump in the form
    expect(cmp.localError()).toBeNull();
  });

  it('shows a master-data load error and no form controls when master data fails', () => {
    const master = makeMasterStubs({ company: null, vehicle: null });
    master.error.set(new Error('master boom'));
    const inv = makeInvoiceStubs();
    const fixture = render(master, inv);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Could not load master data');
    expect(text).toContain('master boom');
    // Neither the add button nor the list is rendered in the error state
    expect(text).not.toContain('Add invoice');
  });
});
