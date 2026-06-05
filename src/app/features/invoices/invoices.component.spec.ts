import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal, type Signal } from '@angular/core';

import { InvoicesComponent } from './invoices.component';
import { InvoiceService } from '../../application/invoice.service';
import { MasterDataService } from '../../application/master-data.service';
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
  openAddForm(): void;
  startEdit(invoice: Invoice): void;
  openEditForm(invoice: Invoice): void;
  cancelEdit(): void;
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
  formOpen: () => boolean;
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
    expect(cmp.localError()).toContain('file');
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
    expect(cmp.localError()).toContain('date');
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

  it('deleteInvoice confirms via window.confirm before calling InvoiceService.delete', async () => {
    const master = makeMasterStubs();
    const inv = makeInvoiceStubs(makeInvoices());
    const fixture = render(master, inv);
    const cmp = instance(fixture);
    const confirmSpy = vi.spyOn(window, 'confirm');

    confirmSpy.mockReturnValueOnce(false);
    await cmp.deleteInvoice(makeInvoices()[0]);
    expect(inv.delete).not.toHaveBeenCalled();

    confirmSpy.mockReturnValueOnce(true);
    await cmp.deleteInvoice(makeInvoices()[0]);
    expect(inv.delete).toHaveBeenCalledWith(makeInvoices()[0].Id);

    confirmSpy.mockRestore();
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
