import test from 'node:test';
import assert from 'node:assert/strict';
import { applyLiveAction,remainingContext,mergeRemaining } from '../server/liveRepair.ts';
import { makeCurrentPlan,prepareEdit } from '../src/planning/currentPlan.ts';
import { createRealPlanner } from '../server/realPlanner.ts';
import { createApi } from '../server/api.ts';
import { createStore } from '../server/store.mjs';
import { fixture,apiRequest } from './helpers/plannerFixture.ts';
import { normalizeGooglePlace } from '../server/googleProvider.ts';
import { candidateFromPlace } from '../src/planner/estimates.ts';
import type { PlanningRequest } from '../src/planning/types.ts';
import type { OutingStop } from '../src/itinerary/realPlan.ts';
const details=['fast_food_restaurant','bowling_alley','ice_cream_shop','ice_cream_shop'].map((type,i)=>normalizeGooglePlace({id:'TEST_LIVE_'+i,displayName:{text:'TEST live '+i},formattedAddress:'TEST address',location:{latitude:33.8,longitude:-118},primaryType:type,types:[type],businessStatus:'OPERATIONAL',addressComponents:[{types:['country'],shortText:'US'}],regularOpeningHours:{periods:[{open:{day:0,hour:0}}]}}));
const request:PlanningRequest={startingPlace:details[0].place,startingLocation:'TEST origin',date:'2026-10-10',availableStartTime:'16:00',requiredEndTime:'23:00',budgetPerPerson:{amountCents:6000,currency:'USD'},groupSize:5,transportation:'driving',vibeInterests:'dinner activity dessert',startingState:'nothing-planned',existingStops:[]};
const routing={getMatrix:async(points:any[])=>({points,legs:points.map((_,i)=>points.map((__,j)=>({minutes:i===j?0:5,distanceMetres:i===j?0:1500,requestedMode:'driving' as const,actualMode:'driving' as const,source:'google-routes' as const})))}),getRouteEstimate:async()=>null};
const world:any={getPlaceDetails:async(id:string)=>details.find(d=>d.place.provider_place_id===id)!,getPlaceDetailsMany:async(ids:string[])=>new Map(ids.map(id=>[id,{ok:true,details:details.find(d=>d.place.provider_place_id===id)}])),searchPlaces:async()=>({places:details.map(d=>d.place),context:null,warnings:[]})};
function plan() {
 const stops:OutingStop[]=details.slice(0,3).map((d,i)=>{const c=candidateFromPlace(d.place);return{id:c.id,userStopId:null,place:d.place,role:c.role,category:c.category,arrival:['16:15','18:00','20:00'][i],departure:['17:00','19:00','20:30'][i],arrivalDayOffset:0,departureDayOffset:0,fixed:false,exactTime:false,exactEnd:false,duration:{...c.duration,value:[45,60,30][i]},cost:c.cost,travel:{minutes:5,distanceMetres:1500,actualMode:'driving',requestedMode:'driving',source:'google-routes'},transitionMinutes:10,waitMinutes:0,reason:'TEST purpose',note:null,warnings:[],protection:'PLANNER_FLEXIBLE'};});
 return makeCurrentPlan('TEST_RUN',request,{status:'complete',message:null,primaryItinerary:{stops,start:'16:00',finish:'20:30',finishDayOffset:0,costPerPersonCents:stops.reduce((sum,s)=>sum+s.cost.value,0),costRangeCents:{low:0,high:6000},travelMinutes:15,warnings:[]}});
}
const now=new Date('2026-10-09T12:00:00Z');
test('explicit completion records execution only; harmless zero delay makes no new revision',async()=>{
 const before=plan(),done=await applyLiveAction(before,{kind:'complete',placeId:before.result.primaryItinerary.stops[0].id},world,routing,now);
 assert.deepEqual(done.plan.result,before.result);assert.equal(done.plan.execution?.[0].type,'completed');assert.equal(before.execution,undefined);
 const quiet=await applyLiveAction(done.plan,{kind:'late',minutes:0},world,routing,now);assert.equal(quiet.changed,false);assert.equal(quiet.plan.revision,done.plan.revision);
});
test('a delay absorbed by breathing room preserves completed history and all unaffected times',async()=>{
 const before=plan(),done=(await applyLiveAction(before,{kind:'complete',placeId:before.result.primaryItinerary.stops[0].id},world,routing,now)).plan;
 const repaired=await applyLiveAction(done,{kind:'late',minutes:15},world,routing,now);assert.equal(repaired.conflict,null);assert.deepEqual(repaired.plan.result.primaryItinerary.stops[0],done.result.primaryItinerary.stops[0]);assert.equal(repaired.plan.result.primaryItinerary.stops[1].arrival,'18:00');
});
test('meaningful delay shifts only future times, while conflicting fixed arrival is never rewritten',async()=>{
 const before=plan(),done=(await applyLiveAction(before,{kind:'complete',placeId:before.result.primaryItinerary.stops[0].id},world,routing,now)).plan;
 const repaired=await applyLiveAction(done,{kind:'late',minutes:90},world,routing,now);assert.equal(repaired.conflict,null);assert.equal(repaired.plan.result.primaryItinerary.stops[1].arrival,'18:45');assert.equal(repaired.plan.result.primaryItinerary.stops[0].arrival,'16:15');
 done.result.primaryItinerary.stops[1].exactTime=true;done.result.primaryItinerary.stops[1].fixed=true;done.result.primaryItinerary.stops[1].protection='USER_FIXED';
 const conflict=await applyLiveAction(done,{kind:'late',minutes:90},world,routing,now);assert.match(conflict.conflict??'',/fixed/);assert.deepEqual(conflict.plan.result,done.result);assert.equal(conflict.plan.execution?.at(-1)?.type,'late');
});
test('skip preserves actual history, costs recalculate, protected stops and previously completed stops cannot be skipped',async()=>{
 const before=plan(),first=before.result.primaryItinerary.stops[0];const done=(await applyLiveAction(before,{kind:'complete',placeId:first.id},world,routing,now)).plan;
 const target=done.result.primaryItinerary.stops[1];const skipped=await applyLiveAction(done,{kind:'skip',placeId:target.id},world,routing,now);assert.equal(skipped.conflict,null);assert.deepEqual(skipped.plan.result.primaryItinerary.stops[0],done.result.primaryItinerary.stops[0]);assert.equal(skipped.plan.result.primaryItinerary.costPerPersonCents,first.cost.value+done.result.primaryItinerary.stops[2].cost.value);assert.equal(skipped.plan.execution?.at(-1)?.type,'skipped');
 await assert.rejects(applyLiveAction(done,{kind:'skip',placeId:first.id},world,routing,now),/history/);
 done.result.primaryItinerary.stops[1].protection='USER_KEPT';await assert.rejects(applyLiveAction(done,{kind:'skip',placeId:target.id},world,routing,now),/protected/);
 assert.throws(()=>prepareEdit(done,{kind:'change',placeId:first.id}),/history/);
});
test('future one-stop swap merges immutable completed history and preserves original budget/origin intent',async()=>{
 const original=plan(),done=(await applyLiveAction(original,{kind:'complete',placeId:original.result.primaryItinerary.stops[0].id},world,routing,now)).plan;
 const dessert=done.result.primaryItinerary.stops[2],edit=prepareEdit(done,{kind:'change',placeId:dessert.id});const context=remainingContext(done,edit.request,edit.retainedStops,now)!;
 assert.equal(context.request.budgetPerPerson.amountCents,6000-original.result.primaryItinerary.stops[0].cost.value);
 const result=await createRealPlanner(world,routing).build(context.request,{...edit,retainedStops:context.retainedStops});assert.equal(result.result.status,'complete');if(result.result.status!=='complete')return;
 const merged=mergeRemaining(done,result.result.primaryItinerary,context);assert.deepEqual(merged.primaryItinerary.stops[0],done.result.primaryItinerary.stops[0]);assert.ok(merged.primaryItinerary.stops.some(s=>s.id===details[3].place.provider_place_id));assert.equal(done.request.budgetPerPerson.amountCents,6000);
});
test('execution persists across API restart and future edits retain completed stops',async()=>{
 const store=createStore(':memory:'),f=fixture();let api=createApi({store,env:{GOOGLE_MAPS_SERVER_KEY:'TEST'},fetcher:f.fetcher,now:f.now});try{
 const created=await(await api(apiRequest('/api/plans',{draft:f.draft}))).json(),first=created.currentPlan.result.primaryItinerary.stops[0];
 const response=await api(apiRequest('/api/plans/live',{planId:created.currentPlan.id,revision:1,action:{kind:'complete',placeId:first.id}},created.planKey));assert.equal(response.status,200);const done=(await response.json()).currentPlan;
 api=createApi({store,env:{GOOGLE_MAPS_SERVER_KEY:'TEST'},fetcher:f.fetcher,now:f.now});const reopened=(await(await api(apiRequest('/api/plans/'+done.id,undefined,created.planKey))).json()).currentPlan;assert.deepEqual(reopened.execution,done.execution);assert.equal(reopened.revision,2);
 const dessert=reopened.result.primaryItinerary.stops.find((s:any)=>s.role==='dessert'&&s.id!==first.id);if(dessert){const changed=await(await api(apiRequest('/api/plans/edit',{planId:done.id,revision:2,edit:{kind:'change',placeId:dessert.id}},created.planKey))).json();assert.equal(changed.conflict,null,JSON.stringify(changed));assert.equal(changed.currentPlan.result.primaryItinerary.stops[0].id,first.id);assert.equal(changed.currentPlan.result.primaryItinerary.stops[0].arrival,first.arrival);assert.equal(changed.currentPlan.request.budgetPerPerson.amountCents,4000);}
 }finally{store.close();}
});
test('overnight edits preserve original day offsets when the remaining outing starts after midnight',async()=>{
 const original=plan();original.request={...request,date:'2026-10-10',availableStartTime:'22:00',requiredEndTime:'03:00',endDayOffset:1,endDate:'2026-10-11'};
 const stops=original.result.primaryItinerary.stops;stops[0].arrival='22:15';stops[0].departure='23:00';stops[1].arrival='00:30';stops[1].arrivalDayOffset=1;stops[1].departure='01:30';stops[1].departureDayOffset=1;stops[2].arrival='02:00';stops[2].arrivalDayOffset=1;stops[2].departure='02:30';stops[2].departureDayOffset=1;
 original.result.primaryItinerary.start='22:00';original.result.primaryItinerary.finish='02:30';original.result.primaryItinerary.finishDayOffset=1;
 original.execution=[{at:'2026-10-11T07:00:00Z',type:'completed',placeId:stops[0].id}];
 const context=remainingContext(original,original.request,stops,new Date('2026-10-11T07:10:00Z'))!;
 assert.equal(context.baseDay,1);assert.equal(context.request.date,'2026-10-11');assert.equal(context.request.availableStartTime,'00:10');assert.equal(context.retainedStops[0].arrivalDayOffset,0);
 const future={...original.result.primaryItinerary,start:'00:10',finish:'02:30',finishDayOffset:0 as const,stops:context.retainedStops};
 const merged=mergeRemaining(original,future,context);assert.deepEqual(merged.primaryItinerary.stops[0],stops[0]);assert.equal(merged.primaryItinerary.stops[1].arrivalDayOffset,1);assert.equal(merged.primaryItinerary.finishDayOffset,1);
});
