import type {
  Company,
  GeneratedRow,
  Vehicle,
} from '../entities/index';
import {
  CELL_COMPANY_ADDRESS,
  CELL_COMPANY_EIK,
  CELL_COMPANY_NAME,
  CELL_FUEL_LABEL,
  CELL_FUEL_TYPE,
  CELL_PERIOD,
  CELL_SEATS_COUNT,
  CELL_SEATS_LABEL,
  CELL_TITLE,
  CELL_VEHICLE_LABEL,
  CELL_VEHICLE_MODEL,
  CELL_VEHICLE_PLATE,
  CELL_VEHICLE_REG_LBL,
  FMT_LITERS,
  HDR_AVG_CONSUMPTION,
  HDR_BALANCE,
  HDR_CONSUMED,
  HDR_DATE,
  HDR_FUELED,
  HDR_KM,
  HDR_NO,
  HDR_ROUTE,
  LBL_APPROVED,
  LBL_DRIVER,
  LBL_EIK_PREFIX,
  LBL_FUEL,
  LBL_PERIOD_PREFIX,
  LBL_REG_NO,
  LBL_SEATS,
  LBL_SIGNATURE,
  LBL_TITLE,
  LBL_VEHICLE,
  ROW_CLOSING_LABEL,
  ROW_COLUMN_HEADERS,
  ROW_DATA_START,
  ROW_OPENING_KM_MARK,
  ROW_TOTAL_LABEL,
} from '../../core/config/workbook.template';
import { round2 } from '../generation/round2';
import type { CellModel } from './cell-model';

export interface Period {
  readonly year: number;
  readonly month: number; // 1-based
}

const DATA_COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;

export function toSheetCells(
  rows: readonly GeneratedRow[],
  company: Company,
  vehicle: Vehicle,
  period: Period,
): CellModel[] {
  const cells: CellModel[] = [];

  // ── Company header ──
  cells.push({ a1: CELL_COMPANY_NAME, value: company.Name, bold: true });
  cells.push({
    a1: CELL_COMPANY_EIK,
    value: `${LBL_EIK_PREFIX} ${company.Eik}`,
  });
  cells.push({ a1: CELL_COMPANY_ADDRESS, value: company.Address });

  // ── Title ──
  cells.push({ a1: CELL_TITLE, value: LBL_TITLE, bold: true });

  // ── Period ──
  cells.push({ a1: CELL_PERIOD, value: formatPeriod(period) });

  // ── Vehicle / seats / fuel ──
  cells.push({ a1: CELL_VEHICLE_LABEL, value: LBL_VEHICLE });
  cells.push({ a1: CELL_VEHICLE_MODEL, value: vehicle.Name });
  cells.push({ a1: CELL_VEHICLE_REG_LBL, value: LBL_REG_NO });
  cells.push({ a1: CELL_VEHICLE_PLATE, value: vehicle.RegistrationNumber });

  cells.push({ a1: CELL_SEATS_LABEL, value: LBL_SEATS });
  cells.push({ a1: CELL_SEATS_COUNT, value: vehicle.SeatCount });
  cells.push({ a1: CELL_FUEL_LABEL, value: LBL_FUEL });
  cells.push({ a1: CELL_FUEL_TYPE, value: vehicle.FuelType });

  // ── Column headers (row 12) ──
  const headers = [
    HDR_NO,
    HDR_DATE,
    HDR_ROUTE,
    HDR_KM,
    HDR_AVG_CONSUMPTION,
    HDR_CONSUMED,
    HDR_FUELED,
    HDR_BALANCE,
  ];
  for (let i = 0; i < DATA_COLS.length; i++) {
    cells.push({
      a1: `${DATA_COLS[i]}${ROW_COLUMN_HEADERS}`,
      value: headers[i],
      bold: true,
    });
  }

  // ── Data rows (from row 13) ──
  let rowNum = ROW_DATA_START;
  let lineNo = 1;
  let sumConsumed = 0;
  let sumFueled = 0;
  let closingBalance = 0;

  for (const row of rows) {
    const bold = row.kind === 'opening' || row.kind === 'fuel';
    cells.push({ a1: `A${rowNum}`, value: lineNo, bold });

    if (row.date !== null) {
      cells.push({ a1: `B${rowNum}`, value: formatDdMmYyyy(row.date), bold });
    }

    if (row.route !== null) {
      cells.push({ a1: `C${rowNum}`, value: row.route, bold });
    }

    if (row.kind === 'opening') {
      cells.push({ a1: `D${rowNum}`, value: ROW_OPENING_KM_MARK, bold });
    } else if (row.kind === 'trip' && row.km !== null) {
      cells.push({ a1: `D${rowNum}`, value: row.km, bold });
    }

    if (row.avgConsumption !== null) {
      cells.push({ a1: `E${rowNum}`, value: row.avgConsumption, bold });
    }

    if (row.consumed !== null) {
      cells.push({
        a1: `F${rowNum}`,
        value: row.consumed,
        format: FMT_LITERS,
        bold,
      });
    }

    if (row.fueled !== null) {
      cells.push({
        a1: `G${rowNum}`,
        value: row.fueled,
        format: FMT_LITERS,
        bold,
      });
    }

    cells.push({
      a1: `H${rowNum}`,
      value: row.balance,
      format: FMT_LITERS,
      bold,
    });

    if (row.consumed !== null) sumConsumed += row.consumed;
    if (row.fueled !== null) sumFueled += row.fueled;
    closingBalance = row.balance;

    lineNo++;
    rowNum++;
  }

  // ── Closing balance row ──
  cells.push({ a1: `C${rowNum}`, value: ROW_CLOSING_LABEL, bold: true });
  cells.push({
    a1: `H${rowNum}`,
    value: closingBalance,
    format: FMT_LITERS,
    bold: true,
  });
  rowNum++;

  // ── Totals row ──
  cells.push({ a1: `C${rowNum}`, value: ROW_TOTAL_LABEL, bold: true });
  cells.push({
    a1: `F${rowNum}`,
    value: round2(sumConsumed),
    format: FMT_LITERS,
    bold: true,
  });
  cells.push({
    a1: `G${rowNum}`,
    value: round2(sumFueled),
    format: FMT_LITERS,
    bold: true,
  });
  rowNum++;

  // ── Signatures (one blank row separator) ──
  rowNum++;
  cells.push({ a1: `A${rowNum}`, value: LBL_DRIVER });
  cells.push({ a1: `E${rowNum}`, value: LBL_APPROVED });
  rowNum++;
  cells.push({ a1: `C${rowNum}`, value: LBL_SIGNATURE });
  cells.push({ a1: `G${rowNum}`, value: LBL_SIGNATURE });

  return cells;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatPeriod(period: Period): string {
  const mm = String(period.month).padStart(2, '0');
  const yyyy = String(period.year);
  const lastDay = new Date(period.year, period.month, 0).getDate();
  const lastDd = String(lastDay).padStart(2, '0');
  return `${LBL_PERIOD_PREFIX} 01.${mm}.${yyyy} - ${lastDd}.${mm}.${yyyy}`;
}

function formatDdMmYyyy(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}
