import type { PlaceReference } from '../world/types.ts';
export const STARTING_STATES = [
  { value: 'nothing-planned', label: 'Nothing yet', hint: 'Plan it for me.' },
  { value: 'anchor', label: 'One thing I want included', hint: 'I know one thing I want to do.' },
  { value: 'reservation', label: 'Something booked / fixed', hint: 'A place or commitment at a set time.' },
  { value: 'partial-plan', label: 'A few pieces', hint: 'I know some of the plan.' },
  { value: 'almost-complete', label: 'Mostly planned', hint: 'Help finish it.' },
] as const;
export type StartingState = typeof STARTING_STATES[number]['value'];
export type Transportation = 'driving' | 'walking' | 'transit';
export type TimingDetail = 'unknown' | 'end-time' | 'duration';

/** Form inputs stay strings until validation: an empty field must not become zero. */
export interface ExistingStopDraft {
  id: string;
  name: string;
  fixed: boolean;
  startTime: string;
  startDayOffset?: 0 | 1;
  timingDetail: TimingDetail;
  endTime: string;
  endDayOffset?: 0 | 1;
  durationMinutes: string;
  note: string;
  place?: PlaceReference | null;
  pendingPlaceId?: string;
  entryKind?: 'place' | 'activity';
}
export interface PlanningDraft {
  timeZone?: string;
  startingLocation: string;
  startingPlace?: PlaceReference | null;
  pendingStartingPlaceId?: string;
  date: string;
  availableStartTime: string;
  requiredEndTime: string;
  budgetPerPerson: string;
  groupSize: string;
  transportation: Transportation | '';
  vibeInterests: string;
  selectedInterests?: string[];
  budgetIsCap?: boolean;
  budgetCapPerPersonCents?:number|null;
  finishIsHard?: boolean;
  returnToStart?: boolean;
  startingState: StartingState;
  existingStops: ExistingStopDraft[];
}
/** Decided identity and timing are explicit constraints for future engine work. */
export interface ExistingStop {
  id: string;
  name: string;
  fixed: boolean;
  startTime: string | null;
  startDayOffset?: 0 | 1;
  endTime: string | null;
  endDayOffset?: 0 | 1;
  durationMinutes: number | null;
  note: string | null;
  place?: PlaceReference | null;
  source?: 'user';
  entryKind?: 'place' | 'activity';
  commitmentKind?: 'experience-anchor' | 'place-anchor' | 'fixed-commitment';
  protection?: 'USER_FIXED' | 'USER_KEPT' | 'USER_PLACE' | 'EXPERIENCE_ANCHOR' | 'PLANNER_FLEXIBLE';
  experience?: string;
  constraints: {
    preservePlace: boolean;
    preserveStartTime: boolean;
    preserveEndTime: boolean;
    preserveDuration: boolean;
  };
}
export interface PlanningRequest {
  timeZone?: string;
  startingLocation: string;
  startingPlace?: PlaceReference | null;
  date: string;
  availableStartTime: string;
  requiredEndTime: string;
  endDayOffset?: 0 | 1;
  endDate?: string;
  budgetPerPerson: { amountCents: number; currency: 'USD' };
  groupSize: number;
  transportation: Transportation;
  vibeInterests: string;
  selectedInterests?: string[];
  budgetIsCap?: boolean;
  budgetCapPerPersonCents?:number|null;
  finishIsHard?: boolean;
  returnToStart?: boolean;
  startingState: StartingState;
  existingStops: ExistingStop[];
}
export type ValidationErrors = Record<string, string>;
export type ValidationResult = { ok: true; request: PlanningRequest } | { ok: false; errors: ValidationErrors };
