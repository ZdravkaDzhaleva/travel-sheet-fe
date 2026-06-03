import { describe, it, expect } from 'vitest';
import { toSheetCells, type Period } from './row-mapper';
import type { CellModel } from './cell-model';
import { makeCompany, makeVehicle } from '../../../test-fixtures/index';
import type { GeneratedRow } from '../entities/index';

// ── Helpers ──────────────────────────────────────────────────────────────────

function byA1(cells: readonly CellModel[], a1: string): CellModel {
  const found = cells.find(c => c.a1 === a1);
  if (!found) throw new Error(`No cell at ${a1}`);
  return found;
}

function maybeA1(cells: readonly CellModel[], a1: string): CellModel | undefined {
  return cells.find(c => c.a1 === a1);
}

// A fixed minimal set of GeneratedRow values — covers every row kind.
// 5 L opening → +40 L fuel on 2026-01-10 → 50 km trip → zero-trip day.
const FIXED_ROWS: GeneratedRow[] = [
  {
    kind: 'opening',
    date: null,
    route: 'Начално количество',
    km: null,
    avgConsumption: null,
    consumed: null,
    fueled: null,
    balance: 5,
  },
  {
    kind: 'fuel',
    date: new Date(2026, 0, 10),
    route: 'Зареждане гориво - Лукойл - 40.00 л * 2.89 лв/л = 115.60 лв общо',
    km: null,
    avgConsumption: null,
    consumed: null,
    fueled: 40,
    balance: 45,
  },
  {
    kind: 'trip',
    date: new Date(2026, 0, 12),
    route: 'Борово - Козлодуй - Борово',
    km: 70,
    avgConsumption: 11.5,
    consumed: 8.05,
    fueled: null,
    balance: 36.95,
  },
  {
    kind: 'zero',
    date: new Date(2026, 0, 13),
    route: null,
    km: 0,
    avgConsumption: 11.5,
    consumed: 0,
    fueled: null,
    balance: 36.95,
  },
];

const company = makeCompany();
const vehicle = makeVehicle();
const period: Period = { year: 2026, month: 1 };
const cells = toSheetCells(FIXED_ROWS, company, vehicle, period);

// ── Header region ────────────────────────────────────────────────────────────

describe('toSheetCells — header region', () => {
  it('A1 = company name (bold)', () => {
    const c = byA1(cells, 'A1');
    expect(c.value).toBe('Уи Денс ЕООД');
    expect(c.bold).toBe(true);
  });

  it('A2 = "ЕИК: 206884907"', () => {
    expect(byA1(cells, 'A2').value).toBe('ЕИК: 206884907');
  });

  it('A3 = company address', () => {
    expect(byA1(cells, 'A3').value).toBe('с. Борово, общ. Борово, обл. Русе');
  });

  it('A5 = title "П Ъ Т Е Н   Л И С Т" (bold)', () => {
    const c = byA1(cells, 'A5');
    expect(c.value).toBe('П Ъ Т Е Н   Л И С Т');
    expect(c.bold).toBe(true);
  });

  it('D7 = period text "За период: 01.01.2026 - 31.01.2026"', () => {
    expect(byA1(cells, 'D7').value).toBe('За период: 01.01.2026 - 31.01.2026');
  });

  it('period for February 2026 ends on 28', () => {
    const feb = toSheetCells(FIXED_ROWS, company, vehicle, { year: 2026, month: 2 });
    expect(byA1(feb, 'D7').value).toBe('За период: 01.02.2026 - 28.02.2026');
  });
});

// ── Vehicle / seats / fuel rows ─────────────────────────────────────────────

describe('toSheetCells — vehicle & seats', () => {
  it('A9 = "Автомобил", C9 = model, D9 = "рег. №", E9 = plate', () => {
    expect(byA1(cells, 'A9').value).toBe('Автомобил');
    expect(byA1(cells, 'C9').value).toBe('Mercedes GLC');
    expect(byA1(cells, 'D9').value).toBe('рег. №');
    expect(byA1(cells, 'E9').value).toBe('СА 1234 ВС');
  });

  it('A10 = "Брой места:", C10 = seat count (verbatim), D10 = "гориво", E10 = fuel type', () => {
    expect(byA1(cells, 'A10').value).toBe('Брой места:');
    expect(byA1(cells, 'C10').value).toBe('4+1');
    expect(byA1(cells, 'D10').value).toBe('гориво');
    expect(byA1(cells, 'E10').value).toBe('дизел');
  });
});

// ── Column headers (row 12) ──────────────────────────────────────────────────

describe('toSheetCells — column headers (row 12)', () => {
  const expected: readonly [string, string][] = [
    ['A12', '№'],
    ['B12', 'Дата'],
    ['C12', 'Маршрут'],
    ['D12', 'пробег км.'],
    ['E12', 'Ср. Разход л./100км'],
    ['F12', 'Разход Общо литри'],
    ['G12', 'Заредено количество'],
    ['H12', 'Наличност литри'],
  ];

  for (const [a1, value] of expected) {
    it(`${a1} = "${value}" (bold)`, () => {
      const c = byA1(cells, a1);
      expect(c.value).toBe(value);
      expect(c.bold).toBe(true);
    });
  }
});

// ── Data rows (from row 13) ──────────────────────────────────────────────────

describe('toSheetCells — opening data row (13)', () => {
  it('A13 = 1, B13 absent (no date), C13 = "Начално количество", D13 = "х", H13 = 5', () => {
    expect(byA1(cells, 'A13').value).toBe(1);
    expect(maybeA1(cells, 'B13')).toBeUndefined();
    expect(byA1(cells, 'C13').value).toBe('Начално количество');
    expect(byA1(cells, 'D13').value).toBe('х');
    expect(byA1(cells, 'H13').value).toBe(5);
    expect(byA1(cells, 'C13').bold).toBe(false);
  });

  it('E13/F13/G13 are absent for the opening row', () => {
    expect(maybeA1(cells, 'E13')).toBeUndefined();
    expect(maybeA1(cells, 'F13')).toBeUndefined();
    expect(maybeA1(cells, 'G13')).toBeUndefined();
  });
});

describe('toSheetCells — fuel data row (14)', () => {
  it('A14 = 2; B14 = "10.01.2026"; C14 = byte-exact fuel string; G14 = 40; H14 = 45 - only C14 and H14 are bold', () => {
    expect(byA1(cells, 'A14').value).toBe(2);
    expect(byA1(cells, 'B14').value).toBe('10.01.2026');
    expect(byA1(cells, 'C14').value).toBe(
      'Зареждане гориво - Лукойл - 40.00 л * 2.89 лв/л = 115.60 лв общо',
    );
    expect(byA1(cells, 'G14').value).toBe(40);
    expect(byA1(cells, 'H14').value).toBe(45);
    expect(byA1(cells, 'C14').bold).toBe(true);
    expect(byA1(cells, 'H14').bold).toBe(true);
    expect(byA1(cells, 'D14').value).toBe('х');
  });

  it('D14/E14/F14 are absent for the fuel row', () => {
    expect(maybeA1(cells, 'E14')).toBeUndefined();
    expect(maybeA1(cells, 'F14')).toBeUndefined();
  });
});

describe('toSheetCells — trip data row (15)', () => {
  it('A15 = 3; B15 = "12.01.2026"; C15 = route string; D15 = 70; E15 = 11.5; F15 = 8.05; H15 = 36.95 — not bold', () => {
    expect(byA1(cells, 'A15').value).toBe(3);
    expect(byA1(cells, 'B15').value).toBe('12.01.2026');
    expect(byA1(cells, 'C15').value).toBe('Борово - Козлодуй - Борово');
    expect(byA1(cells, 'D15').value).toBe(70);
    expect(byA1(cells, 'E15').value).toBe(11.5);
    expect(byA1(cells, 'F15').value).toBe(8.05);
    expect(byA1(cells, 'H15').value).toBe(36.95);
    expect(byA1(cells, 'C15').bold).toBe(false);
  });

  it('G15 is absent (no fuel on a trip row)', () => {
    expect(maybeA1(cells, 'G15')).toBeUndefined();
  });
});

describe('toSheetCells — zero-trip data row (16)', () => {
  it('A16 = 4; B16 = "13.01.2026"; C16 absent; D16 absent; E16 = avg; F16 = 0; H16 = balance — not bold', () => {
    expect(byA1(cells, 'A16').value).toBe(4);
    expect(byA1(cells, 'B16').value).toBe('13.01.2026');
    expect(maybeA1(cells, 'C16')).toBeUndefined();
    expect(maybeA1(cells, 'D16')).toBeUndefined();
    expect(byA1(cells, 'E16').value).toBe(11.5);
    expect(byA1(cells, 'F16').value).toBe(0);
    expect(byA1(cells, 'H16').value).toBe(36.95);
  });

  it('G16 is absent (no fuel)', () => {
    expect(maybeA1(cells, 'G16')).toBeUndefined();
  });
});

// ── Closing + Totals rows ────────────────────────────────────────────────────

describe('toSheetCells — closing and totals', () => {
  // After 4 data rows starting at 13, closing row is at 17, totals row at 18.
  it('C17 = "Крайно количество"; H17 = closing balance 36.95', () => {
    expect(byA1(cells, 'C17').value).toBe('Крайно количество');
    expect(byA1(cells, 'H17').value).toBe(36.95);
  });

  it('C18 = "Общо количество" (bold); F18 = Σ consumed = 8.05; G18 = Σ fueled = 40', () => {
    expect(byA1(cells, 'C18').value).toBe('Общо количество');
    expect(byA1(cells, 'C18').bold).toBe(true);
    expect(byA1(cells, 'F18').value).toBe(8.05);
    expect(byA1(cells, 'G18').value).toBe(40);
  });
});

// ── Signatures ───────────────────────────────────────────────────────────────

describe('toSheetCells — signatures', () => {
  // One blank row after totals (row 19), then signature label row 20, подпис row 21.
  it('footer: A22 = "Водач", A23 = "Одобрил"', () => {
    expect(byA1(cells, 'A22').value).toBe('Водач');
    expect(byA1(cells, 'A23').value).toBe('Одобрил');
  });

  it('footer row 21: C21 = "име", D21 = "дата", E21 = "подпис"', () => {
    expect(byA1(cells, 'C21').value).toBe('име');
    expect(byA1(cells, 'D21').value).toBe('дата');
    expect(byA1(cells, 'E21').value).toBe('подпис');
  });
});

// ── Determinism ──────────────────────────────────────────────────────────────

describe('toSheetCells — determinism', () => {
  it('produces the same output across runs given identical input', () => {
    const a = toSheetCells(FIXED_ROWS, company, vehicle, period);
    const b = toSheetCells(FIXED_ROWS, company, vehicle, period);
    expect(a).toEqual(b);
  });
});

// ── Number formats ───────────────────────────────────────────────────────────

describe('toSheetCells — number formats', () => {
  it('liter cells carry the FMT_LITERS pattern', () => {
    expect(byA1(cells, 'F15').format).toBe('#,##0.00'); // consumed
    expect(byA1(cells, 'G14').format).toBe('#,##0.00'); // fueled
    expect(byA1(cells, 'H13').format).toBe('#,##0.00'); // balance
    expect(byA1(cells, 'F18').format).toBe('#,##0.00'); // total consumed
  });
});
