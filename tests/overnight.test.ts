import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDraft, newStop } from '../src/planning/draft.ts';
import { validateRequest } from '../src/planning/validate.ts';
import { outingWindow, stopTiming, preserveStopDays } from '../src/planning/timeline.ts';
import { parseTypedTime, displayTime } from '../src/planning/displayTime.ts';
import { normalizeGooglePlace } from '../server/googleProvider.ts';
import { candidateFromPlace } from '../src/planner/estimates.ts';
import { isOpen, hasOpeningWindow } from '../src/planner/schedule.ts';
import { createRealPlanner, finalConflicts } from '../server/realPlanner.ts';
import { isRealPlanResult } from '../src/itinerary/realPlan.ts';
import { serializeSession, hydrateSession } from '../src/world/durable.ts';
const details=(id='TEST_OVERNIGHT_RESTAURANT',type='restaurant')=>normalizeGooglePlace({id,displayName:{text:'TEST overnight venue'},formattedAddress:'TEST address',location:{latitude:34.05,longitude:-118.24},primaryType:type,types:[type],addressComponents:[{types:['country'],shortText:'US'}],businessStatus:'OPERATIONAL',regularOpeningHours:{periods:[{open:{day:0,hour:0}}]}});
const origin=details('TEST_OVERNIGHT_ORIGIN','locality').place;
const draft=()=>({...emptyDraft(),date:'2026-10-02',startingLocation:origin.display_name,startingPlace:origin,availableStartTime:'22:00',requiredEndTime:'03:00',budgetPerPerson:'80',groupSize:'5',transportation:'driving' as const,vibeInterests:'dinner and something fun'});
test('typed hours/minutes keep an explicit AM/PM period, including noon and midnight',()=>{
 assert.equal(parseTypedTime('12:00','AM'),'00:00');assert.equal(parseTypedTime('12:00','PM'),'12:00');assert.equal(parseTypedTime('7:30','PM'),'19:30');assert.equal(parseTypedTime('7','AM'),'07:00');
 for(const value of ['16:00','0:00','7:60','7:3','-1','oops'])assert.equal(parseTypedTime(value,'PM'),null);
 assert.equal(displayTime('00:30',1),'12:30 AM (next day)');
});
test('midnight and morning finish are structured as the next date, including year rollover',()=>{
 for(const end of ['00:00','03:00','08:00']){const r=validateRequest({...draft(),date:'2026-12-31',requiredEndTime:end});assert.ok(r.ok);assert.equal(r.request.requiredEndTime,end);assert.equal(r.request.endDayOffset,1);assert.equal(r.request.endDate,'2027-01-01');assert.ok(outingWindow(r.request).finish>outingWindow(r.request).start);}
 assert.equal(validateRequest({...draft(),requiredEndTime:'22:00'}).ok,false);
 const same=validateRequest({...draft(),availableStartTime:'09:00',requiredEndTime:'17:00'});assert.ok(same.ok);assert.equal(same.request.endDayOffset,0);
});
test('overnight finish does not make an already-past start valid',()=>{
 assert.equal(validateRequest({...draft(),availableStartTime:'20:00',requiredEndTime:'00:00'},{notBefore:{date:'2026-10-02',time:'21:00'}}).ok,false);
});
test('fixed stops retain after-midnight dates and crossing-midnight durations',()=>{
 const d={...draft(),startingState:'partial-plan' as const,existingStops:[{...newStop(true),name:details().place.display_name,place:details().place,startTime:'23:15',timingDetail:'end-time' as const,endTime:'00:45'},{...newStop(true),name:details('TEST_OVERNIGHT_LATER').place.display_name,place:details('TEST_OVERNIGHT_LATER').place,startTime:'01:00',timingDetail:'duration' as const,durationMinutes:'60'}]};
 const r=validateRequest(d);assert.ok(r.ok);assert.equal(r.request.existingStops[0].startDayOffset,0);assert.equal(r.request.existingStops[0].endDayOffset,1);assert.equal(r.request.existingStops[1].startDayOffset,1);
 const c=candidateFromPlace(r.request.existingStops[0].place!,r.request.existingStops[0],r.request);assert.equal(c.duration.value,90);assert.equal(c.fixedStart,1395);assert.equal(c.fixedEnd,1485);
 assert.equal(stopTiming(r.request,r.request.existingStops[1]).start,1500);
});
test('changing the outing start cannot silently move the day of an existing fixed decision',()=>{
 const d={...draft(),availableStartTime:'18:00',existingStops:[{...newStop(true),name:'TEST fixed dinner',startTime:'19:00'},{...newStop(true),name:'TEST late stop',startTime:'00:30'}]};
 const protectedDraft=preserveStopDays(d);
 assert.equal(stopTiming({...protectedDraft,availableStartTime:'20:00'},protectedDraft.existingStops[0]).start,1140);
 assert.equal(stopTiming({...protectedDraft,availableStartTime:'00:05'},protectedDraft.existingStops[1]).start,1470);
});
test('opening hours join across midnight but next-day closures still reject visits',()=>{
 const c=candidateFromPlace(details().place);const weekly=Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day=>[day,[]]));
 weekly.friday=[{opens:'20:00',closes:'24:00'}];weekly.saturday=[{opens:'00:00',closes:'02:00'}];
 c.openingInformation={source_expression:'TEST hours',weekly};
 assert.equal(isOpen(c,'2026-10-02',1410,1470),true);assert.equal(isOpen(c,'2026-10-02',1500,1590),false);
 assert.equal(hasOpeningWindow(c,'2026-10-02',1440,1560),true);
 c.openingInformation.dated={'2026-10-03':[]};assert.equal(isOpen(c,'2026-10-02',1410,1470),false);
 assert.equal(isOpen(c,'2026-10-02',1380,1440),true);
});
async function buildFixed(start='23:30',end='00:30'){
 const meal=details(),bowling=details('TEST_OVERNIGHT_BOWLING','bowling_alley');
 const valid=validateRequest({...draft(),startingState:'reservation',existingStops:[{...newStop(true),name:meal.place.display_name,place:meal.place,startTime:start,timingDetail:'end-time',endTime:end,note:'Keep this late reservation'}]});assert.ok(valid.ok);
 const world={searchPlaces:async q=>({places:q.types[0]==='bowling'?[bowling.place]:q.types[0].includes('food')?[meal.place]:[],context:q.location,warnings:[]}),getPlaceDetails:async id=>[meal,bowling].find(d=>d.place.provider_place_id===id),getPlaceDetailsMany:async ids=>new Map(ids.map(id=>[id,{ok:true,details:[meal,bowling].find(d=>d.place.provider_place_id===id)}]))};
 const routing={getMatrix:async(points,mode)=>({points,legs:points.map((_,i)=>points.map((__,j)=>({minutes:i===j?0:5,distanceMetres:i===j?0:1500,requestedMode:mode,actualMode:'driving',source:'google-routes'})))})};
 return {valid,run:await createRealPlanner(world as any,routing as any).build(valid.request)};
}
test('complete planner crosses midnight and protects a next-day fixed stop',async()=>{
 const {valid,run}=await buildFixed('00:30','01:30');assert.equal(run.result.status,'complete');if(run.result.status!=='complete')return;
 const fixed=run.result.primaryItinerary.stops.find(s=>s.fixed)!;assert.equal(fixed.arrival,'00:30');assert.equal(fixed.arrivalDayOffset,1);assert.equal(fixed.departure,'01:30');assert.equal(fixed.departureDayOffset,1);assert.equal(fixed.duration.value,60);
 assert.equal(run.result.primaryItinerary.finishDayOffset,1);assert.equal(isRealPlanResult(run.result),true);assert.deepEqual(finalConflicts(valid.request,run.diagnostics.selected),[]);
 const wrong=structuredClone(run.diagnostics.selected);wrong.find(s=>s.candidate.fixed)!.arrival-=1440;assert.ok(finalConflicts(valid.request,wrong).length);
 const broken=structuredClone(run.result);broken.primaryItinerary.finishDayOffset=2 as any;assert.equal(isRealPlanResult(broken),false);
});
test('fixed visit spanning midnight keeps its supplied end and duration',async()=>{
 const {run}=await buildFixed();assert.equal(run.result.status,'complete');if(run.result.status!=='complete')return;
 const fixed=run.result.primaryItinerary.stops.find(s=>s.fixed)!;assert.equal(fixed.arrivalDayOffset,0);assert.equal(fixed.departureDayOffset,1);assert.equal(fixed.duration.value,60);assert.equal(fixed.departure,'00:30');
});
test('refresh preserves overnight fixed intent without persisting Google content',async()=>{
 const venue=details();const d={...draft(),startingState:'reservation' as const,existingStops:[{...newStop(true),name:venue.place.display_name,place:venue.place,startTime:'00:30',startDayOffset:1 as const,note:'Keep the next-day reservation'}]};
 const encoded=serializeSession({version:1,screen:'form',draft:d,submission:null});const refreshed=await hydrateSession(encoded,async id=>id===origin.provider_place_id?details('TEST_OVERNIGHT_ORIGIN','locality'):venue);
 const r=validateRequest(refreshed.state.draft);assert.ok(r.ok);assert.equal(r.request.endDayOffset,1);assert.equal(r.request.existingStops[0].fixed,true);assert.equal(r.request.existingStops[0].startTime,'00:30');assert.equal(r.request.existingStops[0].startDayOffset,1);assert.equal(r.request.existingStops[0].note,'Keep the next-day reservation');
});
