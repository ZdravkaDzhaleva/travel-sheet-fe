import { describe, it, expect } from 'vitest';
import {
  makeCompany,
  makeVehicle,
  makeLocations,
  makeOfficeLocation,
  makeRouteLegs,
  makeInvoices,
  makeFuelEvents,
  make2026Holidays,
  make2026HolidayDates,
} from './index';

describe('makeCompany', () => {
  it('returns Уи Денс ЕООД with ReportingYear 2026', () => {
    const c = makeCompany();
    expect(c.Name).toBe('Уи Денс ЕООД');
    expect(c.ReportingYear).toBe(2026);
  });

  it('accepts partial overrides', () => {
    const c = makeCompany({ ReportingYear: 2027 });
    expect(c.ReportingYear).toBe(2027);
    expect(c.Name).toBe('Уи Денс ЕООД');
  });
});

describe('makeVehicle', () => {
  it('returns the active GLC with string SeatCount', () => {
    const v = makeVehicle();
    expect(v.Name).toBe('Mercedes GLC');
    expect(v.IsActive).toBe(true);
    expect(typeof v.SeatCount).toBe('string');
    expect(v.SeatCount).toBe('4+1');
  });

  it('AverageConsumptionLitersPer100Km is a number', () => {
    expect(typeof makeVehicle().AverageConsumptionLitersPer100Km).toBe('number');
  });
});

describe('makeLocations', () => {
  it('returns exactly 7 locations', () => {
    expect(makeLocations()).toHaveLength(7);
  });

  it('has exactly one Office', () => {
    const offices = makeLocations().filter(l => l.Type === 'Office');
    expect(offices).toHaveLength(1);
  });

  it('Office NameBg is Борово', () => {
    expect(makeOfficeLocation().NameBg).toBe('Борово');
  });

  it('has at least one Project, one Architect, one Constructor', () => {
    const locs = makeLocations();
    expect(locs.some(l => l.Type === 'Project')).toBe(true);
    expect(locs.some(l => l.Type === 'Architect')).toBe(true);
    expect(locs.some(l => l.Type === 'Constructor')).toBe(true);
  });
});

describe('makeRouteLegs', () => {
  it('returns exactly 15 legs (C(6,2) pairwise combinations)', () => {
    expect(makeRouteLegs()).toHaveLength(15);
  });

  it('all legs have positive distance', () => {
    makeRouteLegs().forEach(leg => expect(leg.DistanceKm).toBeGreaterThan(0));
  });

  it('IDs are unique and sequential from 1', () => {
    const ids = makeRouteLegs().map(l => l.Id);
    expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  });

  it('all location IDs referenced are in range [1, 6]', () => {
    makeRouteLegs().forEach(leg => {
      expect(leg.StartPointId).toBeGreaterThanOrEqual(1);
      expect(leg.StartPointId).toBeLessThanOrEqual(6);
      expect(leg.EndPointId).toBeGreaterThanOrEqual(1);
      expect(leg.EndPointId).toBeLessThanOrEqual(6);
    });
  });
});

describe('makeInvoices / makeFuelEvents', () => {
  it('returns 2 invoices in January 2026', () => {
    const invoices = makeInvoices();
    expect(invoices).toHaveLength(2);
    invoices.forEach(inv => {
      expect(inv.InvoiceDate.getFullYear()).toBe(2026);
      expect(inv.InvoiceDate.getMonth()).toBe(0); // January
    });
  });

  it('TotalAmount matches QuantityLiters * UnitPrice (rounded to 2 dp)', () => {
    makeInvoices().forEach(inv => {
      const expected = Math.round(inv.QuantityLiters * inv.UnitPrice * 100) / 100;
      expect(inv.TotalAmount).toBeCloseTo(expected, 2);
    });
  });

  it('FuelEvents mirror invoice fuel fields', () => {
    const events = makeFuelEvents();
    const invoices = makeInvoices();
    expect(events).toHaveLength(invoices.length);
    events.forEach((ev, i) => {
      expect(ev.liters).toBe(invoices[i].QuantityLiters);
      expect(ev.vendor).toBe(invoices[i].FuelVendor);
    });
  });
});

describe('make2026Holidays', () => {
  it('returns 14 Bulgarian public holidays for 2026', () => {
    expect(make2026Holidays()).toHaveLength(14);
  });

  it('all holidays are in year 2026', () => {
    make2026Holidays().forEach(h => {
      expect(h.date.getFullYear()).toBe(2026);
    });
  });

  it('January 1 is included', () => {
    const dates = make2026HolidayDates().map(d => d.toISOString().slice(0, 10));
    expect(dates).toContain('2026-01-01');
  });

  it('March 3 (National Day) is included', () => {
    const dates = make2026HolidayDates().map(d => d.toISOString().slice(0, 10));
    expect(dates).toContain('2026-03-03');
  });

  it('make2026HolidayDates returns plain Date[]', () => {
    const dates = make2026HolidayDates();
    expect(Array.isArray(dates)).toBe(true);
    expect(dates[0]).toBeInstanceOf(Date);
  });
});
