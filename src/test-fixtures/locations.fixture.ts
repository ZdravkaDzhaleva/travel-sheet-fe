import type { Location } from '../app/domain/entities/index';

// 6 locations mirroring the real supporting sheet.
// Location 1 (Office, Борово) is the trip origin/terminus for every route.
// IDs 2–4 are Project sites; 5 is the Architect; 6 is the Constructor.
export function makeLocations(): Location[] {
  return [
    {
      Id: 1,
      CompanyId: 1,
      Name: 'Борово',
      Type: 'Office',
      NameBg: 'Борово',
      Address: 'с. Борово, общ. Борово, обл. Русе',
    },
    {
      Id: 2,
      CompanyId: 1,
      Name: 'Козлодуй',
      Type: 'Project',
      NameBg: 'Козлодуй',
      Address: 'гр. Козлодуй, обл. Враца',
    },
    {
      Id: 3,
      CompanyId: 1,
      Name: 'Оряхово',
      Type: 'Project',
      NameBg: 'Оряхово',
      Address: 'гр. Оряхово, обл. Враца',
    },
    {
      Id: 4,
      CompanyId: 1,
      Name: 'Бяла Слатина',
      Type: 'Project',
      NameBg: 'Бяла Слатина',
      Address: 'гр. Бяла Слатина, обл. Враца',
    },
    {
      Id: 5,
      CompanyId: 1,
      Name: 'Враца',
      Type: 'Architect',
      NameBg: 'Враца',
      Address: 'гр. Враца, обл. Враца',
    },
    {
      Id: 6,
      CompanyId: 1,
      Name: 'Плевен',
      Type: 'Constructor',
      NameBg: 'Плевен',
      Address: 'гр. Плевен, обл. Плевен',
    },
  ];
}

// Returns only the single Office location.
export function makeOfficeLocation(): Location {
  return makeLocations().find(l => l.Type === 'Office')!;
}
