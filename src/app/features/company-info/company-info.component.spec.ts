import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal, type Signal } from '@angular/core';

import { CompanyInfoComponent } from './company-info.component';
import { MasterDataService } from '../../application/master-data.service';
import { SheetsStore } from '../../infrastructure/sheets.store';
import { ToastService } from '../../shared/ui/toast/toast.service';
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
  readonly ensureLoaded: ReturnType<typeof vi.fn>;
  readonly service: MasterDataService;
  readonly resolveSupportingSheetId: ReturnType<typeof vi.fn>;
  readonly sheets: SheetsStore;
  readonly toastShow: ReturnType<typeof vi.fn>;
  readonly toast: ToastService;
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
  const ensureLoaded = vi.fn(async () => undefined);

  const service = {
    company: company.asReadonly() as Signal<Company | null>,
    vehicle: vehicle.asReadonly() as Signal<Vehicle | null>,
    loading: loading.asReadonly() as Signal<boolean>,
    error: error.asReadonly() as Signal<Error | null>,
    ready: () => company() !== null && vehicle() !== null,
    load,
    ensureLoaded,
  } as unknown as MasterDataService;

  const resolveSupportingSheetId = vi.fn(async () => initial.sheetId ?? SHEET_ID);
  const sheets = { resolveSupportingSheetId } as unknown as SheetsStore;

  const toastShow = vi.fn();
  const toast = { show: toastShow } as unknown as ToastService;

  return {
    company, vehicle, loading, error, load, ensureLoaded, service,
    resolveSupportingSheetId, sheets, toastShow, toast,
  };
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
      { provide: ToastService, useValue: stubs.toast },
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

  it('delegates first-load to MasterDataService.ensureLoaded() on init', () => {
    const stubs = makeStubs();
    render(stubs);
    expect(stubs.ensureLoaded).toHaveBeenCalledOnce();
    expect(stubs.load).not.toHaveBeenCalled();
  });

  it('renders skeleton cards (not plain text) while loading', () => {
    const stubs = makeStubs({ loading: true });
    const { el } = render(stubs);
    // Accessible status for screen readers...
    expect(el.querySelector('[role="status"]')?.textContent).toContain('Loading');
    // ...and visible shimmer placeholders rather than a "Loading…" paragraph.
    expect(el.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
    expect(el.querySelectorAll('.sk-bar').length).toBeGreaterThan(0);
    // The error/Retry view is mutually exclusive with loading, so a retry in
    // flight cannot be re-fired — the skeleton replaces the Retry button.
    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(
      Array.from(el.querySelectorAll('button')).some(b => b.textContent?.includes('Retry')),
    ).toBe(false);
  });

  it('renders a branded error alert with a Retry button when error() is set', () => {
    const stubs = makeStubs({ error: new NoActiveVehicleError() });
    const { el } = render(stubs);
    const alert = el.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toContain('No active Vehicle found');
    const retry = Array.from(el.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Retry'),
    );
    expect(retry).toBeTruthy();
  });

  it('Retry re-invokes the master-data load, forcing the consent prompt', () => {
    const stubs = makeStubs({ error: new NoActiveVehicleError() });
    const { el } = render(stubs);
    const retry = Array.from(el.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Retry'),
    ) as HTMLButtonElement;
    expect(retry.tagName).toBe('BUTTON'); // a real button, not an <a> (the a.btn:not([href]) rule must not reach it)
    expect(retry.disabled).toBe(false); // never rendered in a disabled state
    stubs.load.mockClear();
    retry.click();
    expect(stubs.load).toHaveBeenCalledOnce();
    expect(stubs.load).toHaveBeenCalledWith({ forceConsent: true });
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

  it('exposes no edit/input controls (T5.2: Retry + outward link are non-mutating)', () => {
    // Relaxed from "zero buttons": a non-data state may surface a Retry button and
    // the outward link, but nothing that edits master data.
    const stubs = makeStubs({ company: makeCompany(), vehicle: makeVehicle() });
    const { el } = render(stubs);
    expect(el.querySelectorAll('input').length).toBe(0);
    expect(el.querySelectorAll('textarea').length).toBe(0);
    expect(el.querySelectorAll('select').length).toBe(0);
    expect(el.querySelectorAll('[contenteditable="true"]').length).toBe(0);
    // The success view carries no buttons at all (Retry only appears on error).
    expect(el.querySelectorAll('button').length).toBe(0);
  });

  it('error state surfaces only the non-mutating Retry button — no edit/input controls', () => {
    const stubs = makeStubs({ error: new NoActiveVehicleError() });
    const { el } = render(stubs);
    expect(el.querySelectorAll('input').length).toBe(0);
    expect(el.querySelectorAll('textarea').length).toBe(0);
    expect(el.querySelectorAll('select').length).toBe(0);
    expect(el.querySelectorAll('[contenteditable="true"]').length).toBe(0);
    const buttons = Array.from(el.querySelectorAll('button'));
    expect(buttons.length).toBe(1);
    expect(buttons[0].textContent).toContain('Retry');
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
