import { STARTING_STATES } from './types.ts';
import type { PlanningDraft, PlanningRequest, ValidationErrors, ValidationResult } from './types.ts';
export const validTime = (time: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
export const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
export function validDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}
export function validateRequest(draft: PlanningDraft): ValidationResult {
  const errors: ValidationErrors = {};
  if (!draft.startingLocation.trim()) errors.startingLocation = 'Enter your starting location.';
  if (!validDate(draft.date)) errors.date = 'Choose a valid date.';
  if (!validTime(draft.availableStartTime)) errors.availableStartTime = 'Enter an available start time.';
  if (!validTime(draft.requiredEndTime)) errors.requiredEndTime = 'Enter a required end time.';
  if (validTime(draft.availableStartTime) && validTime(draft.requiredEndTime) && toMinutes(draft.requiredEndTime) <= toMinutes(draft.availableStartTime)) errors.requiredEndTime = 'End time must be after start time on the same date.';
  if (!/^\d+(\.\d{1,2})?$/.test(draft.budgetPerPerson) || !Number.isSafeInteger(Math.round(Number(draft.budgetPerPerson) * 100))) errors.budgetPerPerson = 'Enter a budget of $0 or more, with up to two decimal places.';
  if (!/^\d+$/.test(draft.groupSize) || !Number.isSafeInteger(Number(draft.groupSize)) || Number(draft.groupSize) < 1) errors.groupSize = 'Enter a whole number of at least 1.';
  if (!['driving', 'walking', 'transit'].includes(draft.transportation)) errors.transportation = 'Choose how you’ll get around.';
  if (!draft.vibeInterests.trim()) errors.vibeInterests = 'Add a vibe or interest, even just one word.';
  if (!STARTING_STATES.some(s => s.value === draft.startingState)) errors.startingState = 'Choose how much of your plan already exists.';
  if (draft.startingState !== 'nothing-planned' && !draft.existingStops.length) errors.existingStops = 'Add at least one existing stop.';
  if (draft.startingState === 'nothing-planned' && draft.existingStops.length) errors.startingState = 'Choose a starting state that includes your existing stops.';
  if (new Set(draft.existingStops.map(s => s.id)).size !== draft.existingStops.length) errors.existingStops = 'Two stops have the same identifier. Remove and re-add one of them.';
  draft.existingStops.forEach((stop, index) => {
    const prefix = `stop.${stop.id}.`;
    const requiredFixed = index === 0 && (draft.startingState === 'anchor' || draft.startingState === 'reservation');
    if (!stop.name.trim()) errors[prefix + 'name'] = 'Enter a place or activity name.';
    if (requiredFixed && !stop.fixed) errors[prefix + 'fixed'] = 'Your anchor or reservation must remain fixed.';
    if (draft.startingState === 'reservation' && index === 0 && !stop.startTime) errors[prefix + 'startTime'] = 'Enter the fixed start time for your reservation.';
    if (stop.startTime && !validTime(stop.startTime)) errors[prefix + 'startTime'] = 'Enter a valid start time.';
    if (stop.timingDetail === 'end-time' && !validTime(stop.endTime)) errors[prefix + 'endTime'] = 'Enter an end time, or choose Not sure yet.';
    if (stop.timingDetail === 'end-time' && validTime(stop.startTime) && validTime(stop.endTime) && toMinutes(stop.endTime) <= toMinutes(stop.startTime)) errors[prefix + 'endTime'] = 'Stop end time must be after its start time.';
    if (stop.timingDetail === 'duration' && (!/^\d+$/.test(stop.durationMinutes) || !Number.isSafeInteger(Number(stop.durationMinutes)) || Number(stop.durationMinutes) < 1)) errors[prefix + 'durationMinutes'] = 'Enter a duration of at least 1 whole minute, or choose Not sure yet.';
    if (stop.fixed && validTime(stop.startTime) && validTime(draft.availableStartTime) && validTime(draft.requiredEndTime) && (stop.startTime < draft.availableStartTime || stop.startTime >= draft.requiredEndTime)) errors[prefix + 'startTime'] = 'This fixed start must be inside your outing’s time window.';
    const knownEnd = stop.timingDetail === 'end-time' && validTime(stop.endTime) ? toMinutes(stop.endTime) : stop.timingDetail === 'duration' && validTime(stop.startTime) && Number(stop.durationMinutes) > 0 ? toMinutes(stop.startTime) + Number(stop.durationMinutes) : null;
    if (stop.fixed && knownEnd !== null && validTime(draft.requiredEndTime) && knownEnd > toMinutes(draft.requiredEndTime)) errors[prefix + (stop.timingDetail === 'duration' ? 'durationMinutes' : 'endTime')] = 'This fixed stop would finish after your required end time.';
  });
  if (Object.keys(errors).length) return { ok: false, errors };
  const request: PlanningRequest = {
    startingLocation: draft.startingLocation.trim(), date: draft.date,
    availableStartTime: draft.availableStartTime, requiredEndTime: draft.requiredEndTime,
    budgetPerPerson: { amountCents: Math.round(Number(draft.budgetPerPerson) * 100), currency: 'USD' },
    groupSize: Number(draft.groupSize), transportation: draft.transportation as PlanningRequest['transportation'],
    vibeInterests: draft.vibeInterests.trim(), startingState: draft.startingState,
    existingStops: draft.existingStops.map(stop => ({
      id: stop.id, name: stop.name.trim(), fixed: stop.fixed,
      startTime: stop.startTime || null,
      endTime: stop.timingDetail === 'end-time' ? stop.endTime : null,
      durationMinutes: stop.timingDetail === 'duration' ? Number(stop.durationMinutes) : null,
      note: stop.note.trim() || null,
      constraints: { preservePlace: stop.fixed, preserveStartTime: stop.fixed && !!stop.startTime, preserveEndTime: stop.fixed && stop.timingDetail === 'end-time', preserveDuration: stop.fixed && stop.timingDetail === 'duration' },
    })),
  };
  return { ok: true, request };
}
