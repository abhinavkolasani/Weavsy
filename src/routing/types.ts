import type { Coordinates } from '../world/types.ts';
import type { Transportation } from '../planning/types.ts';
export interface RouteEstimate {
  minutes: number;
  distanceMetres: number;
  requestedMode: Transportation;
  actualMode: 'driving' | 'walking';
  source: 'osrm-road-network' | 'google-routes' | 'same-location';
  geometry?: { type: 'LineString'; coordinates: number[][] };
}
export interface RouteMatrix { points: Coordinates[]; legs: (RouteEstimate | null)[][] }
export interface RoutingService {
  getMatrix(points: Coordinates[], mode: Transportation): Promise<RouteMatrix>;
  getRouteEstimate(origin: Coordinates, destination: Coordinates, mode: Transportation): Promise<RouteEstimate | null>;
}
