export interface Coordinates { latitude: number; longitude: number }
export type OsmType = 'node' | 'way' | 'relation';
export interface PlaceReference extends Coordinates {
  provider: 'openstreetmap';
  provider_place_id: string; // node/123, way/123 or relation/123; namespace is significant.
  display_name: string;
  formatted_address: string | null;
  primary_type: string | null;
  additional_types: string[];
  fetched_at: string;
  data_status: 'community';
  provider_metadata: {
    osm_type: OsmType;
    osm_id: string;
    lookup_source: 'photon' | 'overpass';
    geometry_kind: 'point' | 'representative_point';
    details_status: 'not_requested' | 'available' | 'unavailable';
  };
}
export const WEEKDAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'] as const;
export interface OpeningHours {
  source_expression: string;
  // null = cannot safely interpret; [] = closed. No inferred local timezone.
  weekly: Record<typeof WEEKDAYS[number], {opens: string; closes: string}[]> | null;
}
export interface PlaceDetails {
  place: PlaceReference;
  opening_hours: OpeningHours | null;
  website: string | null;
  business_status: 'listed' | 'unavailable';
  estimated_cost_per_person: null;
  typical_duration_minutes: null;
  warnings: string[];
}
export type PlaceSearchType = 'food' | 'cafe' | 'dessert' | 'bowling' | 'activity' | 'shopping' | 'park';
export interface PlaceSearch {
  query: string;
  location?: Coordinates;
  radius?: number; // metres, used for category searches.
  types?: PlaceSearchType[];
  limit?: number;
  pricePreference?: number;
  openAt?: string;
}
export interface SearchResult { places: PlaceReference[]; context: Coordinates | null; warnings: string[] }
export interface WorldProvider {
  autocompleteLocation(query: string, bias?: Coordinates): Promise<PlaceReference[]>;
  autocompletePlace(query: string, bias?: Coordinates): Promise<PlaceReference[]>;
  searchPlaces(search: PlaceSearch): Promise<SearchResult>;
  getPlaceDetails(placeId: string): Promise<PlaceDetails>;
  // Interface preparation only: no traffic, routing or distance guesses.
  getRouteEstimate(origin: Coordinates, destination: Coordinates, mode: 'driving' | 'walking' | 'transit'): Promise<never>;
}
