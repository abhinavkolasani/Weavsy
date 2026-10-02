/** The one public place-data entry point. Only this adapter imports the backing catalog. */
import { syntheticPlaces } from './syntheticCatalog.ts';
import { createLocalPlaceService } from './localPlaceService.ts';
export const placeService = createLocalPlaceService(syntheticPlaces);
export { DAYS, PLACE_CATEGORIES } from './types.ts';
export type { Place, PlaceCategory, DataStatus, DayOfWeek, PlaceQuery, PlaceService } from './types.ts';
