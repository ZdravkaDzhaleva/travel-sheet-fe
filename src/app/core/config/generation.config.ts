// Trip-generation constants. See ARCHITECTURE §6b and §7.
// Change defaults here AND update the Defaults block in TASKS.md.

export const BALANCE_MIN = 0;   // liters — closing balance lower bound
export const BALANCE_MAX = 8;   // liters — closing balance upper bound

export const MAX_STOPS_PER_DAY = 3;  // D1 default (from 2025 reference)
export const MAX_KM_PER_DAY    = 80; // D1 default (from 2025 reference)

export const ARCH_VISITS_PER_WEEK = 1;  // §6b: ~one architect visit/week
export const CONS_VISITS_PER_WEEK = 1;  // §6b: ~one constructor visit/week
export const ROUTE_VARIETY_TOP_N  = 3;  // randomise among this many closest-km candidates
