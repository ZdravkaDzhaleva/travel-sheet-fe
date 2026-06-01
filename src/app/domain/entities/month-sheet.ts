import { Company } from './company';
import { GeneratedRow } from './generated-row';
import { Vehicle } from './vehicle';

export interface MonthSheet {
  readonly year: number;
  readonly month: number; // 1–12
  readonly company: Company;
  readonly vehicle: Vehicle;
  readonly rows: readonly GeneratedRow[];
}
