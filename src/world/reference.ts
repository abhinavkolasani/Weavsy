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
  const common=typeof v.display_name === 'string' && !!v.display_name.trim()
    && (v.formatted_address === null || typeof v.formatted_address === 'string')
    && (v.primary_type === null || typeof v.primary_type === 'string') && Array.isArray(v.additional_types) && v.additional_types.every(t => typeof t === 'string')
    && typeof v.fetched_at === 'string' && !Number.isNaN(Date.parse(v.fetched_at)) && !!v.provider_metadata
    && ['not_requested','available','unavailable'].includes(v.provider_metadata.details_status);
  if(!common)return false;
  if(v.provider==='google')return isGooglePlaceId(v.provider_place_id)&&v.data_status==='provider'&&v.provider_metadata.lookup_source==='google-places-new'&&v.provider_metadata.country_code==='US';
  return v.provider === 'openstreetmap' && !!parsed && v.data_status==='community' && v.provider_metadata.osm_type === parsed.type && v.provider_metadata.osm_id === parsed.id
    && ['photon','overpass'].includes(v.provider_metadata.lookup_source)
    && ['point','representative_point'].includes(v.provider_metadata.geometry_kind)
    && ['not_requested','available','unavailable'].includes(v.provider_metadata.details_status);
}
export const isGooglePlaceId=(id:unknown):id is string=>typeof id==='string'&&/^[A-Za-z0-9_-]{10,255}$/.test(id);
export const placeUrl = (place: PlaceReference) => place.provider==='google'?'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(place.display_name)+'&query_place_id='+encodeURIComponent(place.provider_place_id):`https://www.openstreetmap.org/${place.provider_place_id}`;
