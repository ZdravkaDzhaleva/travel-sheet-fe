// All Cyrillic strings written into the workbook are named constants here.
// No Cyrillic literals may appear anywhere else in the codebase.
// Cell references use A1 notation as understood by the Sheets API.

// ── Cell addresses ────────────────────────────────────────────────────────────

export const CELL_COMPANY_NAME    = 'A1';
export const CELL_COMPANY_EIK     = 'A2';
export const CELL_COMPANY_ADDRESS = 'A3';
export const CELL_TITLE           = 'A5';
export const CELL_PERIOD          = 'D7';

export const CELL_VEHICLE_LABEL   = 'A9';
export const CELL_VEHICLE_MODEL   = 'C9';
export const CELL_VEHICLE_REG_LBL = 'D9';
export const CELL_VEHICLE_PLATE   = 'E9';

export const CELL_SEATS_LABEL     = 'A10';
export const CELL_SEATS_COUNT     = 'C10';
export const CELL_FUEL_LABEL      = 'D10';
export const CELL_FUEL_TYPE       = 'E10';

export const ROW_COLUMN_HEADERS   = 12;
export const ROW_DATA_START       = 13;

// ── Bulgarian string constants ─────────────────────────────────────────────────

export const LBL_TITLE            = 'П Ъ Т Е Н   Л И С Т';
export const LBL_EIK_PREFIX       = 'ЕИК:';
export const LBL_PERIOD_PREFIX    = 'За период:';
export const LBL_VEHICLE          = 'Автомобил';
export const LBL_REG_NO           = 'рег. №';
export const LBL_SEATS            = 'Брой места:';
export const LBL_FUEL             = 'гориво';

// Column headers (row 12, columns A–H)
export const HDR_NO               = '№';
export const HDR_DATE             = 'Дата';
export const HDR_ROUTE            = 'Маршрут';
export const HDR_KM               = 'пробег км.';
export const HDR_AVG_CONSUMPTION  = 'Ср. Разход л./100км';
export const HDR_CONSUMED         = 'Разход Общо литри';
export const HDR_FUELED           = 'Заредено количество';
export const HDR_BALANCE          = 'Наличност литри';

// Row-type route strings
export const ROW_OPENING_LABEL    = 'Начално количество';
export const ROW_CLOSING_LABEL    = 'Крайно количество';
export const ROW_TOTAL_LABEL      = 'Общо количество';

// Opening row's "km" cell (column D) holds the Cyrillic letter 'х' as a marker.
export const ROW_OPENING_KM_MARK  = 'х';

// Per-month sheet name prefix: sheets are named `м_MM` (e.g. `м_01`).
export const MONTH_SHEET_PREFIX   = 'м_';
export function monthSheetName(month: number): string {
  return `${MONTH_SHEET_PREFIX}${String(month).padStart(2, '0')}`;
}

// Fuel row template — build with formatFuelRow()
// Pattern: "Зареждане гориво - {vendor} - {liters} л * {price} лв/л = {total} лв общо"
export const FUEL_ROW_PREFIX      = 'Зареждане гориво';
export const FUEL_ROW_UNIT_L      = 'л';
export const FUEL_ROW_UNIT_LVL    = 'лв/л';
export const FUEL_ROW_UNIT_TOTAL  = 'лв общо';

// Signature section
export const LBL_DRIVER           = 'Водач';
export const LBL_APPROVED         = 'Одобрил';
export const LBL_SIGNATURE        = 'подпис';

// ── Number formats (Sheets API pattern strings) ────────────────────────────────

export const FMT_KM               = '#,##0.00';
export const FMT_LITERS           = '#,##0.00';
export const FMT_DATE             = 'DD.MM.YYYY';

// ── Bold rules ────────────────────────────────────────────────────────────────

// Rows that must be bold: the column-header row, fuel rows, totals rows.
// The RowMapper applies bold based on row kind, not hard-coded row numbers.
export const BOLD_ROW_KINDS = ['fuel', 'opening', 'closing', 'total'] as const;
