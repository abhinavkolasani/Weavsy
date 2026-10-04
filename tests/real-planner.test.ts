import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhoton } from '../server/worldProvider.ts';
import { createRoutingService } from '../server/routingProvider.ts';
import { createRealPlanner, finalConflicts } from '../server/realPlanner.ts';
import { candidateFromPlace } from '../src/planner/estimates.ts';
import { lightweightIntent } from '../src/planner/intent.ts';
import { schedule, findWindows, fixedConflicts } from '../src/planner/schedule.ts';
import { normalizeOpeningHours } from '../src/world/openingHours.ts';
import { restoreState, initialState } from '../src/planning/state.ts';
import { emptyDraft } from '../src/planning/draft.ts';
import { validateRequest } from '../src/planning/validate.ts';
import { createFounderMetadata } from '../src/founder/metadata.ts';
import type { PlanningRequest, ExistingStop } from '../src/planning/types.ts';
import type { RouteMatrix, RouteEstimate } from '../src/routing/types.ts';
import type { WorldProvider } from '../src/world/types.ts';
// Isolated deterministic fixtures, never part of the normal live candidate provider.
const place=(id:number,type='restaurant')=>normalizePhoton({properties:{osm_type:'N',osm_id:id,name:`TEST_FIXTURE_${id}`,osm_key:'amenity',osm_value:type},geometry:{coordinates:[-118.24+id*.00001,34.05]}},'2026-10-02T12:00:00Z')!;
const origin=place(1000,'town'),food=place(1001),bowling={...place(1002),primary_type:'leisure:bowling_alley'},park={...place(1003),primary_type:'leisure:park'};
const request=(patch:Partial<PlanningRequest>={}):PlanningRequest=>({startingLocation:origin.display_name,startingPlace:origin,date:'2026-10-02',availableStartTime:'18:00',requiredEndTime:'22:00',budgetPerPerson:{amountCents:4000,currency:'USD'},groupSize:5,transportation:'driving',vibeInterests:'dinner and something fun',startingState:'nothing-planned',existingStops:[],...patch});
const existing=(p=food,startTime:string|null='19:00',fixed=true):ExistingStop=>({id:p.provider_place_id,name:p.display_name,place:p,source:'user',entryKind:'place',fixed,startTime,endTime:null,durationMinutes:null,note:'Keep me',constraints:{preservePlace:fixed,preserveStartTime:fixed&&!!startTime,preserveEndTime:false,preserveDuration:false}});
const input=(r=request())=>({request:r,intent:lightweightIntent.normalize(r),start:1080,desiredFinish:1320});
const leg:RouteEstimate={minutes:5,distanceMetres:1500,actualMode:'driving',requestedMode:'driving',source:'osrm-road-network'};
function matrix(size:number):RouteMatrix {return {points:Array.from({length:size},()=>origin),legs:Array.from({length:size},(_,i)=>Array.from({length:size},(_,j)=>i===j?{...leg,minutes:0,distanceMetres:0}:structuredClone(leg)))};}
test('casual language produces useful, different outing roles and explicit cap is separate',()=>{
 assert.deepEqual(lightweightIntent.normalize(request({vibeInterests:'chill'})).desiredRoles,['meal','walk-explore']);
 assert.deepEqual(lightweightIntent.normalize(request({vibeInterests:'flicks'})).desiredRoles,['meal','main-activity']);
 assert.equal(lightweightIntent.normalize(request({vibeInterests:'something active'})).mood,'active');
 assert.equal(lightweightIntent.normalize(request()).budgetPolicy,'target');
 assert.equal(lightweightIntent.normalize(request({vibeInterests:'dinner, hard cap $43'})).hardCapCents,4300);
});
test('$40 per person is not divided by five and a good $43 plan may pass',()=>{
 const pool=[candidateFromPlace(food),candidateFromPlace(bowling)];pool[0].cost={...pool[0].cost,value:1800};
 const result=schedule(input(),pool,matrix(3));assert.equal(result.stops.length,2);assert.equal(result.stops.reduce((s,c)=>s+c.candidate.cost.value,0),4300);assert.equal(input().request.budgetPerPerson.amountCents,4000);
});
test('fixed dinner stays at 7 PM, including travel before and after',()=>{
 const r=request({existingStops:[existing()],startingState:'reservation'});const pool=[candidateFromPlace(food,r.existingStops[0]),candidateFromPlace(bowling)];
 const result=schedule(input(r),pool,matrix(3));assert.equal(result.stops.length,2);assert.equal(result.stops.find(s=>s.candidate.userStopId)!.arrival,1140);assert.deepEqual(finalConflicts(r,result.stops),[]);
 const windows=findWindows(input(r),pool.filter(c=>c.userStopId));assert.deepEqual(windows.map(w=>[w.start,w.end]),[[1080,1140],[1215,1320]]);
});
test('overlapping fixed commitments fail before discovery; no fixed intent is moved',()=>{
 const r=request({existingStops:[existing(food,'19:00'),existing(bowling,'19:30')]});assert(fixedConflicts(input(r),r.existingStops.map(s=>candidateFromPlace(s.place!,s))).length);
 const pool=r.existingStops.map(s=>candidateFromPlace(s.place!,s));assert.equal(schedule(input(r),pool,matrix(3)).stops.length,0);assert.equal(r.existingStops[0].startTime,'19:00');
});
test('actual route duration makes an impossible reservation fail',()=>{
 const r=request({existingStops:[existing(food,'18:05')],startingState:'reservation'});const pool=[candidateFromPlace(food,r.existingStops[0]),candidateFromPlace(bowling)];const routes=matrix(3);routes.legs[0][1]={...leg,minutes:30};assert.equal(schedule(input(r),pool,routes).stops.length,0);
});
test('known closed places rejected and fixed end/duration preserved',()=>{
 const r=request({vibeInterests:'dinner',existingStops:[{...existing(),endTime:'20:10'}]});const c=candidateFromPlace(food,r.existingStops[0]);
 let result=schedule(input(r),[c],matrix(2));assert.equal(result.stops[0].departure,1210);
 c.openingInformation=normalizeOpeningHours('Mo-Su 09:00-17:00');result=schedule(input(r),[c],matrix(2));assert.equal(result.stops.length,0);assert(result.rejected.some(r=>r.code==='CLOSED'));
});
test('fixed and flexible user identities all survive, flexible times may shift',()=>{
 const r=request({vibeInterests:'chill',existingStops:[existing(food),existing(park,'18:00',false)]});const pool=r.existingStops.map(s=>candidateFromPlace(s.place!,s));const result=schedule(input(r),pool,matrix(3));assert.equal(result.stops.length,2);assert.deepEqual(finalConflicts(r,result.stops),[]);assert.equal(result.stops.find(s=>s.candidate.id===park.provider_place_id)!.candidate.fixed,false);
});
test('route adapter uses true car/foot services, rejects unreachable and malformed data',async()=>{
 const urls:string[]=[];const router=createRoutingService({intervalMs:0,fetcher:async(url)=>{urls.push(String(url));return Response.json({code:'Ok',durations:[[0,120],[120,null]],distances:[[0,600],[600,null]],sources:[{distance:0},{distance:0}],destinations:[{distance:0},{distance:0}]});}});
 assert.equal((await router.getMatrix([origin,food],'driving')).legs[0][1]?.minutes,2);
 assert.equal((await router.getMatrix([origin,food],'walking')).legs[0][1]?.actualMode,'walking');assert.match(urls[0],/routed-car/);assert.match(urls[1],/routed-foot/);assert(!urls.some(u=>u.includes('fallback_speed')));
 const broken=createRoutingService({intervalMs:0,fetcher:async()=>Response.json({code:'Ok',durations:[],distances:[]})});await assert.rejects(()=>broken.getMatrix([origin,food],'driving'),/incomplete/);
});
test('missing real candidate service returns no plan, never fabricated fallback',async()=>{
 const world={searchPlaces:async()=>{throw new Error('Source unavailable');}} as unknown as WorldProvider;
 const routing={getMatrix:async()=>matrix(1),getRouteEstimate:async()=>null};const run=await createRealPlanner(world,routing).build(request());assert.equal(run.result.status,'no-plan');assert.equal(run.result.primaryItinerary,null);assert.equal(run.diagnostics.conflicts[0],'Source unavailable');
});
test('venue-free activity asks one geographic clarification instead of inventing a venue',async()=>{
 const r=request({existingStops:[{...existing(),place:null,entryKind:'activity',name:'Walk with my dog'}]});const run=await createRealPlanner({} as WorldProvider,{} as any).build(r);assert.equal(run.result.status,'clarification');assert.match(run.result.message??'',/exact-time activity/);
});
test('real results survive refresh, broken results safely fall back to the form',async()=>{
 const world={searchPlaces:async()=>({places:[food,bowling],context:origin,warnings:[]}),getPlaceDetails:async(id:string)=>({place:[food,bowling].find(p=>p.provider_place_id===id)!,opening_hours:null,business_status:'listed',website:null,warnings:[],estimated_cost_per_person:null,typical_duration_minutes:null})} as WorldProvider;
 const result=await createRealPlanner(world,{getMatrix:async(points)=>matrix(points.length),getRouteEstimate:async()=>leg}).build(request());assert.equal(result.result.status,'complete');
 const draft={...emptyDraft(),startingLocation:origin.display_name,startingPlace:origin,date:'2026-10-02',availableStartTime:'18:00',requiredEndTime:'22:00',budgetPerPerson:'40',groupSize:'5',transportation:'driving' as const,vibeInterests:'dinner and something fun'};assert(validateRequest(draft).ok);
 const state={...initialState(),screen:'results',draft,submission:{request:request(),result:result.result,metadata:{...createFounderMetadata(),batch:3,plannerStatus:'built'}}};assert.equal(restoreState(JSON.stringify(state)).screen,'results');
 const malformed=structuredClone(state);(malformed.submission.result.primaryItinerary as any).stops[0].cost=null;assert.equal(restoreState(JSON.stringify(malformed)).screen,'form');
});
