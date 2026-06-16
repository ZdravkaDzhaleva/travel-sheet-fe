import { describe, it, expect } from 'vitest';
import { parseDateInput, formatDateInput, formatDateDisplay } from './date';

describe('parseDateInput', () => {
  it('parses a valid YYYY-MM-DD into a local Date', () => {
    const d = parseDateInput('2026-02-14');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(1); // February (0-based)
    expect(d!.getDate()).toBe(14);
  });

  it('does not roll the day back across the UTC boundary', () => {
    // `new Date('2026-01-01')` is UTC midnight → local EET would be 2026-01-01
    // still, but the day-of-month must match the input verbatim.
    const d = parseDateInput('2026-01-01');
    expect(d!.getDate()).toBe(1);
    expect(d!.getMonth()).toBe(0);
  });

  it('returns null for malformed or impossible dates', () => {
    expect(parseDateInput('not-a-date')).toBeNull();
    expect(parseDateInput('2026-13-01')).toBeNull(); // month 13
    expect(parseDateInput('2026-02-30')).toBeNull(); // Feb 30 rolls over
    expect(parseDateInput('2026-2-4')).toBeNull();   // unpadded
    expect(parseDateInput('')).toBeNull();
  });
});

describe('formatDateInput', () => {
  it('formats a Date to zero-padded YYYY-MM-DD (local parts)', () => {
    expect(formatDateInput(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(formatDateInput(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('round-trips with parseDateInput', () => {
    const s = '2026-07-09';
    expect(formatDateInput(parseDateInput(s)!)).toBe(s);
  });
});

describe('formatDateDisplay', () => {
  it('formats a Date to zero-padded DD.MM.YYYY (local parts)', () => {
    expect(formatDateDisplay(new Date(2026, 0, 5))).toBe('05.01.2026');
    expect(formatDateDisplay(new Date(2026, 11, 31))).toBe('31.12.2026');
  });
});
