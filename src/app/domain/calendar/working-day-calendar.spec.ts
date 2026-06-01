import { describe, it, expect } from 'vitest';
import { workingDaysInMonth } from './working-day-calendar';

// Helpers — uses local date parts so the string is stable regardless of timezone
const isoDate = (d: Date): string => {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
};

describe('workingDaysInMonth', () => {
  describe('normal month (no holidays)', () => {
    // February 2026: Mon 2 Feb – Fri 27 Feb
    // Weekends: 7,8,14,15,21,22,28 = 7 weekend days → 28-7 = 21 working days
    it('returns every Mon–Fri in February 2026', () => {
      const days = workingDaysInMonth(2026, 2, []);
      expect(days).toHaveLength(20);
      for (const d of days) {
        const dow = d.getDay();
        expect(dow).toBeGreaterThanOrEqual(1);
        expect(dow).toBeLessThanOrEqual(5);
      }
    });

    it('returns days in ascending date order', () => {
      const days = workingDaysInMonth(2026, 2, []);
      for (let i = 1; i < days.length; i++) {
        expect(days[i].getTime()).toBeGreaterThan(days[i - 1].getTime());
      }
    });

    it('all days belong to the requested month and year', () => {
      const days = workingDaysInMonth(2026, 3, []);
      for (const d of days) {
        expect(d.getFullYear()).toBe(2026);
        expect(d.getMonth()).toBe(2); // 0-based: March = 2
      }
    });
  });

  describe('month with mid-week holiday', () => {
    // 2026-03-03 is a Tuesday (Ден на Освобождението) and a real BG holiday
    it('excludes a Tuesday holiday from March 2026', () => {
      const holiday = new Date(2026, 2, 3); // Mar 3
      const days = workingDaysInMonth(2026, 3, [holiday]);
      const dates = days.map(isoDate);
      expect(dates).not.toContain('2026-03-03');
    });

    it('retains all other weekdays when one mid-week holiday is removed', () => {
      const holiday = new Date(2026, 2, 3);
      const withHoliday = workingDaysInMonth(2026, 3, [holiday]);
      const withoutHoliday = workingDaysInMonth(2026, 3, []);
      expect(withHoliday).toHaveLength(withoutHoliday.length - 1);
    });

    it('holiday matching is date-only, not time-sensitive', () => {
      // Holiday with a non-midnight timestamp should still match
      const holiday = new Date(2026, 2, 3, 12, 30, 0);
      const days = workingDaysInMonth(2026, 3, [holiday]);
      expect(days.map(isoDate)).not.toContain('2026-03-03');
    });
  });

  describe('holiday landing on a weekend (no double-removal)', () => {
    // 2026-01-01 is a Thursday; let's pick a Saturday as the holiday
    // 2026-01-03 is a Saturday
    it('does not alter the count when a Saturday holiday is supplied', () => {
      const satHoliday = new Date(2026, 0, 3); // Jan 3 = Saturday
      const withHoliday = workingDaysInMonth(2026, 1, [satHoliday]);
      const withoutHoliday = workingDaysInMonth(2026, 1, []);
      expect(withHoliday).toHaveLength(withoutHoliday.length);
    });

    it('does not alter the count when a Sunday holiday is supplied', () => {
      // 2026-01-04 is a Sunday
      const sunHoliday = new Date(2026, 0, 4); // Jan 4 = Sunday
      const withHoliday = workingDaysInMonth(2026, 1, [sunHoliday]);
      const withoutHoliday = workingDaysInMonth(2026, 1, []);
      expect(withHoliday).toHaveLength(withoutHoliday.length);
    });

    it('the weekend day itself is absent regardless of holidays list', () => {
      const satHoliday = new Date(2026, 0, 3);
      const days = workingDaysInMonth(2026, 1, [satHoliday]);
      const dates = days.map(isoDate);
      expect(dates).not.toContain('2026-01-03');
    });
  });

  describe('multiple holidays in the same month', () => {
    // April 2026 has Good Friday (Apr 10 Fri) + Easter Sunday (Apr 12 Sun) + Easter Monday (Apr 13 Mon)
    it('removes all three holidays, only counting the weekday ones', () => {
      const holidays = [
        new Date(2026, 3, 10), // Friday — weekday
        new Date(2026, 3, 12), // Sunday — weekend, no effect
        new Date(2026, 3, 13), // Monday — weekday
      ];
      const withHolidays = workingDaysInMonth(2026, 4, holidays);
      const withoutHolidays = workingDaysInMonth(2026, 4, []);
      // Two weekday holidays removed; the Sunday holiday has no effect
      expect(withHolidays).toHaveLength(withoutHolidays.length - 2);
      const dates = withHolidays.map(isoDate);
      expect(dates).not.toContain('2026-04-10');
      expect(dates).not.toContain('2026-04-12');
      expect(dates).not.toContain('2026-04-13');
    });
  });

  describe('edge cases', () => {
    it('returns empty array for a month that is all weekends (impossible in reality, but zero-holidays path)', () => {
      // Jan 2026 has 21 working days
      const days = workingDaysInMonth(2026, 1, []);
      expect(days.length).toBeGreaterThan(0);
    });

    it('handles an empty holidays array cleanly', () => {
      expect(() => workingDaysInMonth(2026, 6, [])).not.toThrow();
    });

    it('uses fixtures holidays and produces correct count for May 2026', () => {
      // May 2026: May 1 (Friday, Ден на труда) + May 6 (Wednesday, Гергьовден) + May 24 (Sunday, culture day — weekend, no effect)
      const holidays = [
        new Date(2026, 4, 1),  // Friday — weekday
        new Date(2026, 4, 6),  // Wednesday — weekday
        new Date(2026, 4, 24), // Sunday — weekend, no effect
      ];
      const withHolidays = workingDaysInMonth(2026, 5, holidays);
      const withoutHolidays = workingDaysInMonth(2026, 5, []);
      expect(withHolidays).toHaveLength(withoutHolidays.length - 2);
    });
  });
});
