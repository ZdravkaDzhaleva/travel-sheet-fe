import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal, type Signal } from '@angular/core';

import { CompanyInfoComponent } from './company-info.component';
import { MasterDataService } from '../../application/master-data.service';
import { SheetsStore } from '../../infrastructure/sheets.store';
import { NoActiveVehicleError } from '../../application/master-data.errors';
import { makeCompany, makeVehicle } from '../../../test-fixtures/index';
import type { Company, Vehicle } from '../../domain/entities/index';

const SHEET_ID = 'supporting-sheet-id-123';

interface Stubs {
  readonly company: ReturnType<typeof signal<Company | null>>;
  readonly vehicle: ReturnType<typeof signal<Vehicle | null>>;
  readonly loading: ReturnType<typeof signal<boolean>>;
  readonly error: ReturnType<typeof signal<Error | null>>;
  readonly load: ReturnType<typeof vi.fn>;
  readonly service: MasterDataService;
  readonly resolveSupportingSheetId: ReturnType<typeof vi.fn>;
  readonly sheets: SheetsStore;
}

function makeStubs(initial: {
  company?: Company | null;
  vehicle?: Vehicle | null;
  loading?: boolean;
  error?: Error | null;
  sheetId?: string;
} = {}): Stubs {
  const company = signal<Company | null>(initial.company ?? null);
  const vehicle = signal<Vehicle | null>(initial.vehicle ?? null);
  const loading = signal<boolean>(initial.loading ?? false);
  const error = signal<Error | null>(initial.error ?? null);
  const load = vi.fn(async () => undefined);

  const service = {
    company: company.asReadonly() as Signal<Company | null>,
    vehicle: vehicle.asReadonly() as Signal<Vehicle | null>,
    loading: loading.asReadonly() as Signal<boolean>,
    error: error.asReadonly() as Signal<Error | null>,
    ready: () => company() !== null && vehicle() !== null,
    load,
  } as unknown as MasterDataService;

  const resolveSupportingSheetId = vi.fn(async () => initial.sheetId ?? SHEET_ID);
  const sheets = { resolveSupportingSheetId } as unknown as SheetsStore;

  return { company, vehicle, loading, error, load, service, resolveSupportingSheetId, sheets };
}

function render(stubs: Stubs): {
  el: HTMLElement;
  detect: () => void;
} {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [CompanyInfoComponent],
    providers: [
      provideRouter([]),
      { provide: MasterDataService, useValue: stubs.service },
      { provide: SheetsStore, useValue: stubs.sheets },
    ],
  });
  const fixture = TestBed.createComponent(CompanyInfoComponent);
  fixture.detectChanges();
  return {
    el: fixture.nativeElement as HTMLElement,
    detect: () => fixture.detectChanges(),
  };
}

describe('CompanyInfoComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('triggers MasterDataService.load() on init when data is not ready and no load is in flight', () => {
    const stubs = makeStubs();
    render(stubs);
    expect(stubs.load).toHaveBeenCalledOnce();
  });

  it('does not trigger load when data is already populated', () => {
    const stubs = makeStubs({ company: makeCompany(), vehicle: makeVehicle() });
    render(stubs);
    expect(stubs.load).not.toHaveBeenCalled();
  });

  it('does not trigger load while another load is already in flight', () => {
    const stubs = makeStubs({ loading: true });
    render(stubs);
    expect(stubs.load).not.toHaveBeenCalled();
  });

  it('renders the loading state when MasterDataService.loading() is true', () => {
    const stubs = makeStubs({ loading: true });
    const { el } = render(stubs);
    expect(el.querySelector('[role="status"]')?.textContent).toContain('Loading');
  });

  it('renders the error state when MasterDataService.error() is set', () => {
    const stubs = makeStubs({ error: new NoActiveVehicleError() });
    const { el } = render(stubs);
    const alert = el.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toContain('No active Vehicle found');
  });

  it('renders the company and vehicle fields when both signals are populated', () => {
    const company = makeCompany();
    const vehicle = makeVehicle();
    const stubs = makeStubs({ company, vehicle });
    const { el } = render(stubs);
    const text = el.textContent ?? '';
    expect(text).toContain(company.Name);
    expect(text).toContain(company.Eik);
    expect(text).toContain(company.Address);
    expect(text).toContain(String(company.ReportingYear));
    expect(text).toContain(vehicle.RegistrationNumber);
    expect(text).toContain(vehicle.FuelType);
    expect(text).toContain(vehicle.SeatCount);
    // Values and their unit suffixes render in adjacent num/unit spans.
    expect(text).toContain(String(vehicle.AverageConsumptionLitersPer100Km));
    expect(text).toContain('L / 100 km');
    expect(text).toContain(String(vehicle.TankCapacityLiters));
    expect(text).toContain(String(vehicle.OpeningFuelBalance));
    const units = Array.from(el.querySelectorAll('.unit')).map(u => u.textContent?.trim());
    expect(units).toContain('L');
    expect(units).toContain('L / 100 km');
  });

  it('renders a Read-only pill and the read-only subtitle', () => {
    const stubs = makeStubs({ company: makeCompany(), vehicle: makeVehicle() });
    const { el } = render(stubs);
    expect(el.querySelector('.pill')?.textContent).toContain('Read-only');
    expect(el.textContent).toContain('sourced from the supporting spreadsheet');
  });

  it('builds the "Open supporting sheet" link from the resolved id (new tab, noopener)', async () => {
    const stubs = makeStubs({ company: makeCompany(), vehicle: makeVehicle() });
    const { el, detect } = render(stubs);
    // resolveSupportingSheetId() resolves on a microtask; flush then re-render.
    await new Promise(resolve => setTimeout(resolve));
    detect();
    const link = Array.from(el.querySelectorAll('a')).find(a =>
      a.textContent?.includes('Open supporting sheet'),
    );
    expect(stubs.resolveSupportingSheetId).toHaveBeenCalledOnce();
    expect(link?.getAttribute('href')).toBe(
      `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`,
    );
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noopener');
  });

  it('leaves the outward link without an href until the id resolves', () => {
    const stubs = makeStubs({ company: makeCompany(), vehicle: makeVehicle() });
    const { el } = render(stubs);
    const link = Array.from(el.querySelectorAll('a')).find(a =>
      a.textContent?.includes('Open supporting sheet'),
    );
    expect(link).toBeTruthy();
    expect(link?.hasAttribute('href')).toBe(false);
  });

  it('exposes no edit controls — only links, no form inputs, textareas, or non-link buttons', () => {
    const stubs = makeStubs({ company: makeCompany(), vehicle: makeVehicle() });
    const { el } = render(stubs);
    expect(el.querySelectorAll('input').length).toBe(0);
    expect(el.querySelectorAll('textarea').length).toBe(0);
    expect(el.querySelectorAll('select').length).toBe(0);
    expect(el.querySelectorAll('button').length).toBe(0);
    expect(el.querySelectorAll('[contenteditable="true"]').length).toBe(0);
  });

  it('uses interpolation only — no [innerHTML] bindings are present in the template', () => {
    const stubs = makeStubs({
      company: makeCompany({ Name: '<script>alert(1)</script>' }),
      vehicle: makeVehicle(),
    });
    const { el } = render(stubs);
    // Angular interpolation escapes; the literal angle brackets are present, no script element is created.
    expect(el.querySelector('script')).toBeNull();
    expect(el.textContent).toContain('<script>alert(1)</script>');
  });
});
