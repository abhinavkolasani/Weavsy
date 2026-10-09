import type { RealItinerary } from './realPlan.ts';

/** Skipped/unavailable entries remain history, but do not contribute to the outing estimates. */
export function refreshEstimatedTotals(itinerary: RealItinerary, ignoredIds: ReadonlySet<string>) {
  const stops = itinerary.stops.filter(stop => !ignoredIds.has(stop.id));
  itinerary.costPerPersonCents = stops.reduce((sum, stop) => sum + stop.cost.value, 0);
  itinerary.costRangeCents = {
    low: stops.reduce((sum, stop) => sum + stop.cost.low, 0),
    high: stops.reduce((sum, stop) => sum + stop.cost.high, 0),
  };
  itinerary.travelMinutes = stops.reduce((sum, stop) => sum + stop.travel.minutes, 0)
    + (stops.length ? itinerary.returnTravel?.minutes ?? 0 : 0);
  itinerary.hasUnknownCosts = stops.some(stop => stop.cost.status === 'UNKNOWN_COST'
    || stop.cost.sharedCosts?.some(cost => cost.amountCents === null));
  itinerary.sharedCosts = stops.flatMap(stop => stop.cost.sharedCosts ?? []);
}
