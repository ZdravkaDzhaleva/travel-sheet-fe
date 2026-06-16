import { Component, OnDestroy, computed, inject, resource, signal } from '@angular/core';
import { form, submit, min, max, FormField } from '@angular/forms/signals';

import { GenerateMonthService, type GenerateMonthResult } from '../../application/generate-month.service';
import { ToastService } from '../../shared/ui/toast/toast.service';
import { monthSheetName } from '../../core/config/workbook.template';
import { InfeasibleMonthError } from '../../domain/generation/infeasible-month.error';
import { InsufficientDataError } from '../../domain/generation/insufficient-data.error';

interface MonthOption {
  readonly value: number;
  readonly label: string;
}

const MONTHS: readonly MonthOption[] = [
  { value: 1,  label: 'January' },
  { value: 2,  label: 'February' },
  { value: 3,  label: 'March' },
  { value: 4,  label: 'April' },
  { value: 5,  label: 'May' },
  { value: 6,  label: 'June' },
  { value: 7,  label: 'July' },
  { value: 8,  label: 'August' },
  { value: 9,  label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

const YEAR_MIN = 2020;
const YEAR_MAX = 2100;

interface PeriodModel {
  year: number;
  /** Stored as a string so it binds to the native `<select>` control. */
  month: string;
}

function currentPeriod(): PeriodModel {
  const now = new Date();
  return { year: now.getFullYear(), month: String(now.getMonth() + 1) };
}

@Component({
  selector: 'app-generate',
  imports: [FormField],
  templateUrl: './generate.component.html',
  styleUrl: './generate.component.scss',
})
export class GenerateComponent implements OnDestroy {
  private readonly service = inject(GenerateMonthService);
  private readonly toast = inject(ToastService);

  protected readonly loading = this.service.loading;
  protected readonly error = this.service.error;
  protected readonly result = this.service.result;
  protected readonly months = MONTHS;

  protected readonly model = signal<PeriodModel>(currentPeriod());
  protected readonly form = form(this.model, (path) => {
    min(path.year, YEAR_MIN);
    max(path.year, YEAR_MAX);
  });

  protected readonly selectedMonth = computed(() => Number(this.model().month));

  /**
   * Already-generated guard. Modeled as a resource so the check re-runs
   * declaratively whenever the selected month changes — no effect, and the
   * resource ignores outdated in-flight loads itself (no manual stale-guard).
   */
  private readonly existsResource = resource({
    params: () => this.selectedMonth(),
    loader: ({ params: month }) => this.service.monthExists(month),
  });

  /** True when the selected month's tab exists. Falsy while loading or on error
   *  (can't determine → don't block; generation surfaces its own error). */
  protected readonly monthExists = computed(
    () => this.existsResource.hasValue() && this.existsResource.value() === true,
  );
  protected readonly checkingExists = computed(() => this.existsResource.isLoading());

  ngOnDestroy(): void {
    this.service.clearError();
    this.service.clearResult();
  }

  /** User changed the period → drop feedback that no longer applies to it. */
  protected onPeriodChange(): void {
    this.service.clearError();
    this.service.clearResult();
  }

  protected async generate(): Promise<void> {
    if (this.loading() || this.monthExists()) return;
    await submit(this.form, async () => {
      const year = this.model().year;
      const month = this.selectedMonth();
      try {
        const r = await this.service.generateMonth(year, month);
        this.toast.show(`${this.monthName(r.month)} ${r.year} generated`, 'success', {
          label: 'Open workbook',
          fn: () => this.openWorkbook(r),
        });
        this.existsResource.set(true); // the tab now exists → block re-generation
      } catch {
        // Surfaced via service.error signal.
      }
    });
  }

  /** Whether the current result is for the period currently selected in the form. */
  protected resultMatchesSelection(): boolean {
    const r = this.result();
    return r !== null && r.year === this.model().year && r.month === this.selectedMonth();
  }

  protected monthName(month: number): string {
    return MONTHS[month - 1]?.label ?? String(month);
  }

  /** Workbook tab name for the selected month (e.g. "м_01"). */
  protected tabName(): string {
    return monthSheetName(this.selectedMonth());
  }

  protected workbookUrl(r: GenerateMonthResult): string {
    const base = `https://docs.google.com/spreadsheets/d/${r.workbookId}/edit`;
    return r.sheetId != null ? `${base}#gid=${r.sheetId}` : base;
  }

  protected openWorkbook(r: GenerateMonthResult): void {
    window.open(this.workbookUrl(r), '_blank', 'noopener');
  }

  protected isInfeasible(err: Error): boolean {
    return err instanceof InfeasibleMonthError || err.name === 'InfeasibleMonthError';
  }

  protected isInsufficientData(err: Error): boolean {
    return err instanceof InsufficientDataError || err.name === 'InsufficientDataError';
  }

  protected openingSourceLabel(source: 'priorSheet' | 'vehicleConfig'): string {
    return source === 'priorSheet'
      ? 'Carried forward from the previous month'
      : 'Seeded from the active vehicle configuration';
  }

  protected holidaySourceLabel(source: 'api' | 'override' | 'none'): string {
    if (source === 'api') return 'Nager.Date API';
    if (source === 'override') return 'Supporting-sheet override (API unavailable)';
    return 'No holidays applied (both API and override failed)';
  }
}
