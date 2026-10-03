import type { PlanningRequest } from '../planning/types.ts';
import type { OpeningHours, PlaceReference, PlaceSearchType } from '../world/types.ts';
import type { RouteEstimate } from '../routing/types.ts';
export type ExperienceRole = 'meal' | 'main-activity' | 'casual-activity' | 'coffee' | 'dessert' | 'drinks' | 'walk-explore' | 'shopping-browse' | 'scenic-relax' | 'optional-extra';
export interface ProductEstimate { value:number; low:number; high:number; source:'category-estimate' | 'user'; note:string }
export interface CandidatePlace {
  id:string;
  place:PlaceReference;
  category:string;
  role:ExperienceRole;
  cost:ProductEstimate; // USD cents per person, never group total.
  duration:ProductEstimate; // minutes.
  vibeTags:string[];
  interestTags:string[];
  sourceConfidence:'community-identity'|'provider-identity';
  openingInformation:OpeningHours|null;
  hoursChecked:boolean;
  estimateNotes:string[];
  userStopId:string|null;
  fixed:boolean;
  fixedStart:number|null;
  fixedEnd:number|null;
  preferredStart:number|null;
  note:string|null;
}
export interface PlannerIntent { mood:'relaxed'|'active'|'playful'; interests:string[]; desiredRoles:ExperienceRole[]; searches:PlaceSearchType[]; budgetPolicy:'target'|'hard-cap'; hardCapCents:number|null; finishPolicy:'target'; }
export interface PlannerInput { request:PlanningRequest; intent:PlannerIntent; start:number; desiredFinish:number; }
export interface ScheduledStop { candidate:CandidatePlace; arrival:number; departure:number; travel:RouteEstimate; bufferMinutes:number; waitMinutes:number; score:number; }
export interface OpenWindow { start:number; end:number; beforeStopId:string|null; afterStopId:string|null; travelAccountedDuringScheduling:boolean }
export interface Rejection { placeId:string; code:string; detail:string }
export interface PlanningDiagnostics {
  normalizedInput:PlannerInput;
  decisions:{stopId:string; placeId:string|null; fixed:boolean; startTime:string|null; endTime:string|null; durationMinutes:number|null}[];
  openWindows:OpenWindow[];
  candidates:CandidatePlace[];
  rejected:Rejection[];
  scores:{placeId:string; factors:Record<string,number>; total:number}[];
  selected:ScheduledStop[];
  routes:{from:string;to:string;estimate:RouteEstimate|null}[];
  assumptions:string[];
  warnings:string[];
  conflicts:string[];
}
