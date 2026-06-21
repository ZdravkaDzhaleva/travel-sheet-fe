// Trip-generation constants. See ARCHITECTURE §6b and §7.
// Change defaults here AND update the Defaults block in TASKS.md.

export const BALANCE_MIN = 0;   // liters — running balance lower bound (never negative)

// liters — how far below a full tank a refuel may land. A fuel event fills the
// tank to full, so the post-fuel balance must land in
// [TankCapacityLiters − FUEL_FILL_TOLERANCE_L, TankCapacityLiters]. Equivalently
// the trips must drain the balance to [C − liters − τ, C − liters] just before
// each top-up. See ARCHITECTURE §6b.
export const FUEL_FILL_TOLERANCE_L = 0.5;

export const MAX_STOPS_PER_DAY = 5;  // D1 default (from 2025 reference)
export const MAX_KM_PER_DAY    = 110; // D1 default (from 2025 reference)

export const ARCH_VISITS_PER_WEEK = 1;  // §6b: ~one architect visit/week
export const CONS_VISITS_PER_WEEK = 1;  // §6b: ~one constructor visit/week
export const CTRL_VISITS_PER_WEEK = 1;  // §6b: ~one control visit/week
