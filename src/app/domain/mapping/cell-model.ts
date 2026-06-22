/**
 * A single cell written to the workbook.
 * `a1` is the Sheets-API A1 address (e.g. "A1", "D13").
 * `format` is an optional Sheets number-format pattern (see workbook.template).
 */
export interface CellModel {
  readonly a1: string;
  readonly value: string | number | null;
  readonly formula?: string;
  readonly format?: string;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly align?: 'center' | 'left' | 'right';
  readonly verticalAlign?: 'top' | 'middle' | 'bottom';
  readonly bgColor?: { readonly red: number; readonly green: number; readonly blue: number };
}
