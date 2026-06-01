import { describe, it, expectTypeOf } from 'vitest';
import type {
  Company,
  Vehicle,
  Location,
  RouteLeg,
  Invoice,
  FuelEvent,
  Holiday,
  GeneratedRow,
  MonthSheet,
} from './index';

describe('T1.1 entity types', () => {
  it('Company can be constructed from literals', () => {
    const company: Company = {
      Id: 1,
      Name: 'Уи Денс ЕООД',
      Eik: '206123456',
      Address: 'ул. Примерна 1, Борово',
      ReportingYear: 2026,
    };
    expectTypeOf(company).toMatchTypeOf<Company>();
  });

  it('Vehicle can be constructed from literals (SeatCount is string)', () => {
    const vehicle: Vehicle = {
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
    };
    expectTypeOf(vehicle.SeatCount).toEqualTypeOf<string>();
  });

  it('Location can be constructed with all LocationType values', () => {
    const office: Location = {
      Id: 1, CompanyId: 1, Name: 'Борово', Type: 'Office', NameBg: 'Борово', Address: '',
    };
    const project: Location = {
      Id: 2, CompanyId: 1, Name: 'Обект А', Type: 'Project', NameBg: 'Обект А', Address: '',
    };
    const arch: Location = {
      Id: 3, CompanyId: 1, Name: 'Архитект', Type: 'Architect', NameBg: 'Архитект', Address: '',
    };
    const constr: Location = {
      Id: 4, CompanyId: 1, Name: 'Строител', Type: 'Constructor', NameBg: 'Строител', Address: '',
    };
    expectTypeOf(office.Type).toEqualTypeOf<'Office' | 'Constructor' | 'Architect' | 'Project'>();
    expectTypeOf(project).toMatchTypeOf<Location>();
    expectTypeOf(arch).toMatchTypeOf<Location>();
    expectTypeOf(constr).toMatchTypeOf<Location>();
  });

  it('RouteLeg can be constructed from literals', () => {
    const leg: RouteLeg = {
      Id: 1,
      RouteName: 'Борово - Козлодуй',
      StartPointId: 1,
      EndPointId: 2,
      DistanceKm: 35,
    };
    expectTypeOf(leg).toMatchTypeOf<RouteLeg>();
  });

  it('Invoice can be constructed from literals', () => {
    const invoice: Invoice = {
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
      DriveFileId: 'some-drive-id',
    };
    expectTypeOf(invoice).toMatchTypeOf<Invoice>();
  });

  it('FuelEvent can be constructed from literals', () => {
    const event: FuelEvent = {
      date: new Date('2026-01-10'),
      vendor: 'Лукойл',
      liters: 40,
      unitPrice: 2.89,
      totalAmount: 115.60,
    };
    expectTypeOf(event).toMatchTypeOf<FuelEvent>();
  });

  it('Holiday can be constructed from a Date', () => {
    const holiday: Holiday = { date: new Date('2026-01-01') };
    expectTypeOf(holiday).toMatchTypeOf<Holiday>();
  });

  it('GeneratedRow covers all four RowKinds', () => {
    const opening: GeneratedRow = {
      kind: 'opening', date: null, route: 'Начално количество',
      km: null, avgConsumption: null, consumed: null, fueled: null, balance: 5.0,
    };
    const fuel: GeneratedRow = {
      kind: 'fuel', date: new Date('2026-01-10'), route: 'Зареждане гориво - Лукойл - 40 л * 2.89 лв/л = 115.60 лв общо',
      km: null, avgConsumption: null, consumed: null, fueled: 40, balance: 45.0,
    };
    const trip: GeneratedRow = {
      kind: 'trip', date: new Date('2026-01-12'), route: 'Борово - Козлодуй - Борово',
      km: 70, avgConsumption: 11.5, consumed: 8.05, fueled: null, balance: 36.95,
    };
    const zero: GeneratedRow = {
      kind: 'zero', date: new Date('2026-01-13'), route: null,
      km: null, avgConsumption: 11.5, consumed: 0, fueled: null, balance: 36.95,
    };
    expectTypeOf(opening.kind).toEqualTypeOf<'opening' | 'fuel' | 'trip' | 'zero'>();
    expectTypeOf(fuel).toMatchTypeOf<GeneratedRow>();
    expectTypeOf(trip).toMatchTypeOf<GeneratedRow>();
    expectTypeOf(zero).toMatchTypeOf<GeneratedRow>();
  });

  it('MonthSheet can be constructed from literals', () => {
    const sheet: MonthSheet = {
      year: 2026,
      month: 1,
      company: {
        Id: 1, Name: 'Уи Денс ЕООД', Eik: '206123456',
        Address: 'ул. Примерна 1, Борово', ReportingYear: 2026,
      },
      vehicle: {
        Id: 1, CompanyId: 1, Name: 'Mercedes GLC', RegistrationNumber: 'СА 1234 ВС',
        FuelType: 'дизел', SeatCount: '4+1', AverageConsumptionLitersPer100Km: 11.5,
        TankCapacityLiters: 66, IsActive: true, OpeningFuelBalance: 5.0,
      },
      rows: [],
    };
    expectTypeOf(sheet.month).toEqualTypeOf<number>();
    expectTypeOf(sheet.rows).toMatchTypeOf<readonly GeneratedRow[]>();
  });
});
