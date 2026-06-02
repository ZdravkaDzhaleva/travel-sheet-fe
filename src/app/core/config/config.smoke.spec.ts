import { describe, it, expect } from 'vitest';

import {
  DRIVE_FOLDER_NAME,
  SUPPORTING_SHEET_NAME,
  WORKBOOK_NAME,
} from './workspace.config';

import { SUPPORTING_MAP } from './supporting.map';

import {
  LBL_TITLE,
  LBL_EIK_PREFIX,
  ROW_DATA_START,
  FUEL_ROW_PREFIX,
  ROW_OPENING_LABEL,
  ROW_CLOSING_LABEL,
  BOLD_ROW_KINDS,
} from './workbook.template';

import {
  BALANCE_MIN,
  BALANCE_MAX,
  MAX_STOPS_PER_DAY,
  MAX_KM_PER_DAY,
} from './generation.config';

import {
  HOLIDAY_API_HOST,
  HOLIDAY_API_TEMPLATE,
  HOLIDAY_API_TIMEOUT_MS,
  HOLIDAY_MAX_ENTRIES,
  HOLIDAY_OVERRIDE_TAB,
} from './holiday.config';

import { OAUTH_SCOPES } from './oauth.config';

describe('workspace.config', () => {
  it('exports non-empty Drive folder, supporting-sheet, and workbook names', () => {
    // All three are looked up by name inside Drive — they're not secrets
    // (CLAUDE.md: only OAuth client secrets and service-account keys are).
    // Per-deployment values land here directly; the smoke check is just shape.
    expect(typeof DRIVE_FOLDER_NAME).toBe('string');
    expect(DRIVE_FOLDER_NAME.length).toBeGreaterThan(0);
    expect(typeof SUPPORTING_SHEET_NAME).toBe('string');
    expect(SUPPORTING_SHEET_NAME.length).toBeGreaterThan(0);
    expect(typeof WORKBOOK_NAME).toBe('string');
    expect(WORKBOOK_NAME.length).toBeGreaterThan(0);
  });
});

describe('supporting.map', () => {
  it('defines all five tabs', () => {
    expect(SUPPORTING_MAP.company.tab).toBe('Company');
    expect(SUPPORTING_MAP.vehicle.tab).toBe('Vehicle');
    expect(SUPPORTING_MAP.location.tab).toBe('Location');
    expect(SUPPORTING_MAP.route.tab).toBe('Route');
    expect(SUPPORTING_MAP.invoice.tab).toBe('Invoice');
  });

  it('has correct 0-based column counts per §6a', () => {
    expect(Object.keys(SUPPORTING_MAP.company.cols)).toHaveLength(5);   // A:E
    expect(Object.keys(SUPPORTING_MAP.vehicle.cols)).toHaveLength(10);  // A:J
    expect(Object.keys(SUPPORTING_MAP.location.cols)).toHaveLength(6);  // A:F
    expect(Object.keys(SUPPORTING_MAP.route.cols)).toHaveLength(5);     // A:E
    expect(Object.keys(SUPPORTING_MAP.invoice.cols)).toHaveLength(11);  // A:K
  });

  it('invoice driveFileId is the last column (10)', () => {
    expect(SUPPORTING_MAP.invoice.cols.driveFileId).toBe(10);
  });
});

describe('workbook.template', () => {
  it('title constant contains the exact Cyrillic string', () => {
    expect(LBL_TITLE).toBe('П Ъ Т Е Н   Л И С Т');
  });

  it('EIK prefix is correct', () => {
    expect(LBL_EIK_PREFIX).toBe('ЕИК:');
  });

  it('data starts at row 13', () => {
    expect(ROW_DATA_START).toBe(13);
  });

  it('fuel row prefix is correct', () => {
    expect(FUEL_ROW_PREFIX).toBe('Зареждане гориво');
  });

  it('opening and closing labels are correct', () => {
    expect(ROW_OPENING_LABEL).toBe('Начално количество');
    expect(ROW_CLOSING_LABEL).toBe('Крайно количество');
  });

  it('bold row kinds include fuel and opening', () => {
    expect(BOLD_ROW_KINDS).toContain('fuel');
    expect(BOLD_ROW_KINDS).toContain('opening');
  });
});

describe('generation.config', () => {
  it('balance window is [0, 8]', () => {
    expect(BALANCE_MIN).toBe(0);
    expect(BALANCE_MAX).toBe(8);
  });

  it('per-day caps match D1 defaults', () => {
    expect(MAX_STOPS_PER_DAY).toBe(3);
    expect(MAX_KM_PER_DAY).toBe(80);
  });

  it('BALANCE_MIN < BALANCE_MAX', () => {
    expect(BALANCE_MIN).toBeLessThan(BALANCE_MAX);
  });
});

describe('holiday.config', () => {
  it('API host is HTTPS only', () => {
    expect(HOLIDAY_API_HOST).toMatch(/^https:\/\//);
  });

  it('API template contains {year} placeholder', () => {
    expect(HOLIDAY_API_TEMPLATE).toContain('{year}');
  });

  it('API template uses the pinned host', () => {
    expect(HOLIDAY_API_TEMPLATE).toContain(HOLIDAY_API_HOST);
  });

  it('timeout is a positive number', () => {
    expect(HOLIDAY_API_TIMEOUT_MS).toBeGreaterThan(0);
  });

  it('max entries cap is reasonable (≤ 60)', () => {
    expect(HOLIDAY_MAX_ENTRIES).toBeGreaterThan(0);
    expect(HOLIDAY_MAX_ENTRIES).toBeLessThanOrEqual(60);
  });

  it('override tab name is defined', () => {
    expect(HOLIDAY_OVERRIDE_TAB.length).toBeGreaterThan(0);
  });
});

describe('oauth.config', () => {
  it('includes spreadsheets scope', () => {
    expect(OAUTH_SCOPES).toContain(
      'https://www.googleapis.com/auth/spreadsheets',
    );
  });

  it('includes drive.file scope', () => {
    expect(OAUTH_SCOPES).toContain(
      'https://www.googleapis.com/auth/drive.file',
    );
  });

  it('includes drive.metadata.readonly scope (needed for findByName lookups)', () => {
    expect(OAUTH_SCOPES).toContain(
      'https://www.googleapis.com/auth/drive.metadata.readonly',
    );
  });

  it('does not request broader drive scope', () => {
    expect(OAUTH_SCOPES).not.toContain(
      'https://www.googleapis.com/auth/drive',
    );
  });
});
