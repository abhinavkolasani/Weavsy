import { testTravelProvider } from '../data/travel.ts';
import type { TravelProvider } from '../data/travel.ts';
import { placeService, DAYS } from '../data/index.ts';
import type { PlaceService, Place } from '../data/index.ts';
import type { PlanningRequest } from './types.ts';
import type { PlanRun, PlanStop } from '../itinerary/plan.ts';
import { validatePlannerSelectedStops } from '../itinerary/catalogContract.ts';
export const minutes=(time:string)=> Number(time.slice(0,2))*60+Number(time.slice(3));
export async function compose(request:PlanningRequest, service:PlaceService=placeService, routing:TravelProvider=testTravelProvider):Promise<PlanRun> {
 const start=minutes(request.availableStartTime), end=minutes(request.requiredEndTime);
 const run:PlanRun={runId:crypto.randomUUID(),timestamp:new Date().toISOString(),build:'development',request,status:'complete',stops:[],totalCostCents:0,unknownCostStops:[],finish:start,assumptions:[],conflicts:[],openWindows:[],candidates:[],selectedPlaceIds:[],relaxedConstraints:[],parentRunId:null};
 const places=await service.listActivePlaces();
 const allPlaces=await service.queryPlaces({include_inactive:true});
 const day=DAYS[(new Date(request.date+'T12:00:00').getDay()+6)%7];
 const travel=request.transportation==='walking'?25:request.transportation==='transit'?30:15, buffer=10;
 run.assumptions.push(routing.description);
 run.assumptions.push(`Travel uses a ${travel}-minute estimate per leg plus ${buffer} minutes of arrival buffer; geography, traffic, fares and parking are not verified. The finish is at the final stop, without a return journey.`, 'Catalog fixtures are synthetic TEST places, not executable real-world recommendations.');
 const fixed:PlanStop[]=[], flexible:PlanStop[]=[];
 for(const s of request.existingStops){
  const p=allPlaces.find(p=>p.place_id===s.name || p.name.toLowerCase()===s.name.toLowerCase());
  if(p&&!p.active)run.conflicts.push(`${s.name} is inactive in the catalog.`);
  const duration=s.endTime&&s.startTime?minutes(s.endTime)-minutes(s.startTime):s.durationMinutes??p?.typical_duration_minutes??60;
  if(!s.durationMinutes&&!(s.endTime&&s.startTime))run.assumptions.push(`${s.name}: assumed ${duration} minutes.`);
  const at=s.startTime?minutes(s.startTime):s.endTime?minutes(s.endTime)-duration:null;
  if(!p){run.unknownCostStops.push(s.id);run.assumptions.push(`${s.name}: user-supplied place; hours, location and cost are unknown. Budget compliance cannot be confirmed until its cost is verified.`);}
  const stop:PlanStop={stopId:s.id,placeId:p?.place_id??null,name:s.name,category:p?.category??'user_activity',start:at??start,duration,costCents:p?.estimated_cost_per_person.amount_cents??null,travelMinutes:travel,bufferMinutes:buffer,source:'user',fixed:s.fixed,reason:'Preserved from your existing plan.',area:p?.area??null,note:s.note};
  if(!s.fixed&&(s.startTime||s.endTime))run.assumptions.push(`${s.name}: flexible timing may move to fit the outing; its ${duration}-minute duration is retained.`);
  (s.fixed&&at!==null?fixed:flexible).push(stop);
 }
 fixed.sort((a,b)=>a.start-b.start);
 function hours(p:Place,at:number,duration:number){return p.opening_hours.weekly[day]?.some(h=>at>=minutes(h.opens)&&at+duration<=minutes(h.closes))??false;}
 function check(stop:PlanStop){const p=places.find(p=>p.place_id===stop.placeId); if(p&&!hours(p,stop.start,stop.duration))run.conflicts.push(`${stop.name} is closed or its hours are unknown during this stop.`);if(p&&((p.group_size?.min??1)>request.groupSize||(p.group_size?.max??Infinity)<request.groupSize))run.conflicts.push(`${stop.name} cannot accommodate this group.`);}
 if(request.startingLocation&&!request.startingLocation.startsWith('TEST_'))run.assumptions.push(`Starting location ${request.startingLocation} is saved but not geocoded; only fictional TEST-zone geography is available.`);
 let previous=start; let previousArea:string|null=null;
 for(const s of fixed){s.travelMinutes=routing.estimateMinutes(previousArea,s.area,request.transportation);if(s.start<previous+s.travelMinutes+buffer||s.start+s.duration>end)run.conflicts.push(`Fixed stop ${s.name} conflicts with the outing window, a prior fixed stop, or travel and arrival buffer.`); if(s.start>previous)run.openWindows.push({start:previous,end:s.start});previous=s.start+s.duration;previousArea=s.area;check(s);}
 if(previous<end)run.openWindows.push({start:previous,end});
 const remaining=[...flexible]; let cursor=start, cost=[...fixed,...flexible].reduce((sum,s)=>sum+(s.costCents??0),0);
 const used=new Set(fixed.map(s=>s.placeId));
 let lastArea:string|null=null;
 const desired=request.vibeInterests.toLowerCase();
 const rank=(p:Place)=> (desired.includes('food')&&p.category.includes('food')?30:0)+( /active|sport|adventure/.test(desired)&&p.category==='active_activity'?30:0)+p.vibe_tags.filter(t=>desired.includes(t)).length*10-(p.estimated_cost_per_person.amount_cents/1000);
 const candidates=[...places].sort((a,b)=>rank(b)-rank(a)||a.place_id.localeCompare(b.place_id));
 function scheduleWindow(boundary:number,nextFixed:PlanStop|undefined){
  while(remaining.length){const s=remaining[0];s.travelMinutes=routing.estimateMinutes(lastArea,s.area,request.transportation);const at=cursor+s.travelMinutes+buffer;if(at+s.duration+(nextFixed?routing.estimateMinutes(s.area,nextFixed.area,request.transportation)+buffer:0)>boundary)break;s.start=at;check(s);run.stops.push(s);cursor=at+s.duration;lastArea=s.area;used.add(s.placeId);remaining.shift();}
  for(const p of candidates){
   if(run.stops.filter(s=>s.source==='planner').length>=Math.max(0,3-request.existingStops.length))break;
   const leg=routing.estimateMinutes(lastArea,p.area,request.transportation);const at=cursor+leg+buffer;
   let reason='';
   if(used.has(p.place_id))reason='Already included';
   else if(cost+p.estimated_cost_per_person.amount_cents>request.budgetPerPerson.amountCents)reason='Over budget';
   else if((p.group_size?.min??1)>request.groupSize||(p.group_size?.max??Infinity)<request.groupSize)reason='Group capacity';
   else if(lastArea&&nextFixed?.area&&lastArea===nextFixed.area&&p.area!==lastArea)reason='Avoid leaving and returning to the fixed-stop area';
   else if(at+p.typical_duration_minutes+(nextFixed?routing.estimateMinutes(p.area,nextFixed.area,request.transportation)+buffer:0)>boundary)reason='Insufficient time with travel and buffer';
   else if(!hours(p,at,p.typical_duration_minutes))reason='Closed or unknown hours';
   else if(run.stops.some(s=>s.category===p.category))reason='Category already covered';
   run.candidates.push({placeId:p.place_id,reason:reason||'Selected: interest fit and feasible time/cost'});
   if(reason)continue;
   const s:PlanStop={stopId:crypto.randomUUID(),placeId:p.place_id,name:p.name,category:p.category,start:at,duration:p.typical_duration_minutes,costCents:p.estimated_cost_per_person.amount_cents,travelMinutes:leg,bufferMinutes:buffer,source:'planner',fixed:false,reason:'Fits your interests, group, available window and estimated budget.',area:p.area,note:p.data_notes};
   run.stops.push(s);cursor=at+s.duration;cost+=s.costCents!;used.add(p.place_id);lastArea=p.area;
  }
 }
 for(const s of fixed){scheduleWindow(s.start,s);s.travelMinutes=routing.estimateMinutes(lastArea,s.area,request.transportation);run.stops.push(s);cursor=s.start+s.duration;lastArea=s.area;}
 scheduleWindow(end,undefined);
 if(remaining.length)run.conflicts.push(`No space for existing pieces: ${remaining.map(s=>s.name).join(', ')}.`);
 if(cost>request.budgetPerPerson.amountCents)run.conflicts.push('Existing pieces exceed the budget ceiling.');
 if(!run.stops.length)run.conflicts.push('No catalog options fit the time, hours, group and budget constraints.');
 run.selectedPlaceIds=run.stops.filter(s=>s.source==='planner').map(s=>s.placeId!);
 const validated=await validatePlannerSelectedStops(run.selectedPlaceIds.map(place_id=>({place_id})),service);
 if(!validated.ok)run.conflicts.push(...validated.issues.map(i=>i.message));
 run.totalCostCents=cost;run.finish=cursor;
 if(run.conflicts.length){run.status='conflict';run.stops=[];run.selectedPlaceIds=[];}
 return run;
}
