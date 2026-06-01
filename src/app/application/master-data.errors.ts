/** No Company row found in the supporting sheet. */
export class NoCompanyError extends Error {
  constructor() {
    super('No Company row found in the supporting sheet — add one before generating');
    this.name = 'NoCompanyError';
  }
}

/** No Vehicle row has IsActive = TRUE. */
export class NoActiveVehicleError extends Error {
  constructor() {
    super('No active Vehicle found — set exactly one Vehicle.IsActive to TRUE');
    this.name = 'NoActiveVehicleError';
  }
}

/** More than one Vehicle row has IsActive = TRUE. */
export class MultipleActiveVehiclesError extends Error {
  constructor(readonly count: number) {
    super(`Found ${count} active vehicles — exactly one Vehicle.IsActive must be TRUE`);
    this.name = 'MultipleActiveVehiclesError';
  }
}
