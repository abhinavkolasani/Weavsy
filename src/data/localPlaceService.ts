import type { Place, PlaceQuery, PlaceService } from './types.ts';
import { PLACE_CATEGORIES } from './types.ts';
import { assertValidCatalog } from './validateCatalog.ts';

export class PlaceQueryError extends Error {
  constructor(message: string) { super(message); this.name = 'PlaceQueryError'; }
}
function validateQuery(query: PlaceQuery) {
  if (!query || typeof query !== 'object' || Array.isArray(query)) throw new PlaceQueryError('Place query must be an object.');
  const allowed = ['category', 'area', 'max_cost_per_person_cents', 'vibe_tags_any', 'occasion_tags_any', 'group_size', 'data_status', 'include_inactive'];
  for (const key of Object.keys(query)) if (!allowed.includes(key)) throw new PlaceQueryError(`Unknown place query field: ${key}.`);
  if (query.category !== undefined && !PLACE_CATEGORIES.includes(query.category)) throw new PlaceQueryError('Unknown place category.');
  if (query.area !== undefined && (typeof query.area !== 'string' || !query.area.trim())) throw new PlaceQueryError('Area must be a nonempty string.');
  if (query.max_cost_per_person_cents !== undefined && (!Number.isSafeInteger(query.max_cost_per_person_cents) || query.max_cost_per_person_cents < 0)) throw new PlaceQueryError('Maximum cost must be nonnegative whole cents.');
  if (query.group_size !== undefined && (!Number.isSafeInteger(query.group_size) || query.group_size < 1)) throw new PlaceQueryError('Group size must be a positive integer.');
  for (const field of ['vibe_tags_any', 'occasion_tags_any'] as const) {
    const value = query[field];
    if (value !== undefined && (!Array.isArray(value) || value.some(tag => typeof tag !== 'string' || !tag.trim()))) throw new PlaceQueryError(`${field} must be a list of nonempty tags.`);
  }
  if (query.include_inactive !== undefined && typeof query.include_inactive !== 'boolean') throw new PlaceQueryError('include_inactive must be a boolean.');
  if (query.data_status !== undefined && !['verified', 'estimated', 'synthetic'].includes(query.data_status)) throw new PlaceQueryError('Unknown data status.');
}

/** Internal adapter. Snapshot input and output so consumers cannot mutate the catalog. */
export function createLocalPlaceService(input: unknown): PlaceService {
  assertValidCatalog(input);
  const places: readonly Place[] = structuredClone(input);
  const byId = new Map(places.map(place => [place.place_id, place]));
  const service: PlaceService = {
    async listActivePlaces() { return service.queryPlaces(); },
    async getPlaceById(placeId) { return structuredClone(byId.get(placeId) ?? null); },
    async queryPlaces(query = {}) {
      validateQuery(query);
      return structuredClone(places.filter(place =>
        (query.include_inactive === true || place.active) &&
        (query.category === undefined || place.category === query.category) &&
        (query.area === undefined || place.area === query.area) &&
        (query.data_status === undefined || place.data_status === query.data_status) &&
        (query.max_cost_per_person_cents === undefined || place.estimated_cost_per_person.amount_cents <= query.max_cost_per_person_cents) &&
        (!query.vibe_tags_any?.length || query.vibe_tags_any.some(tag => place.vibe_tags.includes(tag))) &&
        (!query.occasion_tags_any?.length || query.occasion_tags_any.some(tag => place.occasion_tags.includes(tag))) &&
        (query.group_size === undefined || ((place.group_size?.min == null || query.group_size >= place.group_size.min) && (place.group_size?.max == null || query.group_size <= place.group_size.max)))
      ));
    },
  };
  return service;
}
