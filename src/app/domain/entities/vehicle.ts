export interface Vehicle {
  readonly Id: number;
  readonly CompanyId: number;
  readonly Name: string;
  readonly RegistrationNumber: string;
  readonly FuelType: string;
  readonly SeatCount: string; // written verbatim, e.g. "4+1" (D2)
  readonly AverageConsumptionLitersPer100Km: number;
  readonly TankCapacityLiters: number;
  readonly IsActive: boolean;
  readonly OpeningFuelBalance: number; // seeds the first month's opening balance
}
