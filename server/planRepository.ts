import type { CurrentPlan } from '../src/planning/currentPlan.ts';
import type { PlaceReference, WorldProvider } from '../src/world/types.ts';
import type { RoutingService } from '../src/routing/types.ts';
import { durableDraft } from '../src/world/durable.ts';
import { candidateFromPlace } from '../src/planner/estimates.ts';
import { isCurrentPlan } from '../src/planning/currentPlan.ts';
import { WorldError } from './worldProvider.ts';
import { openingStatus } from '../src/planner/schedule.ts';
import { toMinutes } from '../src/planning/validate.ts';
import type { PlaceDetails } from '../src/world/types.ts';
import { refreshEstimatedTotals } from '../src/itinerary/totals.ts';
import { visitWarnings } from '../src/planner/visitWarnings.ts';
import { lightweightIntent } from '../src/planner/intent.ts';

export interface StoredPlan { id:string; revision:number; tokenHash:string; snapshot:string; updatedAt:string;eventJson?:string }
export interface PlanRepository {
  getPlan(id:string):StoredPlan|null|Promise<StoredPlan|null>;
  insertPlan(record:StoredPlan):void|Promise<void>;
  updatePlan(record:StoredPlan, expectedRevision:number):boolean|Promise<boolean>;
}
export async function hashPlanToken(token:string) {
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
  return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export function newPlanToken() {
  return [...crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,'0')).join('');
}
/** Own intent/decisions are durable. Google identity IDs are retained; provider content is refreshed. */
export function planSnapshot(plan:CurrentPlan):string {
  const copy:any=structuredClone(plan);
  copy.request=durableDraft(plan.request);
  for(const stop of copy.result.primaryItinerary.stops) {
    stop.place={provider:stop.place.provider,provider_place_id:stop.place.provider_place_id};
    if(stop.cost.source==='provider-price-signal')stop.cost={source:'provider-price-signal'};
    delete stop.qualification; delete stop.hoursStatus;
    // No provider coordinates, route polylines, names, prices, or opening hours in the database.
    stop.travel={actualMode:stop.travel.actualMode};
    // Reason is our own planning explanation, not a copied provider description.
    stop.warnings=[];
  }
  delete copy.result.primaryItinerary.returnTravel;
  copy.result.primaryItinerary.warnings=[];
  return JSON.stringify(copy);
}
export async function restorePlan(record:StoredPlan,world:WorldProvider,routing:RoutingService):Promise<CurrentPlan> {
  const plan:any=JSON.parse(record.snapshot);
  const originId=plan.request.pendingStartingPlaceId;
  const stopIds=plan.result.primaryItinerary.stops.map((s:any)=>s.place.provider_place_id);
  const ids=[...new Set<string>([originId,...stopIds,...plan.request.existingStops.map((s:any)=>s.pendingPlaceId)].filter(Boolean))];
  if(!originId||ids.length>41)throw new WorldError('This saved outing could not be read.',503);
  const places=new Map<string,PlaceReference>(),detailsById=new Map<string,PlaceDetails>();
  for(let i=0;i<ids.length;i+=4)await Promise.all(ids.slice(i,i+4).map(async id=>{const details=await world.getPlaceDetails(id);if(details.place.provider_place_id!==id)throw new WorldError('A saved place could not be verified.',503);places.set(id,details.place);detailsById.set(id,details);}));
  plan.request.startingPlace=places.get(originId);plan.request.startingLocation=places.get(originId)!.display_name;delete plan.request.pendingStartingPlaceId;
  plan.request.existingStops=plan.request.existingStops.map((s:any)=>{if(!s.pendingPlaceId)return s;const place=places.get(s.pendingPlaceId);const next={...s,place,name:place!.display_name};delete next.pendingPlaceId;return next;});
  const stops=plan.result.primaryItinerary.stops;
  const ignored=new Set<string>((plan.execution??[]).filter((e:any)=>e.type==='skipped'||e.type==='unavailable').map((e:any)=>e.placeId));
  const matrix=await routing.getMatrix([places.get(originId)!,...stopIds.map((id:string)=>places.get(id)!)],plan.request.transportation);
  let previousVisitedIndex=0;
  for(let i=0;i<stops.length;i++) {
    const s=stops[i];s.place=places.get(s.place.provider_place_id);
    if(s.cost.source==='provider-price-signal')s.cost=candidateFromPlace(s.place).cost;
    const leg=matrix.legs[previousVisitedIndex]?.[i+1];if(!leg)throw new WorldError('Travel for your saved outing could not refresh. Your saved plan is unchanged.',503);
    s.travel=leg;s.reason=s.reason||'Your saved choice. Planned times are preserved.';
    if(!ignored.has(s.id))previousVisitedIndex=i+1;
    const candidate=candidateFromPlace(s.place);candidate.openingInformation=detailsById.get(s.id)!.opening_hours;
    s.hoursStatus=openingStatus(candidate,plan.request.date,toMinutes(s.arrival)+(s.arrivalDayOffset??0)*1440,toMinutes(s.departure)+(s.departureDayOffset??0)*1440);
    s.warnings=visitWarnings(s.category,s.hoursStatus);
  }
  const itinerary=plan.result.primaryItinerary;
  if(plan.request.returnToStart){const back=matrix.legs[previousVisitedIndex]?.[0];if(!back)throw new WorldError('The return journey could not refresh.',503);itinerary.returnTravel=back;}
  refreshEstimatedTotals(itinerary,ignored);
  itinerary.warnings=['This is your saved plan, with fresh place identity and travel estimates. Opening hours and actual prices still need confirmation. Nothing is booked by this app.'];
  itinerary.warnings.push('Costs use category estimates or Google price signals, not verified menu or ticket prices. Parking, passes and other shared costs may be extra.');
  itinerary.warnings.push('Travel uses mapped roads or footpaths without live traffic. Each journey includes a separate transition allowance.');
  const intent=lightweightIntent.normalize(plan.request);
  if(intent.hardCapCents!==null){
    itinerary.warnings.push('Your stated cap was applied to estimates. Actual prices are unverified, so confirm them before spending.');
    if(itinerary.costPerPersonCents>intent.hardCapCents){itinerary.warnings.push(`Fresh estimates exceed your $${intent.hardCapCents/100} per-person cap. Your choices are preserved; change a flexible stop or explicitly change the cap.`);plan.liveAttention='constraint-conflict';}
  }
  if(itinerary.costPerPersonCents>plan.request.budgetPerPerson.amountCents)itinerary.warnings.push(`The estimated total is about $${Math.round(itinerary.costPerPersonCents/100)} per person, above your $${plan.request.budgetPerPerson.amountCents/100} target.`);
  if(!isCurrentPlan(plan)||plan.id!==record.id||plan.revision!==record.revision)throw new WorldError('This saved outing could not be read.',503);
  return plan;
}
