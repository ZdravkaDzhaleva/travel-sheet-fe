import type { RouteLeg } from '../entities/index';
import { MissingRouteLegError } from './missing-route-leg.error';

/**
 * Looks up the distance between two locations (undirected).
 * Throws MissingRouteLegError if no leg exists for the pair.
 */
export function legDistance(
  aId: number,
  bId: number,
  legs: readonly RouteLeg[],
): number {
  const leg = legs.find(
    l =>
      (l.StartPointId === aId && l.EndPointId === bId) ||
      (l.StartPointId === bId && l.EndPointId === aId),
  );
  if (leg === undefined) {
    throw new MissingRouteLegError(aId, bId);
  }
  return leg.DistanceKm;
}

/**
 * Sums consecutive pairwise legs for a route: Office → stop1 → … → stopN → Office.
 * `stopIds` is the list of intermediate stop IDs (not including the office endpoints).
 * The first and last elements of the full path are both the officeId.
 */
export function routeDistance(
  officeId: number,
  stopIds: readonly number[],
  legs: readonly RouteLeg[],
): number {
  const path = [officeId, ...stopIds, officeId];
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    total += legDistance(path[i], path[i + 1], legs);
  }
  return total;
}
