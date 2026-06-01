import type { RouteLeg } from '../app/domain/entities/index';

// All C(6,2) = 15 undirected pairwise legs for the 6 fixture locations.
// Location IDs: 1=Борово(Office), 2=Козлодуй, 3=Оряхово, 4=Бяла Слатина,
//               5=Враца(Architect), 6=Плевен(Constructor).
// Distances are approximate road km between Bulgarian towns.
export function makeRouteLegs(): RouteLeg[] {
  return [
    { Id:  1, RouteName: 'Борово - Козлодуй',        StartPointId: 1, EndPointId: 2, DistanceKm: 35 },
    { Id:  2, RouteName: 'Борово - Оряхово',          StartPointId: 1, EndPointId: 3, DistanceKm: 40 },
    { Id:  3, RouteName: 'Борово - Бяла Слатина',     StartPointId: 1, EndPointId: 4, DistanceKm: 30 },
    { Id:  4, RouteName: 'Борово - Враца',             StartPointId: 1, EndPointId: 5, DistanceKm: 55 },
    { Id:  5, RouteName: 'Борово - Плевен',            StartPointId: 1, EndPointId: 6, DistanceKm: 65 },
    { Id:  6, RouteName: 'Козлодуй - Оряхово',        StartPointId: 2, EndPointId: 3, DistanceKm: 20 },
    { Id:  7, RouteName: 'Козлодуй - Бяла Слатина',   StartPointId: 2, EndPointId: 4, DistanceKm: 45 },
    { Id:  8, RouteName: 'Козлодуй - Враца',           StartPointId: 2, EndPointId: 5, DistanceKm: 55 },
    { Id:  9, RouteName: 'Козлодуй - Плевен',          StartPointId: 2, EndPointId: 6, DistanceKm: 80 },
    { Id: 10, RouteName: 'Оряхово - Бяла Слатина',    StartPointId: 3, EndPointId: 4, DistanceKm: 50 },
    { Id: 11, RouteName: 'Оряхово - Враца',            StartPointId: 3, EndPointId: 5, DistanceKm: 60 },
    { Id: 12, RouteName: 'Оряхово - Плевен',           StartPointId: 3, EndPointId: 6, DistanceKm: 85 },
    { Id: 13, RouteName: 'Бяла Слатина - Враца',       StartPointId: 4, EndPointId: 5, DistanceKm: 30 },
    { Id: 14, RouteName: 'Бяла Слатина - Плевен',      StartPointId: 4, EndPointId: 6, DistanceKm: 50 },
    { Id: 15, RouteName: 'Враца - Плевен',             StartPointId: 5, EndPointId: 6, DistanceKm: 75 },
  ];
}
