import { Injectable, computed, inject, signal } from '@angular/core';

import { GoogleAuth } from '../core/auth/google-auth';
import { SheetsStore } from '../infrastructure/sheets.store';
import type {
  Company,
  Location,
  RouteLeg,
  Vehicle,
} from '../domain/entities/index';
import {
  MultipleActiveVehiclesError,
  NoActiveVehicleError,
  NoCompanyError,
} from './master-data.errors';

@Injectable({ providedIn: 'root' })
export class MasterDataService {
  private readonly store = inject(SheetsStore);
  private readonly auth = inject(GoogleAuth);

  private readonly _company = signal<Company | null>(null);
  private readonly _vehicle = signal<Vehicle | null>(null);
  private readonly _locations = signal<readonly Location[]>([]);
  private readonly _routeLegs = signal<readonly RouteLeg[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<Error | null>(null);

  readonly company = this._company.asReadonly();
  readonly vehicle = this._vehicle.asReadonly();
  readonly locations = this._locations.asReadonly();
  readonly routeLegs = this._routeLegs.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly ready = computed(
    () => this._company() !== null && this._vehicle() !== null,
  );

  /**
   * @param options.forceConsent re-runs the Google consent prompt before
   *   loading (used by the Company-info Retry to recover from a silent GIS
   *   failure). The consent token is cached, so the data calls reuse it.
   */
  async load(options: { forceConsent?: boolean } = {}): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    try {
      if (options.forceConsent) {
        await this.auth.reauthorize();
      }
      const [companies, vehicles, locations, routeLegs] = await Promise.all([
        this.store.loadCompanies(),
        this.store.loadVehicles(),
        this.store.loadLocations(),
        this.store.loadRoutes(),
      ]);

      if (companies.length === 0) throw new NoCompanyError();
      const active = vehicles.filter(v => v.IsActive);
      if (active.length === 0) throw new NoActiveVehicleError();
      if (active.length > 1) throw new MultipleActiveVehiclesError(active.length);

      this._company.set(companies[0]);
      this._vehicle.set(active[0]);
      this._locations.set(locations);
      this._routeLegs.set(routeLegs);
    } catch (err) {
      this._error.set(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      this._loading.set(false);
    }
  }

  /**
   * Lazily loads master data exactly once. Centralizes the first-load guard
   * that every feature page would otherwise re-implement in `ngOnInit`; safe to
   * call from each page. The initial attempt is silent (no consent prompt) and
   * never rejects — failures surface through the `error` signal.
   */
  async ensureLoaded(): Promise<void> {
    if (this.ready() || this.loading() || this.error() !== null) return;
    await this.load().catch(() => undefined);
  }
}
