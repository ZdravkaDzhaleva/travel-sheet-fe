import type { Holiday } from '../app/domain/entities/index';

// Official Bulgarian public holidays for 2026.
// Orthodox Easter 2026: April 12 (Julian Mar 30 + 13-day Gregorian offset).
// Fixed holidays per the Bulgarian Labour Code.
export function make2026Holidays(): Holiday[] {
  return [
    { date: new Date('2026-01-01') }, // Нова година
    { date: new Date('2026-03-03') }, // Ден на Освобождението
    { date: new Date('2026-04-10') }, // Разпети петък (Orthodox Good Friday)
    { date: new Date('2026-04-12') }, // Великден (Orthodox Easter Sunday)
    { date: new Date('2026-04-13') }, // Великден (Orthodox Easter Monday)
    { date: new Date('2026-05-01') }, // Ден на труда
    { date: new Date('2026-05-06') }, // Гергьовден / Ден на храбростта
    { date: new Date('2026-05-24') }, // Ден на българската просвета и култура
    { date: new Date('2026-09-06') }, // Ден на Съединението
    { date: new Date('2026-09-22') }, // Ден на Независимостта
    { date: new Date('2026-11-01') }, // Ден на народните будители
    { date: new Date('2026-12-24') }, // Бъдни вечер
    { date: new Date('2026-12-25') }, // Рождество Христово
    { date: new Date('2026-12-26') }, // Рождество Христово (втори ден)
  ];
}

// Returns dates only — the form WorkingDayCalendar accepts.
export function make2026HolidayDates(): Date[] {
  return make2026Holidays().map(h => h.date);
}
