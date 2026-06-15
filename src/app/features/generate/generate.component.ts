import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

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

@Component({
  selector: 'app-generate',
  imports: [FormsModule],
  templateUrl: './generate.component.html',
  styleUrl: './generate.component.scss',
})
export class GenerateComponent implements OnInit, OnDestroy {
  private readonly service = inject(GenerateMonthService);
  private readonly toast = inject(ToastService);

  protected readonly loading = this.service.loading;
  protected readonly error = this.service.error;
  protected readonly result = this.service.result;
  protected readonly months = MONTHS;

  /** Already-generated guard: true when the selected month's tab exists. */
  protected readonly monthExists = signal(false);
  protected readonly checkingExists = signal(false);
  /** Increments per period change so a stale in-flight check can't win. */
  private existsCheckToken = 0;

  protected year: number;
  protected month: number;

  constructor() {
    const now = new Date();
    this.year = now.getFullYear();
    this.month = now.getMonth() + 1;
  }

  ngOnInit(): void {
    void this.refreshExists();
  }

  ngOnDestroy(): void {
    // Don't carry stale feedback (error or success result) onto the next visit.
    this.service.clearError();
    this.service.clearResult();
  }

  protected onPeriodChange(): void {
    // A prior failure no longer applies to the newly selected period.
    this.service.clearError();
    this.service.clearResult();
    void this.refreshExists();
  }

  private async refreshExists(): Promise<void> {
    const token = ++this.existsCheckToken;
    this.checkingExists.set(true);
    try {
      const exists = await this.service.monthExists(this.month);
      if (token === this.existsCheckToken) this.monthExists.set(exists);
    } catch {
      // Can't determine (e.g. not signed in yet) — don't block; generation will
      // surface its own error if there's a real problem.
      if (token === this.existsCheckToken) this.monthExists.set(false);
    } finally {
      if (token === this.existsCheckToken) this.checkingExists.set(false);
    }
  }

  protected async generate(): Promise<void> {
    if (this.loading() || this.monthExists()) return;
    try {
      const r = await this.service.generateMonth(this.year, this.month);
      this.toast.show(`${this.monthName(r.month)} ${r.year} generated`, 'success', {
        label: 'Open workbook',
        fn: () => this.openWorkbook(r),
      });
      this.monthExists.set(true); // the tab now exists → block re-generation
    } catch {
      // Surfaced via service.error signal.
    }
  }

  /** Whether the current result is for the period currently selected in the form. */
  protected resultMatchesSelection(): boolean {
    const r = this.result();
    return r !== null && r.year === this.year && r.month === this.month;
  }

  protected monthName(month: number): string {
    return MONTHS[month - 1]?.label ?? String(month);
  }

  /** Workbook tab name for the selected month (e.g. "м_01"). */
  protected tabName(): string {
    return monthSheetName(this.month);
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
