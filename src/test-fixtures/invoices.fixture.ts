import type { FuelEvent, Invoice } from '../app/domain/entities/index';

// Two fuel invoices in January 2026 for the active GLC vehicle.
export function makeInvoices(): Invoice[] {
  return [
    {
      Id: 1,
      CompanyId: 1,
      ReportingYear: 2026,
      VehicleId: 1,
      FuelVendor: 'Лукойл',
      InvoiceDate: new Date('2026-01-10'),
      QuantityLiters: 40,
      UnitPrice: 2.89,
      TotalAmount: 115.60,
      Currency: 'BGN',
      DriveFileId: 'fixture-drive-id-1',
    },
    {
      Id: 2,
      CompanyId: 1,
      ReportingYear: 2026,
      VehicleId: 1,
      FuelVendor: 'Лукойл',
      InvoiceDate: new Date('2026-01-25'),
      QuantityLiters: 45,
      UnitPrice: 2.89,
      TotalAmount: 130.05,
      Currency: 'BGN',
      DriveFileId: 'fixture-drive-id-2',
    },
  ];
}

// FuelEvent projections of the fixture invoices, ready for TripGenerator.
export function makeFuelEvents(): FuelEvent[] {
  return makeInvoices().map(inv => ({
    date:        inv.InvoiceDate,
    vendor:      inv.FuelVendor,
    liters:      inv.QuantityLiters,
    unitPrice:   inv.UnitPrice,
    totalAmount: inv.TotalAmount,
  }));
}
