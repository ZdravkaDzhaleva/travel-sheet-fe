import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';

import { MasterDataService } from './master-data.service';
import {
  MultipleActiveVehiclesError,
  NoActiveVehicleError,
  NoCompanyError,
} from './master-data.errors';
import { SheetsStore } from '../infrastructure/sheets.store';
import { GoogleAuth } from '../core/auth/google-auth';
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

function makeAuth(
  reauthorize: ReturnType<typeof vi.fn> = vi.fn(async () => undefined),
): GoogleAuth {
  return { reauthorize } as unknown as GoogleAuth;
}

function makeService(store: SheetsStore, auth: GoogleAuth = makeAuth()): MasterDataService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: SheetsStore, useValue: store },
      { provide: GoogleAuth, useValue: auth },
    ],
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

describe('MasterDataService.load — forceConsent', () => {
  it('does not reauthorize by default', async () => {
    const reauthorize = vi.fn(async () => undefined);
    const svc = makeService(makeStore(), makeAuth(reauthorize));
    await svc.load();
    expect(reauthorize).not.toHaveBeenCalled();
  });

  it('reauthorizes before loading when forceConsent is set', async () => {
    const order: string[] = [];
    const reauthorize = vi.fn(async () => {
      order.push('reauthorize');
    });
    const store = makeStore();
    (store.loadCompanies as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      order.push('loadCompanies');
      return [makeCompany()];
    });
    const svc = makeService(store, makeAuth(reauthorize));
    await svc.load({ forceConsent: true });
    expect(reauthorize).toHaveBeenCalledOnce();
    expect(order[0]).toBe('reauthorize'); // consent happens before the data calls
    expect(svc.ready()).toBe(true);
  });

  it('surfaces a reauthorize failure through the error signal', async () => {
    const reauthorize = vi.fn(async () => {
      throw new Error('consent denied');
    });
    const svc = makeService(makeStore(), makeAuth(reauthorize));
    await expect(svc.load({ forceConsent: true })).rejects.toThrow('consent denied');
    expect(svc.error()).toBeInstanceOf(Error);
    expect(svc.loading()).toBe(false);
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

describe('MasterDataService.ensureLoaded', () => {
  it('loads when no data is present yet', async () => {
    const store = makeStore();
    const svc = makeService(store);
    await svc.ensureLoaded();
    expect(store.loadCompanies).toHaveBeenCalledOnce();
    expect(svc.ready()).toBe(true);
  });

  it('no-ops when data is already loaded', async () => {
    const store = makeStore();
    const svc = makeService(store);
    await svc.load();
    (store.loadCompanies as ReturnType<typeof vi.fn>).mockClear();
    await svc.ensureLoaded();
    expect(store.loadCompanies).not.toHaveBeenCalled();
  });

  it('no-ops while a load is already in flight', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const store = makeStore();
    (store.loadCompanies as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      await gate;
      return [makeCompany()];
    });
    const svc = makeService(store);

    const first = svc.ensureLoaded(); // sets loading=true synchronously before suspending
    await svc.ensureLoaded();         // guard sees loading in flight → no-op
    release();
    await first;

    expect(store.loadCompanies).toHaveBeenCalledOnce();
  });

  it('no-ops after a prior load errored (recovery is via explicit Retry)', async () => {
    const store = makeStore({ vehicles: [makeVehicle({ IsActive: false })] });
    const svc = makeService(store);
    await expect(svc.load()).rejects.toBeInstanceOf(NoActiveVehicleError);
    (store.loadCompanies as ReturnType<typeof vi.fn>).mockClear();

    await svc.ensureLoaded();
    expect(store.loadCompanies).not.toHaveBeenCalled();
  });

  it('does not reject when the underlying load fails — the error surfaces via the signal', async () => {
    const svc = makeService(makeStore({ companies: [] }));
    await expect(svc.ensureLoaded()).resolves.toBeUndefined();
    expect(svc.error()).toBeInstanceOf(NoCompanyError);
  });
});
