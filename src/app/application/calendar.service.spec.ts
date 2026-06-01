import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';

import { CalendarService } from './calendar.service';
import {
  HolidayProvider,
  type HolidayFetchResult,
} from '../infrastructure/holiday.provider';
import { make2026HolidayDates } from '../../test-fixtures/index';

function makeProvider(result: HolidayFetchResult): HolidayProvider {
  return {
    getHolidays: vi.fn(async () => result),
  } as unknown as HolidayProvider;
}

function makeService(provider: HolidayProvider): CalendarService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: HolidayProvider, useValue: provider }],
  });
  return TestBed.inject(CalendarService);
}

describe('CalendarService.workingDaysFor', () => {
  it('returns 21 working days for January 2026 (22 weekdays minus Jan 1 holiday)', async () => {
    const svc = makeService(makeProvider({
      dates: make2026HolidayDates(),
      source: 'api',
      warnings: [],
    }));
    const r = await svc.workingDaysFor(2026, 1);
    expect(r.workingDays).toHaveLength(21);
    expect(r.workingDays.every(d => d.getMonth() === 0 && d.getFullYear() === 2026)).toBe(true);
    expect(r.source).toBe('api');
    expect(r.warnings).toEqual([]);
  });

  it('returns 20 working days for February 2026 (no holidays land on Mon–Fri in Feb)', async () => {
    const svc = makeService(makeProvider({
      dates: make2026HolidayDates(),
      source: 'api',
      warnings: [],
    }));
    const r = await svc.workingDaysFor(2026, 2);
    expect(r.workingDays).toHaveLength(20);
  });

  it('surfaces source=override and the fallback warning', async () => {
    const svc = makeService(makeProvider({
      dates: [new Date(2026, 0, 1)],
      source: 'override',
      warnings: ['Falling back to supporting-sheet override: Holiday API responded 500'],
    }));
    const r = await svc.workingDaysFor(2026, 1);
    expect(r.source).toBe('override');
    expect(r.warnings[0]).toContain('Falling back');
  });

  it('surfaces source=none with both warnings when API and override both fail', async () => {
    const svc = makeService(makeProvider({
      dates: [],
      source: 'none',
      warnings: [
        'Falling back to supporting-sheet override: network down',
        'override sheet read failed',
      ],
    }));
    const r = await svc.workingDaysFor(2026, 1);
    expect(r.source).toBe('none');
    expect(r.warnings).toHaveLength(2);
    // No holidays applied → all weekdays count as working days (22 for Jan 2026).
    expect(r.workingDays).toHaveLength(22);
  });

  it('preserves the cross-check warning emitted by the provider', async () => {
    const svc = makeService(makeProvider({
      dates: make2026HolidayDates().slice(0, -1),
      source: 'api',
      warnings: ['Holiday cross-check mismatch: 1 missing, 0 extra (got 13, expected 14)'],
    }));
    const r = await svc.workingDaysFor(2026, 1);
    expect(r.warnings[0]).toContain('mismatch');
  });
});
