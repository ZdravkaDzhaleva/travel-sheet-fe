import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal, type Signal } from '@angular/core';

import { GenerateComponent } from './generate.component';
import {
  GenerateMonthService,
  type GenerateMonthResult,
} from '../../application/generate-month.service';
import { InfeasibleMonthError } from '../../domain/generation/infeasible-month.error';

interface Stubs {
  readonly loading: ReturnType<typeof signal<boolean>>;
  readonly error: ReturnType<typeof signal<Error | null>>;
  readonly result: ReturnType<typeof signal<GenerateMonthResult | null>>;
  readonly generateMonth: ReturnType<typeof vi.fn>;
  readonly service: GenerateMonthService;
}

function makeStubs(): Stubs {
  const loading = signal<boolean>(false);
  const error = signal<Error | null>(null);
  const result = signal<GenerateMonthResult | null>(null);
  const generateMonth = vi.fn(async (year: number, month: number) => {
    const r: GenerateMonthResult = {
      year,
      month,
      sheetName: `м_${String(month).padStart(2, '0')}`,
      openingBalance: 5,
      openingSource: 'vehicleConfig',
      closingBalance: 4.25,
      rowCount: 21,
      holidaySource: 'api',
      warnings: [],
    };
    result.set(r);
    return r;
  });
  const service = {
    loading: loading.asReadonly() as Signal<boolean>,
    error: error.asReadonly() as Signal<Error | null>,
    result: result.asReadonly() as Signal<GenerateMonthResult | null>,
    generateMonth,
  } as unknown as GenerateMonthService;
  return { loading, error, result, generateMonth, service };
}

function render(stubs: Stubs): ComponentFixture<GenerateComponent> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [GenerateComponent],
    providers: [
      provideRouter([]),
      { provide: GenerateMonthService, useValue: stubs.service },
    ],
  });
  const fixture = TestBed.createComponent(GenerateComponent);
  fixture.detectChanges();
  return fixture;
}

interface InternalGenerate {
  year: number;
  month: number;
  generate(): Promise<void>;
}

function instance(fixture: ComponentFixture<GenerateComponent>): InternalGenerate {
  return fixture.componentInstance as unknown as InternalGenerate;
}

describe('GenerateComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('initializes year and month to the current calendar period', () => {
    const stubs = makeStubs();
    const fixture = render(stubs);
    const cmp = instance(fixture);
    const now = new Date();
    expect(cmp.year).toBe(now.getFullYear());
    expect(cmp.month).toBe(now.getMonth() + 1);
  });

  it('calls GenerateMonthService.generateMonth with the selected year/month on submit', async () => {
    const stubs = makeStubs();
    const fixture = render(stubs);
    const cmp = instance(fixture);
    cmp.year = 2026;
    cmp.month = 3;
    await cmp.generate();
    expect(stubs.generateMonth).toHaveBeenCalledWith(2026, 3);
  });

  it('renders the success result with sheetName, period, balances, opening source, and holiday source', async () => {
    const stubs = makeStubs();
    const fixture = render(stubs);
    const cmp = instance(fixture);
    cmp.year = 2026;
    cmp.month = 1;
    await cmp.generate();
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('м_01');
    expect(text).toContain('1/2026');
    expect(text).toContain('21'); // rowCount
    expect(text).toContain('5');  // openingBalance
    expect(text).toContain('4.25'); // closingBalance
    expect(text).toContain('Seeded from the active vehicle configuration');
    expect(text).toContain('Nager.Date API');
  });

  it('labels opening source as carry-forward when prior sheet was used', async () => {
    const stubs = makeStubs();
    stubs.generateMonth.mockImplementationOnce(async (year: number, month: number) => {
      const r: GenerateMonthResult = {
        year, month,
        sheetName: 'м_02',
        openingBalance: 4.25,
        openingSource: 'priorSheet',
        closingBalance: 3,
        rowCount: 20,
        holidaySource: 'api',
        warnings: [],
      };
      stubs.result.set(r);
      return r;
    });
    const fixture = render(stubs);
    const cmp = instance(fixture);
    cmp.year = 2026;
    cmp.month = 2;
    await cmp.generate();
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Carried forward from the previous month');
  });

  it('renders warnings emitted by the service', async () => {
    const stubs = makeStubs();
    stubs.generateMonth.mockImplementationOnce(async (year: number, month: number) => {
      const r: GenerateMonthResult = {
        year, month,
        sheetName: 'м_01',
        openingBalance: 5, openingSource: 'vehicleConfig',
        closingBalance: 4, rowCount: 21,
        holidaySource: 'override',
        warnings: [
          'Falling back to supporting-sheet override: Holiday API responded 500',
          'Holiday cross-check mismatch: 1 missing, 0 extra (got 13, expected 14)',
        ],
      };
      stubs.result.set(r);
      return r;
    });
    const fixture = render(stubs);
    await instance(fixture).generate();
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Warnings');
    expect(text).toContain('Falling back to supporting-sheet override');
    expect(text).toContain('cross-check mismatch');
    expect(text).toContain('Supporting-sheet override');
  });

  it('renders an Infeasible-month specific error when the service throws InfeasibleMonthError', async () => {
    const stubs = makeStubs();
    const err = new InfeasibleMonthError('Over-fueled month: must burn at least 4348.00 km');
    stubs.generateMonth.mockImplementationOnce(async () => {
      stubs.error.set(err);
      throw err;
    });
    const fixture = render(stubs);
    await instance(fixture).generate();
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Infeasible month');
    expect(text).toContain("can't land in the allowed window");
    expect(text).toContain('Over-fueled month');
  });

  it('renders a generic error block when the service throws something other than InfeasibleMonthError', async () => {
    const stubs = makeStubs();
    const err = new Error('boom');
    stubs.generateMonth.mockImplementationOnce(async () => {
      stubs.error.set(err);
      throw err;
    });
    const fixture = render(stubs);
    await instance(fixture).generate();
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Generation failed');
    expect(text).toContain('boom');
    expect(text).not.toContain('Infeasible month');
  });

  it('disables the Generate button while a request is in flight', () => {
    const stubs = makeStubs();
    stubs.loading.set(true);
    const fixture = render(stubs);
    const button = (fixture.nativeElement as HTMLElement).querySelector(
      'button[type="submit"]',
    ) as HTMLButtonElement | null;
    expect(button?.disabled).toBe(true);
    expect(button?.textContent).toContain('Generating');
  });

  it('does not re-fire generateMonth when clicked again during loading', async () => {
    const stubs = makeStubs();
    stubs.loading.set(true);
    const fixture = render(stubs);
    await instance(fixture).generate();
    expect(stubs.generateMonth).not.toHaveBeenCalled();
  });
});
