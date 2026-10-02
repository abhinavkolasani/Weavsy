export const STARTING_STATES = [
  { value: 'nothing-planned', label: 'Nothing planned', hint: 'Start from scratch.' },
  { value: 'anchor', label: 'Anchor', hint: 'One place or activity to build around.' },
  { value: 'reservation', label: 'Reservation / fixed stop', hint: 'Something with a set start time.' },
  { value: 'partial-plan', label: 'Partial plan', hint: 'A few pieces to connect.' },
  { value: 'almost-complete', label: 'Almost-complete plan', hint: 'Most of the day is already decided.' },
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
  timingDetail: TimingDetail;
  endTime: string;
  durationMinutes: string;
  note: string;
}
export interface PlanningDraft {
  startingLocation: string;
  date: string;
  availableStartTime: string;
  requiredEndTime: string;
  budgetPerPerson: string;
  groupSize: string;
  transportation: Transportation | '';
  vibeInterests: string;
  startingState: StartingState;
  existingStops: ExistingStopDraft[];
}
/** Decided identity and timing are explicit constraints for future engine work. */
export interface ExistingStop {
  id: string;
  name: string;
  fixed: boolean;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number | null;
  note: string | null;
  constraints: {
    preservePlace: boolean;
    preserveStartTime: boolean;
    preserveEndTime: boolean;
    preserveDuration: boolean;
  };
}
export interface PlanningRequest {
  startingLocation: string;
  date: string;
  availableStartTime: string;
  requiredEndTime: string;
  budgetPerPerson: { amountCents: number; currency: 'USD' };
  groupSize: number;
  transportation: Transportation;
  vibeInterests: string;
  startingState: StartingState;
  existingStops: ExistingStop[];
}
export type ValidationErrors = Record<string, string>;
export type ValidationResult = { ok: true; request: PlanningRequest } | { ok: false; errors: ValidationErrors };
