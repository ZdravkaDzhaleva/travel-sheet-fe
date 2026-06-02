import { Injectable, inject, signal } from '@angular/core';

import { SheetsStore } from '../infrastructure/sheets.store';
import { CalendarService } from './calendar.service';
import { MasterDataService } from './master-data.service';
import { generate } from '../domain/generation/trip-generator';
import { toSheetCells } from '../domain/mapping/row-mapper';
import { monthSheetName } from '../core/config/workbook.template';
import type { FuelEvent, Invoice, Vehicle } from '../domain/entities/index';
import type { HolidaySource } from '../infrastructure/holiday.provider';

export type OpeningBalanceSource = 'priorSheet' | 'vehicleConfig';

export interface GenerateMonthResult {
  readonly year: number;
  readonly month: number;
  readonly sheetName: string;
  readonly openingBalance: number;
  readonly openingSource: OpeningBalanceSource;
  readonly closingBalance: number;
  readonly rowCount: number;
  readonly holidaySource: HolidaySource;
  readonly warnings: readonly string[];
}

@Injectable({ providedIn: 'root' })
export class GenerateMonthService {
  private readonly sheets = inject(SheetsStore);
  private readonly calendar = inject(CalendarService);
  private readonly masterData = inject(MasterDataService);

  private readonly _loading = signal(false);
  private readonly _error = signal<Error | null>(null);
  private readonly _result = signal<GenerateMonthResult | null>(null);

  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly result = this._result.asReadonly();

  async generateMonth(year: number, month: number): Promise<GenerateMonthResult> {
    this._loading.set(true);
    this._error.set(null);
    try {
      if (!this.masterData.ready()) {
        await this.masterData.load();
      }
      const company = this.masterData.company();
      const vehicle = this.masterData.vehicle();
      if (company === null || vehicle === null) {
        throw new Error('Master data is not loaded — call MasterDataService.load() first');
      }
      const locations = this.masterData.locations();
      const routeLegs = this.masterData.routeLegs();

      const cal = await this.calendar.workingDaysFor(year, month);

      const invoices = await this.sheets.loadInvoices();
      const fuelEvents = toFuelEvents(invoices, vehicle, year, month);

      const prior = await this.sheets.readPreviousMonthClosing(year, month, vehicle);
      const openingBalance = prior ?? vehicle.OpeningFuelBalance;
      const openingSource: OpeningBalanceSource = prior === null ? 'vehicleConfig' : 'priorSheet';

      const rows = generate({
        workingDays: cal.workingDays,
        fuelEvents,
        locations,
        routeLegs,
        vehicle,
        openingBalance,
      });

      const cells = toSheetCells(rows, company, vehicle, { year, month });
      const sheetName = monthSheetName(month);
      await this.sheets.writeSheet(cells, sheetName);

      const closingBalance = rows[rows.length - 1].balance;
      const result: GenerateMonthResult = {
        year,
        month,
        sheetName,
        openingBalance,
        openingSource,
        closingBalance,
        rowCount: rows.length,
        holidaySource: cal.source,
        warnings: cal.warnings,
      };
      this._result.set(result);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this._error.set(error);
      throw error;
    } finally {
      this._loading.set(false);
    }
  }
}

function toFuelEvents(
  invoices: readonly Invoice[],
  vehicle: Vehicle,
  year: number,
  month: number,
): FuelEvent[] {
  return invoices
    .filter(
      inv =>
        inv.VehicleId === vehicle.Id &&
        inv.InvoiceDate.getFullYear() === year &&
        inv.InvoiceDate.getMonth() + 1 === month,
    )
    .map(inv => ({
      date: inv.InvoiceDate,
      vendor: inv.FuelVendor,
      liters: inv.QuantityLiters,
      unitPrice: inv.UnitPrice,
      totalAmount: inv.TotalAmount,
    }));
}
