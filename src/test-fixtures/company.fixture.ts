import type { Company } from '../app/domain/entities/index';

export function makeCompany(overrides: Partial<Company> = {}): Company {
  return {
    Id: 1,
    Name: 'Уи Денс ЕООД',
    Eik: '206884907',
    Address: 'с. Борово, общ. Борово, обл. Русе',
    ReportingYear: 2026,
    ...overrides,
  };
}
