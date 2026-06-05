import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { GenerateMonthService } from '../../application/generate-month.service';
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
  standalone: true,
  imports: [FormsModule],
  templateUrl: './generate.component.html',
  styleUrl: './generate.component.scss',
})
export class GenerateComponent {
  private readonly service = inject(GenerateMonthService);

  protected readonly loading = this.service.loading;
  protected readonly error = this.service.error;
  protected readonly result = this.service.result;
  protected readonly months = MONTHS;

  protected year: number;
  protected month: number;

  constructor() {
    const now = new Date();
    this.year = now.getFullYear();
    this.month = now.getMonth() + 1;
  }

  protected async generate(): Promise<void> {
    if (this.loading()) return;
    try {
      await this.service.generateMonth(this.year, this.month);
    } catch {
      // Surfaced via service.error signal.
    }
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
