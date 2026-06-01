// Undirected pairwise distance between two locations.
// Look up by matching {StartPointId, EndPointId} in either order.
export interface RouteLeg {
  readonly Id: number;
  readonly RouteName: string;
  readonly StartPointId: number;
  readonly EndPointId: number;
  readonly DistanceKm: number;
}
