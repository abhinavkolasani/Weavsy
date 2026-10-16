import type { PlanningRequest } from '../planning/types.ts';
import type { OpeningHours, PlaceReference, PlaceSearchType } from '../world/types.ts';
import type { RouteEstimate } from '../routing/types.ts';
export type ExperienceRole = 'meal' | 'main-activity' | 'casual-activity' | 'coffee' | 'dessert' | 'drinks' | 'walk-explore' | 'shopping-browse' | 'scenic-relax' | 'optional-extra' | 'study';
export type CostStatus='KNOWN_COST'|'PROVIDER_PRICE_SIGNAL'|'ESTIMATED_COST'|'SHARED_COST'|'UNKNOWN_COST';
export interface ProductEstimate { value:number; low:number; high:number; source:'category-estimate' | 'user' | 'provider-price-signal'; note:string; status?:CostStatus; sharedCosts?:{label:string;status:'SHARED_COST'|'UNKNOWN_COST';amountCents:number|null}[] }
export interface PlaceQualification { accepted:boolean; confidence:'high'|'medium'|'low'; providerType:string|null; category:string; role:ExperienceRole; reason:string|null; detail:string }
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
  qualification?:PlaceQualification;
  protection?:ExistingProtection;
  hoursStatus?:'OPEN_CONFIRMED'|'CLOSED_CONFIRMED'|'HOURS_UNKNOWN'|'HOURS_PARTIAL';
}
export type ExistingProtection='USER_FIXED'|'USER_KEPT'|'USER_PLACE'|'EXPERIENCE_ANCHOR'|'PLANNER_FLEXIBLE';
export interface PlannerIntent { mood:'relaxed'|'active'|'playful'; interests:string[]; desiredRoles:ExperienceRole[]; requiredRoles?:ExperienceRole[]; searches:PlaceSearchType[]; budgetPolicy:'target'|'hard-cap'; hardCapCents:number|null; finishPolicy:'target'|'hard'; experienceAnchors?:{id:string;experience:string;search:PlaceSearchType;role:ExperienceRole}[]; repeatRoles?:ExperienceRole[]; dinnerFirst?:boolean; lessDriving?:boolean; }
export interface PlannerInput { request:PlanningRequest; intent:PlannerIntent; start:number; desiredFinish:number; replacementRole?:ExperienceRole; }
export interface ScheduledStop { candidate:CandidatePlace; arrival:number; departure:number; travel:RouteEstimate; bufferMinutes:number; waitMinutes:number; score:number; }
export interface OpenWindow { start:number; end:number; beforeStopId:string|null; afterStopId:string|null; travelAccountedDuringScheduling:boolean }
export interface Rejection { placeId:string; code:string; detail:string }
export interface PlanningDiagnostics {
  reasoning?: import('./reasoning.ts').ModelMetrics;
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
  quality?:{lens:'EXPERIENCE_SUPPLY'|'EXPERIENCE_COMPOSITION'|'INTENT_FIDELITY'|'REAL_WORLD_ACCURACY';passed:boolean;issues:string[]}[];
}
