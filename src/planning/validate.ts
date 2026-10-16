import { STARTING_STATES } from './types.ts';
import type { PlanningDraft, PlanningRequest, ValidationErrors, ValidationResult } from './types.ts';
import { isPlaceReference } from '../world/reference.ts';
import { displayTime, parseTypedTime } from './displayTime.ts';
import { isClockTime, clockMinutes, outingWindow, stopTiming, addDays } from './timeline.ts';
import { budgetCapInText } from './budget.ts';
export const validTime = isClockTime;
export const toMinutes = clockMinutes;
export function validDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}
export function validateRequest(draft: PlanningDraft, options: {requirePlaceSelections?: boolean; notBefore?:{date:string;time:string}} = {}): ValidationResult {
  const errors: ValidationErrors = {};
  if (!draft.startingLocation.trim()) errors.startingLocation = 'Enter your starting location.';
  if (draft.startingPlace && (!isPlaceReference(draft.startingPlace) || draft.startingPlace.display_name !== draft.startingLocation)) errors.startingLocation = 'Search and select your location again.';
  if (options.requirePlaceSelections && !draft.startingPlace) errors.startingLocation = 'Choose your location from the search results.';
  if (!validDate(draft.date)) errors.date = 'Choose a valid date.';
  if (options.notBefore && draft.date < options.notBefore.date) errors.date = 'Choose today or a future date.';
  if (options.notBefore && draft.date === options.notBefore.date && validTime(draft.availableStartTime) && draft.availableStartTime < options.notBefore.time) errors.availableStartTime = `Start at ${displayTime(options.notBefore.time)} or later. Earlier times have already passed.`;
  if (!validTime(draft.availableStartTime)) errors.availableStartTime = 'Enter a start time, like 7:30 PM.';
  if (!validTime(draft.requiredEndTime)) errors.requiredEndTime = 'Enter a finish time, like 12:00 AM.';
  if (validTime(draft.availableStartTime) && draft.requiredEndTime === draft.availableStartTime) errors.requiredEndTime = 'Choose different start and finish times.';
  if (!/^\d+(\.\d{1,2})?$/.test(draft.budgetPerPerson) || !Number.isSafeInteger(Math.round(Number(draft.budgetPerPerson) * 100))) errors.budgetPerPerson = 'Enter a budget of $0 or more, with up to two decimal places.';
  if (!/^\d+$/.test(draft.groupSize) || !Number.isSafeInteger(Number(draft.groupSize)) || Number(draft.groupSize) < 1) errors.groupSize = 'Enter a whole number of at least 1.';
  if (!['driving', 'walking', 'transit'].includes(draft.transportation)) errors.transportation = 'Choose how you’ll get around.';
  if (!STARTING_STATES.some(s => s.value === draft.startingState)) errors.startingState = 'Choose how much of your plan already exists.';
  if (draft.startingState !== 'nothing-planned' && !draft.existingStops.length) errors.existingStops = 'Add at least one existing stop.';
  if (draft.startingState === 'nothing-planned' && draft.existingStops.length) errors.startingState = 'Choose a starting state that includes your existing stops.';
  if (new Set(draft.existingStops.map(s => s.id)).size !== draft.existingStops.length) errors.existingStops = 'Two stops have the same identifier. Remove and re-add one of them.';
  draft.existingStops.forEach((stop, index) => {
    const prefix = `stop.${stop.id}.`;
    const requiredFixed = index === 0 && (draft.startingState === 'anchor' || draft.startingState === 'reservation');
    if (!stop.name.trim()) errors[prefix + 'name'] = 'Enter a place or activity name.';
    if (stop.entryKind && !['place','activity'].includes(stop.entryKind)) errors[prefix + 'name'] = 'Choose a place or an activity.';
    if (stop.place && (!isPlaceReference(stop.place) || stop.place.display_name !== stop.name)) errors[prefix + 'name'] = 'Search and select this place again.';
    if (stop.entryKind === 'activity' && stop.place) errors[prefix + 'name'] = 'Clear the selected place before using an activity without a venue.';
    if (options.requirePlaceSelections && stop.entryKind !== 'activity' && !stop.place) errors[prefix + 'name'] = 'Choose this place from the search results, or select an activity without a venue.';
    if (draft.startingState === 'reservation' && requiredFixed && !stop.fixed) errors[prefix + 'fixed'] = 'Your reservation must remain fixed.';
    if (draft.startingState === 'reservation' && index === 0 && !stop.startTime) errors[prefix + 'startTime'] = 'Enter the fixed start time for your reservation.';
    if (stop.startTime && !validTime(stop.startTime)) errors[prefix + 'startTime'] = 'Enter a valid start time.';
    if (stop.timingDetail === 'end-time' && !validTime(stop.endTime)) errors[prefix + 'endTime'] = 'Enter an end time, or choose Not sure yet.';
    if (stop.startDayOffset !== undefined && ![0,1].includes(stop.startDayOffset)) errors[prefix + 'startTime'] = 'Choose a time on the outing date or the next day.';
    if (stop.endDayOffset !== undefined && ![0,1].includes(stop.endDayOffset)) errors[prefix + 'endTime'] = 'Choose a time on the outing date or the next day.';
    if (stop.timingDetail === 'end-time') {
      const timing = stopTiming(draft, stop);
      if (timing.endDayOffset !== null && timing.endDayOffset > 1) errors[prefix + 'endTime'] = 'Choose an end time before the following midnight.';
      if (timing.start !== null && timing.end !== null && timing.end <= timing.start) errors[prefix + 'endTime'] = 'Stop end time must be after its start time.';
    }
    if (stop.timingDetail === 'duration' && (!/^\d+$/.test(stop.durationMinutes) || !Number.isSafeInteger(Number(stop.durationMinutes)) || Number(stop.durationMinutes) < 1)) errors[prefix + 'durationMinutes'] = 'Enter a duration of at least 1 whole minute, or choose Not sure yet.';
    // Fixed-time conflicts belong to the planner. Wrap-up is a preference, not a reservation.
  });
  if (Object.keys(errors).length) return { ok: false, errors };
  const request: PlanningRequest = {
    ...(draft.timeZone?{timeZone:draft.timeZone}:{}),
    startingLocation: draft.startingLocation.trim(), date: draft.date,
    ...(draft.startingPlace !== undefined ? {startingPlace: draft.startingPlace ? structuredClone(draft.startingPlace) : null} : {}),
    availableStartTime: draft.availableStartTime, requiredEndTime: draft.requiredEndTime,
    endDayOffset: outingWindow(draft).endDayOffset, endDate: addDays(draft.date, outingWindow(draft).endDayOffset),
    budgetPerPerson: { amountCents: Math.round(Number(draft.budgetPerPerson) * 100), currency: 'USD' },
    groupSize: Number(draft.groupSize), transportation: draft.transportation as PlanningRequest['transportation'],
    vibeInterests: draft.vibeInterests.trim(), startingState: draft.startingState,
    selectedInterests: [...(draft.selectedInterests??[])], budgetIsCap: draft.budgetIsCap??false,
    finishIsHard: draft.finishIsHard??false, returnToStart:draft.returnToStart??false,
    existingStops: draft.existingStops.map(stop => {
      const timing = stopTiming(draft, { ...stop, endTime: stop.timingDetail === 'end-time' ? stop.endTime : '' });
      return {
      id: stop.id, name: stop.name.trim(), fixed: stop.fixed,
      startTime: stop.startTime || null,
      endTime: stop.timingDetail === 'end-time' ? stop.endTime : null,
      ...(timing.startDayOffset !== null ? { startDayOffset: timing.startDayOffset as 0 | 1 } : {}),
      ...(timing.endDayOffset !== null ? { endDayOffset: timing.endDayOffset as 0 | 1 } : {}),
      durationMinutes: stop.timingDetail === 'duration' ? Number(stop.durationMinutes) : null,
      note: stop.note.trim() || null,
      commitmentKind: stop.entryKind==='activity'?'experience-anchor':stop.fixed&&!!stop.startTime?'fixed-commitment':'place-anchor',
      protection:stop.entryKind==='activity'?'EXPERIENCE_ANCHOR':stop.fixed?'USER_FIXED':'USER_PLACE',
      ...(stop.entryKind==='activity'?{experience:stop.name.trim()}:{}),
      ...(stop.place !== undefined || stop.entryKind !== undefined ? {place:stop.place ? structuredClone(stop.place) : null,source:'user' as const,entryKind:stop.entryKind ?? 'place'} : {}),
      constraints: { preservePlace: stop.entryKind!=='activity', preserveStartTime: stop.fixed && !!stop.startTime, preserveEndTime: stop.fixed && stop.timingDetail === 'end-time', preserveDuration: stop.fixed && stop.timingDetail === 'duration' },
    }; }),
  };
  const cap=budgetCapInText(request.vibeInterests);
  if(cap!==null){request.budgetCapPerPersonCents=cap;request.budgetIsCap=true;if(!Number.isSafeInteger(request.budgetCapPerPersonCents))return {ok:false,errors:{budgetPerPerson:'Enter a smaller budget cap.'}};}
  else if(request.budgetIsCap)request.budgetCapPerPersonCents=request.budgetPerPerson.amountCents;
  const home=/(?:home|back(?: at (?:home|the start|my starting point))?) by\s*(\d{1,2}(?::\d{2})?)\s*(am|pm)/i.exec(request.vibeInterests);
  if(home){const time=parseTypedTime(home[1],home[2].toUpperCase() as 'AM'|'PM');if(time){request.requiredEndTime=time;request.finishIsHard=true;request.returnToStart=true;request.endDayOffset=outingWindow(request).endDayOffset;request.endDate=addDays(request.date,request.endDayOffset);}}
  return { ok: true, request };
}
