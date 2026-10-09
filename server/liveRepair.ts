import type { CurrentPlan,ExecutionEvent } from '../src/planning/currentPlan.ts';
import type { WorldProvider } from '../src/world/types.ts';
import type { RoutingService } from '../src/routing/types.ts';
import { canChange } from '../src/planning/currentPlan.ts';
import { outingWindow,timelineClock,timelineDay,addDays,stopTiming } from '../src/planning/timeline.ts';
import { outingClock } from '../src/planning/clock.ts';
import type { PlanningRequest } from '../src/planning/types.ts';
import type { OutingStop,RealItinerary } from '../src/itinerary/realPlan.ts';
import { toMinutes } from '../src/planning/validate.ts';
import { candidateFromPlace } from '../src/planner/estimates.ts';
import { isOpen,openingStatus } from '../src/planner/schedule.ts';
import { lightweightIntent } from '../src/planner/intent.ts';
import { refreshEstimatedTotals } from '../src/itinerary/totals.ts';

import type { LiveAction } from '../src/planning/live.ts';
export type { LiveAction } from '../src/planning/live.ts';
export const finishedIds=(plan:CurrentPlan)=>new Set((plan.execution??[]).filter(e=>['completed','skipped','unavailable'].includes(e.type)).map(e=>e.placeId));
const dayOffset=(day:number):0|1=>{if(day!==0&&day!==1)throw new Error('The remaining stops fall outside this outing window. Your history is preserved.');return day;};
const minute=(time:string,day=0)=>toMinutes(time)+day*1440;
/** Explicit execution is separate from planned times. This bounded repair never chooses a new venue. */
export async function applyLiveAction(plan:CurrentPlan,action:LiveAction,world:WorldProvider,routing:RoutingService,at:Date):Promise<{plan:CurrentPlan;conflict:string|null;changed:boolean}> {
  const next=structuredClone(plan),stops=next.result.primaryItinerary.stops;
  const past=finishedIds(plan),events=next.execution??[];
  let event:ExecutionEvent;
  if(action.kind==='late') {
    if(!Number.isInteger(action.minutes)||action.minutes<0||action.minutes>240)throw new Error('Enter a delay from 0 to 240 minutes.');
    if(action.minutes===0)return{plan:next,conflict:null,changed:false};
    event={at:at.toISOString(),type:'late',minutes:action.minutes};
  }else{
    const stop=stops.find(s=>s.id===action.placeId);if(!stop)throw new Error('That stop is no longer in this plan.');
    if(past.has(stop.id))throw new Error('This stop is already recorded. Completed history cannot be rewritten.');
    if(action.kind==='complete'&&stops.find(s=>!past.has(s.id))?.id!==stop.id)throw new Error('Record earlier stops as completed or skipped first.');
    if(action.kind!=='complete'&&!canChange(stop))throw new Error('This place is protected. Explicitly change or release its commitment before skipping it.');
    event={at:at.toISOString(),type:action.kind==='complete'?'completed':action.kind==='skip'?'skipped':'unavailable',placeId:stop.id};
    past.add(stop.id);
  }
  next.execution=[...events,event];next.revision++;
  next.history.push({at:at.toISOString(),type:'adjusted',request:action.kind==='late'?`Explicit delay: ${action.minutes} minutes`:`Explicit ${action.kind}`,placeId:'placeId' in action?action.placeId:undefined});
  next.history=next.history.slice(-500);
  if(action.kind==='complete')return{plan:next,conflict:null,changed:true}; // Quiet success; no attendance inferred from generation.
  const future=stops.filter(s=>!past.has(s.id));
  if(!future.length){recompute(next);return{plan:next,conflict:null,changed:true};}
  const lastCompleted=stops.filter(s=>events.some(e=>e.type==='completed'&&e.placeId===s.id)).at(-1);
  const origin=lastCompleted?.place??plan.request.startingPlace!;
  const points=[origin,...future.map(s=>s.place),...(plan.request.returnToStart?[plan.request.startingPlace!]:[])];
  const matrix=await routing.getMatrix(points,plan.request.transportation);
  const details=await Promise.all(future.map(s=>world.getPlaceDetails(s.id)));
  let cursor=lastCompleted?minute(lastCompleted.departure,lastCompleted.departureDayOffset):outingWindow(plan.request).start;
  if(action.kind==='late') {
    const first=future[0],leg=matrix.legs[0]?.[1];
    if(!leg)throw new Error('The next journey could not be verified. Your plan is unchanged.');
    cursor+=action.minutes;
  }
  const current=outingClock(plan.request.timeZone,origin,at);
  const offset=Math.round((Date.parse(current.date+'T12:00:00Z')-Date.parse(plan.request.date+'T12:00:00Z'))/86400000);
  if(offset>=0)cursor=Math.max(cursor,offset*1440+toMinutes(current.time));
  const conflict=(message:string)=>({plan:{...next,result:structuredClone(plan.result),liveAttention:'constraint-conflict' as const},conflict:message,changed:true});
  for(let i=0;i<future.length;i++) {
    const stop=future[i],leg=matrix.legs[i]?.[i+1],detail=details[i];
    if(!leg||leg.actualMode!==plan.request.transportation)return conflict('The next journey could not be verified. Your planned times are unchanged.');
    if(detail.place.provider_place_id!==stop.id)return conflict('A place identity could not be verified. Your planned times are unchanged.');
    const buffer=leg.distanceMetres===0?0:leg.actualMode==='driving'?10:5;
    const ready=cursor+leg.minutes+buffer,oldArrival=minute(stop.arrival,stop.arrivalDayOffset);
    const arrival=stop.exactTime?oldArrival:Math.max(oldArrival,Math.ceil(ready/5)*5);
    if(arrival<ready)return conflict('That would miss your fixed '+detail.place.display_name+' arrival. Keep the reservation or explicitly change its time in Edit details.');
    const departure=stop.exactEnd?minute(stop.departure,stop.departureDayOffset):arrival+stop.duration.value;
    if(departure<=arrival)return conflict('That would conflict with a fixed finish. Your commitment has not been moved.');
    const candidate=candidateFromPlace(detail.place);candidate.openingInformation=detail.opening_hours;
    if(detail.business_status==='unavailable'||!isOpen(candidate,plan.request.date,arrival,departure))return conflict('The changed visit does not fit listed availability. Your places are still preserved. Choose which commitment to change.');
    if(departure>outingWindow(plan.request).start+1439)return conflict('That would extend beyond this outing’s one-day window. Your times are unchanged.');
    stop.place=detail.place;stop.travel=leg;stop.transitionMinutes=buffer;stop.waitMinutes=Math.max(0,arrival-ready);
    stop.arrival=timelineClock(arrival);stop.arrivalDayOffset=timelineDay(arrival);stop.departure=timelineClock(departure);stop.departureDayOffset=timelineDay(departure);stop.hoursStatus=openingStatus(candidate,plan.request.date,arrival,departure);
    cursor=departure;
  }
  const back=plan.request.returnToStart?matrix.legs[future.length]?.[future.length+1]:null;
  if(plan.request.returnToStart&&!back)return conflict('The return journey could not be verified. Your plan is unchanged.');
  const finish=cursor+(back?.minutes??0)+(back?.distanceMetres?10:0),intent=lightweightIntent.normalize(plan.request);
  if(intent.finishPolicy==='hard'&&finish>outingWindow(plan.request).finish)return conflict('The delay would miss your required finish. Your fixed times are preserved. Skip a flexible stop or change the finish in Edit details.');
  if(back)next.result.primaryItinerary.returnTravel=back;
  delete next.liveAttention;
  recompute(next,finish);
  if(intent.hardCapCents!==null&&next.result.primaryItinerary.costPerPersonCents>intent.hardCapCents)return conflict('The remaining estimates would exceed your hard cap. Your commitments are unchanged.');
  return{plan:next,conflict:null,changed:true};
}
function recompute(plan:CurrentPlan,finish?:number) {
  const ignored=new Set((plan.execution??[]).flatMap(e=>(e.type==='skipped'||e.type==='unavailable')&&e.placeId?[e.placeId]:[]));
  const stops=plan.result.primaryItinerary.stops.filter(s=>!ignored.has(s.id)),itinerary=plan.result.primaryItinerary;
  refreshEstimatedTotals(itinerary,ignored);
  const end=finish??(stops.length?minute(stops.at(-1)!.departure,stops.at(-1)!.departureDayOffset):outingWindow(plan.request).start);
  itinerary.finish=timelineClock(end);itinerary.finishDayOffset=timelineDay(end);
}

/** Plan only the future when editing during an outing, then merge it with immutable prior stops. */
export function remainingContext(plan:CurrentPlan,request:PlanningRequest,retainedStops:OutingStop[],at:Date) {
  const done=finishedIds(plan),past=plan.result.primaryItinerary.stops.filter(s=>done.has(s.id));
  if(!past.length)return null;
  for(const s of plan.request.existingStops.filter(s=>s.place&&done.has(s.place.provider_place_id))){const changed=request.existingStops.find(n=>n.id===s.id);if(!changed||changed.place?.provider_place_id!==s.place?.provider_place_id||changed.fixed!==s.fixed||changed.startTime!==s.startTime||changed.endTime!==s.endTime||changed.durationMinutes!==s.durationMinutes)throw new Error('Completed history cannot be changed in Edit details. Change a future stop instead.');}
  const lastCompleted=past.filter(s=>plan.execution?.some(e=>e.type==='completed'&&e.placeId===s.id)).at(-1);
  const origin=lastCompleted?.place??request.startingPlace!;
  let start=Math.max(outingWindow(request).start,lastCompleted?minute(lastCompleted.departure,lastCompleted.departureDayOffset):0);
  const current=outingClock(request.timeZone,origin,at);
  const localOffset=Math.round((Date.parse(current.date+'T12:00:00Z')-Date.parse(request.date+'T12:00:00Z'))/86400000);
  if(localOffset>=0)start=Math.max(start,localOffset*1440+toMinutes(current.time));
  const window=outingWindow(request);if(start>=window.finish)throw new Error('The outing window has ended. Your history is saved; choose a later finish to change future stops.');
  const baseDay=timelineDay(start),working=structuredClone(request);
  working.date=addDays(request.date,baseDay);working.availableStartTime=timelineClock(start);working.startingPlace=origin;working.startingLocation=origin.display_name;
  working.existingStops=working.existingStops.filter(s=>!s.place||!done.has(s.place.provider_place_id)).map(s=>{const timing=stopTiming(request,s);return{...s,...(timing.startDayOffset!=null?{startDayOffset:dayOffset(timing.startDayOffset-baseDay)}:{}),...(timing.endDayOffset!=null?{endDayOffset:dayOffset(timing.endDayOffset-baseDay)}:{})};});
  if(!working.existingStops.length)working.startingState='nothing-planned';
  const estimatedPast=past.filter(s=>plan.execution?.some(e=>e.type==='completed'&&e.placeId===s.id)).reduce((sum,s)=>sum+s.cost.value,0);
  const intent=lightweightIntent.normalize(request);if(intent.hardCapCents!==null&&estimatedPast>intent.hardCapCents)throw new Error('Completed stops already exceed the new cap in estimates. Your history is preserved.');
  working.budgetPerPerson.amountCents=Math.max(0,working.budgetPerPerson.amountCents-estimatedPast);
  if(intent.hardCapCents!==null){working.budgetIsCap=true;working.budgetCapPerPersonCents=intent.hardCapCents-estimatedPast;working.vibeInterests=working.vibeInterests.replace(/(?:hard cap(?: of)?|no more than|maximum|max budget|do not (?:go over|exceed)|don['’]?t (?:go over|exceed))\s*\$?\s*\d+(?:\.\d{1,2})?/gi,'');}
  working.endDayOffset=dayOffset(window.endDayOffset-baseDay);working.endDate=addDays(working.date,working.endDayOffset);
  return{request:working,baseDay,past,retainedStops:retainedStops.filter(s=>!done.has(s.id)).map(s=>({...s,arrivalDayOffset:dayOffset((s.arrivalDayOffset??0)-baseDay),departureDayOffset:dayOffset((s.departureDayOffset??0)-baseDay)}))};
}
export function mergeRemaining(plan:CurrentPlan,future:RealItinerary,context:NonNullable<ReturnType<typeof remainingContext>>) {
  const next=structuredClone(plan);next.result.primaryItinerary={...future,start:plan.result.primaryItinerary.start,finishDayOffset:dayOffset((future.finishDayOffset??0)+context.baseDay),stops:[...context.past,...future.stops.map(s=>({...s,arrivalDayOffset:dayOffset((s.arrivalDayOffset??0)+context.baseDay),departureDayOffset:dayOffset((s.departureDayOffset??0)+context.baseDay)}))]};
  recompute(next,minute(future.finish,(future.finishDayOffset??0)+context.baseDay));
  return next.result;
}
