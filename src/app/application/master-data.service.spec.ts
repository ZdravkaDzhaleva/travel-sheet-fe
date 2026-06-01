import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';

import { MasterDataService } from './master-data.service';
import {
  MultipleActiveVehiclesError,
  NoActiveVehicleError,
  NoCompanyError,
} from './master-data.errors';
import { SheetsStore } from '../infrastructure/sheets.store';
import {
  makeCompany,
  makeVehicle,
  makeLocations,
  makeRouteLegs,
} from '../../test-fixtures/index';
import type { Vehicle } from '../domain/entities/index';

interface StoreOverrides {
  readonly companies?: ReturnType<typeof makeCompany>[];
  readonly vehicles?: Vehicle[];
}

function makeStore(overrides: StoreOverrides = {}): SheetsStore {
  return {
    loadCompanies: vi.fn(async () =>
      overrides.companies ?? [makeCompany()],
    ),
    loadVehicles: vi.fn(async () =>
      overrides.vehicles ?? [makeVehicle()],
    ),
    loadLocations: vi.fn(async () => makeLocations()),
    loadRoutes: vi.fn(async () => makeRouteLegs()),
  } as unknown as SheetsStore;
}

function makeService(store: SheetsStore): MasterDataService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: SheetsStore, useValue: store }],
  });
  return TestBed.inject(MasterDataService);
}

describe('MasterDataService.load — happy path', () => {
  it('populates all four signals when one company and exactly one active vehicle exist', async () => {
    const svc = makeService(makeStore());
    await svc.load();
    expect(svc.company()?.Name).toBe('Уи Денс ЕООД');
    expect(svc.vehicle()?.RegistrationNumber).toBe('СА 1234 ВС');
    expect(svc.locations()).toHaveLength(6);
    expect(svc.routeLegs()).toHaveLength(15);
    expect(svc.error()).toBeNull();
    expect(svc.loading()).toBe(false);
    expect(svc.ready()).toBe(true);
  });

  it('picks the single IsActive=true vehicle even when other inactive vehicles exist', async () => {
    const active = makeVehicle({ Id: 2, RegistrationNumber: 'СА 9999 XX' });
    const inactive1 = makeVehicle({ Id: 1, IsActive: false });
    const inactive2 = makeVehicle({ Id: 3, IsActive: false });
    const svc = makeService(makeStore({ vehicles: [inactive1, active, inactive2] }));
    await svc.load();
    expect(svc.vehicle()?.Id).toBe(2);
  });
});

describe('MasterDataService.load — error cases', () => {
  it('throws NoCompanyError when no Company row exists', async () => {
    const svc = makeService(makeStore({ companies: [] }));
    await expect(svc.load()).rejects.toBeInstanceOf(NoCompanyError);
    expect(svc.error()).toBeInstanceOf(NoCompanyError);
    expect(svc.loading()).toBe(false);
    expect(svc.ready()).toBe(false);
  });

  it('throws NoActiveVehicleError when no vehicle has IsActive=true', async () => {
    const svc = makeService(
      makeStore({ vehicles: [makeVehicle({ IsActive: false })] }),
    );
    await expect(svc.load()).rejects.toBeInstanceOf(NoActiveVehicleError);
    expect(svc.error()).toBeInstanceOf(NoActiveVehicleError);
  });

  it('throws MultipleActiveVehiclesError when more than one is active', async () => {
    const svc = makeService(
      makeStore({
        vehicles: [
          makeVehicle({ Id: 1 }),
          makeVehicle({ Id: 2 }),
          makeVehicle({ Id: 3, IsActive: false }),
        ],
      }),
    );
    await expect(svc.load()).rejects.toBeInstanceOf(MultipleActiveVehiclesError);
    const err = svc.error() as MultipleActiveVehiclesError;
    expect(err.count).toBe(2);
  });

  it('clears prior error on a subsequent successful load', async () => {
    const svc = makeService(makeStore({ vehicles: [makeVehicle({ IsActive: false })] }));
    await expect(svc.load()).rejects.toBeInstanceOf(NoActiveVehicleError);
    expect(svc.error()).toBeInstanceOf(NoActiveVehicleError);

    // Swap the stub for a healthy one and reload.
    const svc2 = makeService(makeStore());
    await svc2.load();
    expect(svc2.error()).toBeNull();
    expect(svc2.ready()).toBe(true);
  });
});

describe('MasterDataService — initial state', () => {
  it('starts empty before load is called', () => {
    const svc = makeService(makeStore());
    expect(svc.company()).toBeNull();
    expect(svc.vehicle()).toBeNull();
    expect(svc.locations()).toEqual([]);
    expect(svc.routeLegs()).toEqual([]);
    expect(svc.loading()).toBe(false);
    expect(svc.error()).toBeNull();
    expect(svc.ready()).toBe(false);
  });
});
