import { Injectable, inject } from '@angular/core';

import {
  HOLIDAY_API_HOST,
  HOLIDAY_API_TEMPLATE,
  HOLIDAY_API_TIMEOUT_MS,
  HOLIDAY_MAX_ENTRIES,
  HOLIDAY_OVERRIDE_TAB,
} from '../core/config/holiday.config';
import { SUPPORTING_SHEET_ID } from '../core/config/workspace.config';
import { SheetsClient } from '../core/google/sheets.client';

export type HolidaySource = 'api' | 'override' | 'none';

export interface HolidayFetchResult {
  readonly dates: readonly Date[];
  readonly source: HolidaySource;
  readonly warnings: readonly string[];
}

@Injectable({ providedIn: 'root' })
export class HolidayProvider {
  private readonly sheets = inject(SheetsClient);

  async getHolidays(year: number): Promise<HolidayFetchResult> {
    const url = HOLIDAY_API_TEMPLATE.replace('{year}', String(year));
    if (!isPinned(url)) {
      return this.fallback(year, `URL not pinned to ${HOLIDAY_API_HOST}`);
    }

    let parsed: unknown;
    try {
      const resp = await fetchWithTimeout(url, HOLIDAY_API_TIMEOUT_MS);
      if (!resp.ok) {
        return this.fallback(year, `Holiday API responded ${resp.status}`);
      }
      const ctype = resp.headers.get('content-type') ?? '';
      if (!/application\/json/i.test(ctype)) {
        return this.fallback(year, `Holiday API returned non-JSON content type: ${ctype}`);
      }
      const text = await resp.text();
      try {
        parsed = JSON.parse(text);
      } catch {
        return this.fallback(year, 'Holiday API returned a non-JSON body');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Holiday API fetch failed';
      return this.fallback(year, msg);
    }

    const dates = validateNagerPayload(parsed, year);
    if (Array.isArray(parsed) && parsed.length > 0 && dates.length === 0) {
      return this.fallback(year, 'Holiday API payload failed validation');
    }

    const warnings: string[] = [];
    const mismatch = crossCheck(dates, expectedHolidaysFor(year));
    if (mismatch !== null) warnings.push(mismatch);
    return { dates, source: 'api', warnings };
  }

  private async fallback(year: number, reason: string): Promise<HolidayFetchResult> {
    const warnings = [`Falling back to supporting-sheet override: ${reason}`];
    try {
      const res = await this.sheets.valuesGet(
        SUPPORTING_SHEET_ID,
        `${HOLIDAY_OVERRIDE_TAB}!A2:A`,
      );
      const rows = res.values ?? [];
      const dates: Date[] = [];
      for (const row of rows) {
        const v = String(row[0] ?? '').trim();
        if (!v) continue;
        const d = parseDateInYear(v, year);
        if (d) dates.push(d);
      }
      return { dates, source: 'override', warnings };
    } catch (err) {
      warnings.push(err instanceof Error ? err.message : 'override sheet read failed');
      return { dates: [], source: 'none', warnings };
    }
  }
}

/** §7a rule 1: only allow URLs pinned to the configured Nager origin. */
export function isPinned(url: string): boolean {
  return url.startsWith(`${HOLIDAY_API_HOST}/`);
}

/** §7a rules 2–4: schema-validate each entry; bound the payload; drop everything except `date`. */
export function validateNagerPayload(raw: unknown, year: number): Date[] {
  if (!Array.isArray(raw)) return [];
  if (raw.length > HOLIDAY_MAX_ENTRIES) return [];
  const out: Date[] = [];
  for (const item of raw) {
    if (item === null || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const dateStr = rec['date'];
    if (typeof dateStr !== 'string') continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;
    const d = parseDateInYear(dateStr, year);
    if (d) out.push(d);
  }
  return out;
}

/** §7a rule 6: warn if fetched set diverges from the small hardcoded expected set. */
export function crossCheck(
  actual: readonly Date[],
  expected: readonly Date[],
): string | null {
  if (expected.length === 0) return null;
  const aKeys = new Set(actual.map(dayKey));
  const eKeys = new Set(expected.map(dayKey));
  let missing = 0;
  let extra = 0;
  for (const k of eKeys) if (!aKeys.has(k)) missing++;
  for (const k of aKeys) if (!eKeys.has(k)) extra++;
  if (missing === 0 && extra === 0) return null;
  return `Holiday cross-check mismatch: ${missing} missing, ${extra} extra (got ${actual.length}, expected ${expected.length})`;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Strict YYYY-MM-DD parse: must be a real date and fall inside `year`. */
function parseDateInYear(s: string, year: number): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y !== year) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, mo - 1, d);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== mo - 1 ||
    date.getDate() !== d
  ) {
    return null; // overflow (e.g. Feb 30 → Mar 2)
  }
  return date;
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

/** Hardcoded expected BG public-holiday set for §7a cross-check (extend per year). */
function expectedHolidaysFor(year: number): Date[] {
  if (year === 2026) {
    return [
      new Date(2026, 0, 1),
      new Date(2026, 2, 3),
      new Date(2026, 3, 10),
      new Date(2026, 3, 12),
      new Date(2026, 3, 13),
      new Date(2026, 4, 1),
      new Date(2026, 4, 6),
      new Date(2026, 4, 24),
      new Date(2026, 8, 6),
      new Date(2026, 8, 22),
      new Date(2026, 10, 1),
      new Date(2026, 11, 24),
      new Date(2026, 11, 25),
      new Date(2026, 11, 26),
    ];
  }
  return [];
}
