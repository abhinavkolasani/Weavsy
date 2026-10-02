import type { ItineraryResultShell } from '../itinerary/types.ts';
/** Deliberate boundary for a future engine. Batch 1 does not choose or schedule places. */
export function createResultShell(): ItineraryResultShell {
  return { status: 'not-generated', primaryItinerary: null };
}
