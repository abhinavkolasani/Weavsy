import type { PlanningDraft, PlanningRequest } from './types.ts';
import type { FounderMetadata } from '../founder/metadata.ts';
import type { ItineraryResultShell } from '../itinerary/types.ts';
import { isRealPlanResult } from '../itinerary/realPlan.ts';
import type { RealPlanResult } from '../itinerary/realPlan.ts';
import { STARTING_STATES } from './types.ts';
import { emptyDraft } from './draft.ts';
import { validateRequest } from './validate.ts';
import { isPlaceReference } from '../world/reference.ts';
import type { CurrentPlan } from './currentPlan.ts';
export interface Submission { request: PlanningRequest; result: ItineraryResultShell | RealPlanResult; metadata: FounderMetadata }
export interface PlannerState { version: 1; screen: 'form' | 'results'; draft: PlanningDraft; submission: Submission | null; currentPlan?:CurrentPlan|null }
export const SESSION_KEY = 'outing-planner-v01-batch1';
export const initialState = (): PlannerState => ({ version: 1, screen: 'form', draft: emptyDraft(), submission: null });
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
export function isPlanningDraft(value: unknown): value is PlanningDraft {
  if (!record(value)) return false;
  if(value.timeZone!==undefined){if(typeof value.timeZone!=='string'||value.timeZone.length>100)return false;try{new Intl.DateTimeFormat('en',{timeZone:value.timeZone});}catch{return false;}}
  if(value.selectedInterests!==undefined&&(!Array.isArray(value.selectedInterests)||value.selectedInterests.length>20||value.selectedInterests.some(t=>typeof t!=='string'||t.length>80)))return false;
  if(['budgetIsCap','finishIsHard','returnToStart'].some(k=>value[k]!==undefined&&typeof value[k]!=='boolean'))return false;
  if (!['startingLocation', 'date', 'availableStartTime', 'requiredEndTime', 'budgetPerPerson', 'groupSize', 'vibeInterests'].every(k => typeof value[k] === 'string')) return false;
  if (!['', 'driving', 'walking', 'transit'].includes(String(value.transportation)) || !STARTING_STATES.some(s => s.value === value.startingState)) return false;
  if (!Array.isArray(value.existingStops)) return false;
  if (value.startingPlace !== undefined && value.startingPlace !== null && !isPlaceReference(value.startingPlace)) return false;
  return value.existingStops.every(s => record(s) && ['id', 'name', 'startTime', 'endTime', 'durationMinutes', 'note'].every(k => typeof s[k] === 'string') && typeof s.fixed === 'boolean' && ['unknown', 'end-time', 'duration'].includes(String(s.timingDetail)) && (s.place === undefined || s.place === null || isPlaceReference(s.place)) && (s.entryKind === undefined || s.entryKind === 'place' || s.entryKind === 'activity'));
}
/** Untrusted or older session data cannot crash the app or masquerade as a submitted request. */
export function restoreState(raw: string | null): PlannerState {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!record(parsed) || parsed.version !== 1 || !isPlanningDraft(parsed.draft)) return initialState();
    const safe: PlannerState = { version: 1, screen: 'form', draft: parsed.draft, submission: null };
    if (parsed.screen !== 'results' && parsed.screen !== 'form') return safe;
    const submission = parsed.submission;
    if (record(submission) && record(submission.request) && record(submission.metadata) && record(submission.result)) {
      const request = submission.request;
      // Validate the saved snapshot independently: editing the draft must not mutate the submitted data.
      if (!record(request.budgetPerPerson) || !Array.isArray(request.existingStops)) return safe;
      const candidate = { ...request, budgetPerPerson: String(Number(request.budgetPerPerson.amountCents) / 100), groupSize: String(request.groupSize), existingStops: request.existingStops.map(s => record(s) ? { ...s, startTime: s.startTime ?? '', endTime: s.endTime ?? '', durationMinutes: s.durationMinutes === null ? '' : String(s.durationMinutes), note: s.note ?? '', timingDetail: s.endTime !== null ? 'end-time' : s.durationMinutes !== null ? 'duration' : 'unknown' } : null) };
      if (!isPlanningDraft(candidate)) return safe;
      const valid = validateRequest(candidate);
      const meta = submission.metadata;
      const legacy=submission.result.status==='not-generated'&&submission.result.primaryItinerary===null;
      if (!valid.ok || request.budgetPerPerson.currency !== 'USD' || !Number.isSafeInteger(request.budgetPerPerson.amountCents) || typeof request.groupSize !== 'number' || meta.schemaVersion !== 1 || ![1,3].includes(Number(meta.batch)) || meta.prototypeVersion !== '0.1.0' || !['not-built','built'].includes(String(meta.plannerStatus)) || typeof meta.requestId !== 'string' || typeof meta.submittedAt !== 'string' || Number.isNaN(Date.parse(meta.submittedAt)) || (!legacy&&!isRealPlanResult(submission.result))) return safe;
      safe.submission = { request: valid.request, result: legacy?{status:'not-generated',primaryItinerary:null}:submission.result as unknown as RealPlanResult, metadata: meta as unknown as FounderMetadata };
      safe.screen = parsed.screen;
    }
    return safe;
  } catch { return initialState(); }
}
