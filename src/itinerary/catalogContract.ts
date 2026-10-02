import { placeService } from '../data/index.ts';
import type { Place, PlaceService } from '../data/index.ts';

/** Candidate input contains IDs only. Names, prices, hours, etc. come from the service. */
export interface CatalogStopReference { readonly place_id: string }
declare const validatedCatalogStop: unique symbol;
export type ValidatedCatalogStop = {
  readonly source: 'catalog';
  readonly place_id: string;
  readonly place: Place;
  readonly [validatedCatalogStop]: true;
};
export type CatalogStopIssue = {
  index: number | null;
  code: 'INVALID_SELECTION' | 'INVALID_PLACE_ID' | 'PLACE_NOT_FOUND' | 'PLACE_INACTIVE';
  place_id?: string;
  message: string;
};
export type CatalogStopValidation =
  | { ok: true; stops: readonly ValidatedCatalogStop[] }
  | { ok: false; issues: readonly CatalogStopIssue[] };

/**
 * Call at the future planning boundary. No ranking, scheduling or generation occurs.
 * Batch validation is all-or-nothing. Revalidate before use if the catalog has changed.
 * User-entered fixed/anchor stops are separate request data and are never dropped here.
 */
export async function validatePlannerSelectedStops(
  input: unknown,
  service: PlaceService = placeService,
): Promise<CatalogStopValidation> {
  if (!Array.isArray(input)) return { ok: false, issues: [{ index: null, code: 'INVALID_SELECTION', message: 'Planner-selected stops must be an array of Place ID references.' }] };
  const issues: CatalogStopIssue[] = [];
  const stops: ValidatedCatalogStop[] = [];
  for (const [index, candidate] of input.entries()) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate) || Object.keys(candidate).some(key => key !== 'place_id')) {
      issues.push({ index, code: 'INVALID_SELECTION', message: 'Each planner-selected stop must contain only a place_id; place facts come from the catalog.' });
      continue;
    }
    if (typeof candidate.place_id !== 'string' || !candidate.place_id.trim()) {
      issues.push({ index, code: 'INVALID_PLACE_ID', message: 'A nonempty Place ID is required.' });
      continue;
    }
    const id = candidate.place_id;
    const place = await service.getPlaceById(id);
    if (!place || place.place_id !== id) {
      issues.push({ index, code: 'PLACE_NOT_FOUND', place_id: id, message: `Place ID "${id}" does not exist in the catalog.` });
      continue;
    }
    if (!place.active) {
      issues.push({ index, code: 'PLACE_INACTIVE', place_id: id, message: `Place ID "${id}" is inactive and cannot be selected.` });
      continue;
    }
    stops.push({ source: 'catalog', place_id: id, place } as ValidatedCatalogStop);
  }
  return issues.length ? { ok: false, issues } : { ok: true, stops };
}
