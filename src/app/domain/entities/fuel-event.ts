// Projection of Invoice used by TripGenerator.
// Fields needed to emit a fuel row and update the running balance.
export interface FuelEvent {
  readonly date: Date;
  readonly vendor: string;
  readonly liters: number;
  readonly unitPrice: number;
  readonly totalAmount: number;
}
