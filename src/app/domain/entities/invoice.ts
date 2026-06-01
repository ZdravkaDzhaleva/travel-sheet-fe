export interface Invoice {
  readonly Id: number;
  readonly CompanyId: number;
  readonly ReportingYear: number;
  readonly VehicleId: number;
  readonly FuelVendor: string;
  readonly InvoiceDate: Date;
  readonly QuantityLiters: number;
  readonly UnitPrice: number;
  readonly TotalAmount: number;
  readonly Currency: string;
  readonly DriveFileId: string;
}
