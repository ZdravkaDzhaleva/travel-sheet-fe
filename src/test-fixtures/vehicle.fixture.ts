import type { Vehicle } from '../app/domain/entities/index';

// The active vehicle: Mercedes GLC (diesel, 4+1 seats, 11.5 L/100 km).
export function makeVehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    Id: 1,
    CompanyId: 1,
    Name: 'Mercedes GLC',
    RegistrationNumber: 'СА 1234 ВС',
    FuelType: 'дизел',
    SeatCount: '4+1',
    AverageConsumptionLitersPer100Km: 11.5,
    TankCapacityLiters: 66,
    IsActive: true,
    OpeningFuelBalance: 5.0,
    ...overrides,
  };
}
