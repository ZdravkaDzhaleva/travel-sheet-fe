import { Injectable, inject } from '@angular/core';

import { workingDaysInMonth } from '../domain/calendar/working-day-calendar';
import {
  HolidayProvider,
  type HolidaySource,
} from '../infrastructure/holiday.provider';

export interface WorkingDaysResult {
  readonly workingDays: readonly Date[];
  readonly source: HolidaySource;
  readonly warnings: readonly string[];
}

@Injectable({ providedIn: 'root' })
export class CalendarService {
  private readonly provider = inject(HolidayProvider);

  /**
   * Returns the Mon–Fri working days for the given month, excluding the
   * holidays resolved via HolidayProvider. Passes through `source` and
   * `warnings` so the UI can surface fallback or cross-check messages.
   */
  async workingDaysFor(year: number, month: number): Promise<WorkingDaysResult> {
    const r = await this.provider.getHolidays(year);
    const workingDays = workingDaysInMonth(year, month, [...r.dates]);
    return { workingDays, source: r.source, warnings: r.warnings };
  }
}
