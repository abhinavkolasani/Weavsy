import type { ExistingStopDraft, PlanningDraft, StartingState } from './types.ts';
export function emptyDraft(): PlanningDraft {
  return { startingLocation: '', date: '', availableStartTime: '', requiredEndTime: '', budgetPerPerson: '', groupSize: '1', transportation: '', vibeInterests: '', startingState: 'nothing-planned', existingStops: [] };
}
export function newStop(fixed = false): ExistingStopDraft {
  return { id: crypto.randomUUID(), name: '', fixed, startTime: '', timingDetail: 'unknown', endTime: '', durationMinutes: '', note: '' };
}
/** Switching modes never discards stops or relaxes a fixed constraint. */
export function changeStartingState(draft: PlanningDraft, next: StartingState): { draft: PlanningDraft; error?: string } {
  if (next === 'nothing-planned' && draft.existingStops.length) {
    return { draft, error: 'Remove your existing stops before choosing Nothing planned. Your decided pieces are still here.' };
  }
  let stops = draft.existingStops;
  if (next !== 'nothing-planned' && stops.length === 0) stops = [newStop(next === 'anchor' || next === 'reservation')];
  if (next === 'anchor' || next === 'reservation') stops = stops.map((stop, i) => i === 0 ? { ...stop, fixed: true } : stop);
  return { draft: { ...draft, startingState: next, existingStops: stops } };
}

export function removeExistingStop(draft: PlanningDraft, id: string): PlanningDraft {
  let stops = draft.existingStops.filter(stop => stop.id !== id);
  if (draft.startingState === 'anchor' || draft.startingState === 'reservation') {
    stops = stops.map((stop, index) => index === 0 ? { ...stop, fixed: true } : stop);
  }
  return { ...draft, existingStops: stops };
}
