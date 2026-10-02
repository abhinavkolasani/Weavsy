/** A truthful Batch 1 result: no generated or fabricated itinerary. */
export interface ItineraryResultShell {
  status: 'not-generated';
  primaryItinerary: null;
}
