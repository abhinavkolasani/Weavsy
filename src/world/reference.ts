import type { Coordinates, PlaceReference, OsmType } from './types.ts';
export function parsePlaceId(id: string): {type: OsmType; id: string} | null {
  const match = /^(node|way|relation)\/([1-9]\d{0,15})$/.exec(id);
  return match ? {type: match[1] as OsmType, id: match[2]} : null;
}
export function validCoordinates(value: unknown): value is Coordinates {
  if (!value || typeof value !== 'object') return false;
  const v = value as Coordinates;
  return Number.isFinite(v.latitude) && Math.abs(v.latitude) <= 90 && Number.isFinite(v.longitude) && Math.abs(v.longitude) <= 180;
}
export function isPlaceReference(value: unknown): value is PlaceReference {
  if (!validCoordinates(value)) return false;
  const v = value as PlaceReference, parsed = typeof v.provider_place_id === 'string' && parsePlaceId(v.provider_place_id);
  return v.provider === 'openstreetmap' && !!parsed && typeof v.display_name === 'string' && !!v.display_name.trim()
    && (v.formatted_address === null || typeof v.formatted_address === 'string')
    && (v.primary_type === null || typeof v.primary_type === 'string') && Array.isArray(v.additional_types) && v.additional_types.every(t => typeof t === 'string')
    && v.data_status === 'community' && typeof v.fetched_at === 'string' && !Number.isNaN(Date.parse(v.fetched_at))
    && !!v.provider_metadata && v.provider_metadata.osm_type === parsed.type && v.provider_metadata.osm_id === parsed.id
    && ['photon','overpass'].includes(v.provider_metadata.lookup_source)
    && ['point','representative_point'].includes(v.provider_metadata.geometry_kind)
    && ['not_requested','available','unavailable'].includes(v.provider_metadata.details_status);
}
export const placeUrl = (place: PlaceReference) => `https://www.openstreetmap.org/${place.provider_place_id}`;
