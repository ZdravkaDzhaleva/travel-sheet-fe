import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal, type Signal, type WritableSignal } from '@angular/core';

import { GenerateComponent } from './generate.component';
import {
  GenerateMonthService,
  type GenerateMonthResult,
} from '../../application/generate-month.service';
import { ToastService } from '../../shared/ui/toast/toast.service';
import { InfeasibleMonthError } from '../../domain/generation/infeasible-month.error';

interface Stubs {
  readonly loading: ReturnType<typeof signal<boolean>>;
  readonly error: ReturnType<typeof signal<Error | null>>;
  readonly result: ReturnType<typeof signal<GenerateMonthResult | null>>;
  readonly generateMonth: ReturnType<typeof vi.fn>;
  readonly monthExists: ReturnType<typeof vi.fn>;
  readonly clearError: ReturnType<typeof vi.fn>;
  readonly clearResult: ReturnType<typeof vi.fn>;
  readonly service: GenerateMonthService;
}

function makeResult(year: number, month: number, over: Partial<GenerateMonthResult> = {}): GenerateMonthResult {
  return {
    year,
    month,
    sheetName: `м_${String(month).padStart(2, '0')}`,
    openingBalance: 5,
    openingSource: 'vehicleConfig',
    closingBalance: 4.25,
    rowCount: 21,
    holidaySource: 'api',
    warnings: [],
    workbookId: 'wb-1',
    sheetId: 123,
    ...over,
  };
}

function makeStubs(monthExistsValue = false): Stubs {
  const loading = signal<boolean>(false);
  const error = signal<Error | null>(null);
  const result = signal<GenerateMonthResult | null>(null);
  const generateMonth = vi.fn(async (year: number, month: number) => {
    const r = makeResult(year, month);
    result.set(r);
    return r;
  });
  const monthExists = vi.fn(async () => monthExistsValue);
  const clearError = vi.fn(() => error.set(null));
  const clearResult = vi.fn(() => result.set(null));
  const service = {
    loading: loading.asReadonly() as Signal<boolean>,
    error: error.asReadonly() as Signal<Error | null>,
    result: result.asReadonly() as Signal<GenerateMonthResult | null>,
    generateMonth,
    monthExists,
    clearError,
    clearResult,
  } as unknown as GenerateMonthService;
  return { loading, error, result, generateMonth, monthExists, clearError, clearResult, service };
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

/** Let the async existence check (effect / refreshExists) settle. */
function flush(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve));
}

interface PeriodModel {
  year: number;
  month: string;
}

interface InternalGenerate {
  model: WritableSignal<PeriodModel>;
  generate(): Promise<void>;
  onPeriodChange(): void;
}

function instance(fixture: ComponentFixture<GenerateComponent>): InternalGenerate {
  return fixture.componentInstance as unknown as InternalGenerate;
}

/** Set the selected period and let the period-change effect settle. */
function setPeriod(fixture: ComponentFixture<GenerateComponent>, year: number, month: number): Promise<void> {
  instance(fixture).model.set({ year, month: String(month) });
  fixture.detectChanges();
  return flush();
}

describe('GenerateComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('initializes year and month to the current calendar period', () => {
    const fixture = render(makeStubs());
    const cmp = instance(fixture);
    const now = new Date();
    expect(cmp.model().year).toBe(now.getFullYear());
    expect(Number(cmp.model().month)).toBe(now.getMonth() + 1);
  });

  it('calls GenerateMonthService.generateMonth with the selected year/month on submit', async () => {
    const stubs = makeStubs();
    const fixture = render(stubs);
    await setPeriod(fixture, 2026, 3);
    await instance(fixture).generate();
    expect(stubs.generateMonth).toHaveBeenCalledWith(2026, 3);
  });

  it('renders a slim success card (period, sheet, rows) + an Open-workbook deep link', async () => {
    const stubs = makeStubs();
    const fixture = render(stubs);
    await setPeriod(fixture, 2026, 1);
    await instance(fixture).generate();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const text = el.textContent ?? '';
    expect(text).toContain('January 2026 generated'); // friendly period heading
    expect(text).toContain('м_01');                    // sheet
    expect(text).toContain('21');                      // working-day rows
    const link = el.querySelector<HTMLAnchorElement>('a.result__open');
    expect(link?.getAttribute('href')).toBe('https://docs.google.com/spreadsheets/d/wb-1/edit#gid=123');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noopener');
  });

  it('keeps developer fields behind a collapsed "Technical details" disclosure', async () => {
    const stubs = makeStubs();
    const fixture = render(stubs);
    await setPeriod(fixture, 2026, 1);
    await instance(fixture).generate();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const details = el.querySelector<HTMLDetailsElement>('details.tech');
    expect(details).not.toBeNull();
    expect(details?.open).toBe(false); // collapsed by default
    expect(details?.textContent).toContain('Seeded from the active vehicle configuration');
    expect(details?.textContent).toContain('Closing balance');
    expect(details?.textContent).toContain('Nager.Date API');
  });

  it('fires an auto-dismissing success toast with an Open-workbook action', async () => {
    const stubs = makeStubs();
    const fixture = render(stubs);
    await setPeriod(fixture, 2026, 1);
    await instance(fixture).generate();
    const toasts = TestBed.inject(ToastService).toasts();
    expect(toasts.length).toBe(1);
    expect(toasts[0].type).toBe('success');
    expect(toasts[0].message).toContain('January 2026 generated');
    expect(toasts[0].action?.label).toBe('Open workbook');
  });

  it('labels opening source as carry-forward when prior sheet was used', async () => {
    const stubs = makeStubs();
    stubs.generateMonth.mockImplementationOnce(async (year: number, month: number) => {
      const r = makeResult(year, month, { sheetName: 'м_02', openingBalance: 4.25, openingSource: 'priorSheet', closingBalance: 3, rowCount: 20 });
      stubs.result.set(r);
      return r;
    });
    const fixture = render(stubs);
    await setPeriod(fixture, 2026, 2);
    await instance(fixture).generate();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Carried forward from the previous month');
  });

  it('renders warnings emitted by the service', async () => {
    const stubs = makeStubs();
    stubs.generateMonth.mockImplementationOnce(async (year: number, month: number) => {
      const r = makeResult(year, month, {
        sheetName: 'м_01', closingBalance: 4, holidaySource: 'override',
        warnings: [
          'Falling back to supporting-sheet override: Holiday API responded 500',
          'Holiday cross-check mismatch: 1 missing, 0 extra (got 13, expected 14)',
        ],
      });
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
  });

  it('renders an Infeasible-month specific error (light surface) when the service throws InfeasibleMonthError', async () => {
    const stubs = makeStubs();
    const err = new InfeasibleMonthError('Over-fueled month: must burn at least 4348.00 km');
    stubs.generateMonth.mockImplementationOnce(async () => {
      stubs.error.set(err);
      throw err;
    });
    const fixture = render(stubs);
    await instance(fixture).generate();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const errorCard = el.querySelector('.card--error');
    expect(errorCard).not.toBeNull(); // light .card surface + danger rail (T7.10)
    const text = errorCard?.textContent ?? '';
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

  // ── T7.12: already-generated guard ────────────────────────────────────────

  it('blocks regeneration when the selected month already exists', async () => {
    const stubs = makeStubs(true); // monthExists() → true
    const fixture = render(stubs);
    await flush();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.notice')).not.toBeNull();
    expect(el.querySelector('.notice')?.textContent).toContain('already generated');
    const btn = el.querySelector<HTMLButtonElement>('button[type="submit"]');
    expect(btn?.disabled).toBe(true);
  });

  it('does not block (button enabled, no notice) when the month does not exist', async () => {
    const stubs = makeStubs(false);
    const fixture = render(stubs);
    await flush();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.notice')).toBeNull();
    const btn = el.querySelector<HTMLButtonElement>('button[type="submit"]');
    expect(btn?.disabled).toBe(false);
  });

  it('re-checks existence when the period changes', async () => {
    const stubs = makeStubs(false);
    const fixture = render(stubs);
    await flush();
    stubs.monthExists.mockClear();
    await setPeriod(fixture, 2026, 5);
    expect(stubs.monthExists).toHaveBeenCalledWith(5);
  });

  it('clears a prior error when the period changes', async () => {
    const stubs = makeStubs();
    stubs.error.set(new Error('boom'));
    const fixture = render(stubs);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.card--error')).not.toBeNull();
    instance(fixture).onPeriodChange();
    fixture.detectChanges();
    expect(stubs.clearError).toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).querySelector('.card--error')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('.card--success')).toBeNull();
  });

  it('clears the error and the success result when the page is left (ngOnDestroy)', () => {
    const stubs = makeStubs();
    stubs.error.set(new Error('boom'));
    stubs.result.set(makeResult(2026, 1));
    const fixture = render(stubs);
    fixture.destroy();
    expect(stubs.clearError).toHaveBeenCalled();
    expect(stubs.clearResult).toHaveBeenCalled();
  });

  it('does not generate when the month already exists (guard short-circuits)', async () => {
    const stubs = makeStubs(true);
    const fixture = render(stubs);
    await flush();
    await instance(fixture).generate();
    expect(stubs.generateMonth).not.toHaveBeenCalled();
  });
});
