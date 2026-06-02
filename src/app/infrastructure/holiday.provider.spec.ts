import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';

import {
  HolidayProvider,
  isPinned,
  validateNagerPayload,
  crossCheck,
} from './holiday.provider';
import { SheetsClient } from '../core/google/sheets.client';
import { SheetsStore } from './sheets.store';
import { HOLIDAY_MAX_ENTRIES } from '../core/config/holiday.config';

describe('isPinned', () => {
  it('accepts the configured Nager origin', () => {
    expect(isPinned('https://date.nager.at/api/v3/PublicHolidays/2026/BG')).toBe(true);
  });
  it('rejects HTTP (non-TLS)', () => {
    expect(isPinned('http://date.nager.at/api/v3/PublicHolidays/2026/BG')).toBe(false);
  });
  it('rejects a different origin even on HTTPS', () => {
    expect(isPinned('https://evil.example/api/v3/PublicHolidays/2026/BG')).toBe(false);
  });
});

describe('validateNagerPayload', () => {
  it('returns the dates from a well-formed payload, keeping only the date field', () => {
    const raw = [
      { date: '2026-01-01', name: 'Нова година', countryCode: 'BG' },
      { date: '2026-03-03', name: 'Освобождение' },
    ];
    const out = validateNagerPayload(raw, 2026);
    expect(out).toHaveLength(2);
    expect(out[0].getFullYear()).toBe(2026);
    expect(out[0].getMonth()).toBe(0);
    expect(out[0].getDate()).toBe(1);
  });

  it('returns [] when input is not an array', () => {
    expect(validateNagerPayload(null, 2026)).toEqual([]);
    expect(validateNagerPayload({ date: '2026-01-01' }, 2026)).toEqual([]);
    expect(validateNagerPayload('garbage', 2026)).toEqual([]);
    expect(validateNagerPayload(42, 2026)).toEqual([]);
  });

  it('rejects payloads larger than HOLIDAY_MAX_ENTRIES', () => {
    const huge = Array.from({ length: HOLIDAY_MAX_ENTRIES + 1 }, () => ({
      date: '2026-01-01',
    }));
    expect(validateNagerPayload(huge, 2026)).toEqual([]);
  });

  it('drops entries whose date is missing, non-string, or wrong format', () => {
    const raw = [
      { date: '2026-01-01' },        // OK
      { date: 'not-a-date' },        // wrong format
      { date: 42 },                  // non-string
      { name: 'no date here' },      // missing
      'a string',                    // wrong shape
      null,                          // null entry
    ];
    expect(validateNagerPayload(raw, 2026)).toHaveLength(1);
  });

  it('rejects dates outside the requested year', () => {
    const raw = [
      { date: '2025-12-31' },
      { date: '2027-01-01' },
      { date: '2026-12-25' },
    ];
    const out = validateNagerPayload(raw, 2026);
    expect(out).toHaveLength(1);
    expect(out[0].getFullYear()).toBe(2026);
  });

  it('rejects non-real dates (Feb 30, month 13, etc.)', () => {
    const raw = [
      { date: '2026-02-30' },
      { date: '2026-13-01' },
      { date: '2026-00-01' },
      { date: '2026-04-31' }, // April has 30 days
    ];
    expect(validateNagerPayload(raw, 2026)).toEqual([]);
  });
});

describe('crossCheck', () => {
  const jan1 = new Date(2026, 0, 1);
  const mar3 = new Date(2026, 2, 3);

  it('returns null when expected is empty (nothing to compare)', () => {
    expect(crossCheck([jan1], [])).toBeNull();
  });

  it('returns null when sets match exactly', () => {
    expect(crossCheck([jan1, mar3], [jan1, mar3])).toBeNull();
  });

  it('warns when there is a missing date', () => {
    const w = crossCheck([jan1], [jan1, mar3]);
    expect(w).toContain('1 missing');
  });

  it('warns when there is an extra date', () => {
    const w = crossCheck([jan1, mar3], [jan1]);
    expect(w).toContain('1 extra');
  });
});


interface SheetsStub {
  rows?: (string | number | boolean | null)[][];
  throws?: boolean;
}

function makeSheetsStub(opts: SheetsStub = {}): SheetsClient {
  return {
    valuesGet: vi.fn(async () => {
      if (opts.throws) throw new Error('sheets read failed');
      return {
        range: 'HolidayOverrides!A2:A',
        majorDimension: 'ROWS' as const,
        values: opts.rows,
      };
    }),
  } as unknown as SheetsClient;
}

function jsonResp(
  body: unknown,
  init: { status?: number; contentType?: string } = {},
): Response {
  const status = init.status ?? 200;
  const contentType = init.contentType ?? 'application/json';
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': contentType },
  });
}

function makeSheetsStoreStub(): SheetsStore {
  return {
    resolveSupportingSheetId: vi.fn(async () => 'supporting-id'),
  } as unknown as SheetsStore;
}

function makeProvider(sheets: SheetsClient): HolidayProvider {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: SheetsClient, useValue: sheets },
      { provide: SheetsStore, useValue: makeSheetsStoreStub() },
    ],
  });
  return TestBed.inject(HolidayProvider);
}

describe('HolidayProvider.getHolidays', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => fetchSpy.mockRestore());

  const validBg2026 = [
    { date: '2026-01-01' },
    { date: '2026-03-03' },
    { date: '2026-04-10' },
    { date: '2026-04-12' },
    { date: '2026-04-13' },
    { date: '2026-05-01' },
    { date: '2026-05-06' },
    { date: '2026-05-24' },
    { date: '2026-09-06' },
    { date: '2026-09-22' },
    { date: '2026-11-01' },
    { date: '2026-12-24' },
    { date: '2026-12-25' },
    { date: '2026-12-26' },
  ];

  it('happy path: returns parsed dates from the API with no warnings (matches expected 2026 set)', async () => {
    fetchSpy.mockResolvedValue(jsonResp(validBg2026));
    const provider = makeProvider(makeSheetsStub());
    const out = await provider.getHolidays(2026);
    expect(out.source).toBe('api');
    expect(out.warnings).toEqual([]);
    expect(out.dates).toHaveLength(14);
  });

  it('uses the pinned host URL', async () => {
    fetchSpy.mockResolvedValue(jsonResp(validBg2026));
    await makeProvider(makeSheetsStub()).getHolidays(2026);
    expect(String(fetchSpy.mock.calls[0][0])).toBe(
      'https://date.nager.at/api/v3/PublicHolidays/2026/BG',
    );
  });

  it('falls back to override on non-2xx response', async () => {
    fetchSpy.mockResolvedValue(jsonResp({ error: 'oops' }, { status: 500 }));
    const sheets = makeSheetsStub({ rows: [['2026-01-01'], ['2026-03-03']] });
    const out = await makeProvider(sheets).getHolidays(2026);
    expect(out.source).toBe('override');
    expect(out.dates).toHaveLength(2);
    expect(out.warnings[0]).toContain('500');
  });

  it('falls back to override on non-JSON content type', async () => {
    fetchSpy.mockResolvedValue(jsonResp([], { contentType: 'text/html' }));
    const sheets = makeSheetsStub({ rows: [['2026-05-01']] });
    const out = await makeProvider(sheets).getHolidays(2026);
    expect(out.source).toBe('override');
    expect(out.warnings[0]).toContain('non-JSON content type');
  });

  it('falls back to override on garbage JSON body', async () => {
    fetchSpy.mockResolvedValue(
      new Response('not-real-json{', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const sheets = makeSheetsStub({ rows: [['2026-05-01']] });
    const out = await makeProvider(sheets).getHolidays(2026);
    expect(out.source).toBe('override');
    expect(out.warnings[0]).toContain('non-JSON body');
  });

  it('falls back to override on network/abort error', async () => {
    fetchSpy.mockRejectedValue(
      new DOMException('Operation timed out', 'AbortError'),
    );
    const sheets = makeSheetsStub({ rows: [['2026-05-01']] });
    const out = await makeProvider(sheets).getHolidays(2026);
    expect(out.source).toBe('override');
    expect(out.warnings[0]).toContain('Falling back');
  });

  it('falls back to override when payload is oversized (>HOLIDAY_MAX_ENTRIES)', async () => {
    const huge = Array.from({ length: HOLIDAY_MAX_ENTRIES + 1 }, () => ({
      date: '2026-01-01',
    }));
    fetchSpy.mockResolvedValue(jsonResp(huge));
    const sheets = makeSheetsStub({ rows: [['2026-01-01']] });
    const out = await makeProvider(sheets).getHolidays(2026);
    expect(out.source).toBe('override');
    expect(out.warnings[0]).toContain('failed validation');
  });

  it('falls back to override when entries are all garbage', async () => {
    fetchSpy.mockResolvedValue(
      jsonResp([{ date: 'bogus' }, { date: '2025-01-01' }]),
    );
    const sheets = makeSheetsStub({ rows: [['2026-01-01']] });
    const out = await makeProvider(sheets).getHolidays(2026);
    expect(out.source).toBe('override');
  });

  it('returns source=none with warnings when both API and override fail', async () => {
    fetchSpy.mockRejectedValue(new Error('network down'));
    const sheets = makeSheetsStub({ throws: true });
    const out = await makeProvider(sheets).getHolidays(2026);
    expect(out.source).toBe('none');
    expect(out.dates).toEqual([]);
    expect(out.warnings.length).toBeGreaterThanOrEqual(1);
  });

  it('emits a cross-check warning when fetched set diverges from the hardcoded expected set', async () => {
    // Drop the last 2026 entry on purpose.
    fetchSpy.mockResolvedValue(jsonResp(validBg2026.slice(0, -1)));
    const out = await makeProvider(makeSheetsStub()).getHolidays(2026);
    expect(out.source).toBe('api');
    expect(out.warnings.length).toBeGreaterThanOrEqual(1);
    expect(out.warnings[0]).toContain('mismatch');
  });

  it('ignores blank rows in the override fallback', async () => {
    fetchSpy.mockRejectedValue(new Error('boom'));
    const sheets = makeSheetsStub({
      rows: [[''], ['2026-01-01'], [null], ['  '], ['2026-03-03']],
    });
    const out = await makeProvider(sheets).getHolidays(2026);
    expect(out.source).toBe('override');
    expect(out.dates).toHaveLength(2);
  });
});
