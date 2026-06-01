// RowKind drives RowMapper formatting and bold rules.
// - opening: the "Начално количество" row (no date, no km)
// - fuel:    a "Зареждане гориво …" row (no km/avg/consumed)
// - trip:    a normal working-day route row
// - zero:    a working day with no travel (date + avg, 0 consumed, balance unchanged)
export type RowKind = 'opening' | 'fuel' | 'trip' | 'zero';

export interface GeneratedRow {
  readonly kind: RowKind;
  readonly date: Date | null;          // null for opening row
  readonly route: string | null;       // null for zero-trip rows
  readonly km: number | null;          // null for opening / fuel / zero rows
  readonly avgConsumption: number | null; // null for opening / fuel rows
  readonly consumed: number | null;    // null for opening / fuel rows
  readonly fueled: number | null;      // null for trip / zero rows
  readonly balance: number;            // always present
}
