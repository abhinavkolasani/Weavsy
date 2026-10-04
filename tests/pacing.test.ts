import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGooglePlace } from '../server/googleProvider.ts';
import { candidateFromPlace } from '../src/planner/estimates.ts';
import { suggestedStopCount } from '../src/planner/pacing.ts';
import { schedule } from '../src/planner/schedule.ts';
import { lightweightIntent } from '../src/planner/intent.ts';
import { createRealPlanner, finalConflicts } from '../server/realPlanner.ts';
import type { PlanningRequest } from '../src/planning/types.ts';
const types=['fast_food_restaurant','bowling_alley','park','cafe','ice_cream_shop','shopping_mall'];
// Isolated synthetic engineering fixtures; the product uses only live Google places.
const make=(id:string,type:string,index=0)=>normalizeGooglePlace({id,displayName:{text:'TEST '+id},formattedAddress:'TEST address',location:{latitude:34.05,longitude:-118.24+index*.0001},primaryType:type,types:[type],businessStatus:'OPERATIONAL',addressComponents:[{types:['country'],shortText:'US'}],regularOpeningHours:{periods:[{open:{day:0,hour:0}}]}});
const fixtures=types.map((type,i)=>make('TEST_PACING_'+i,type,i));
const origin=make('TEST_PACING_ORIGIN','locality').place;
const request=(hours=6,budget=8000):PlanningRequest=>({startingPlace:origin,startingLocation:origin.display_name,date:'2026-10-03',availableStartTime:'09:00',requiredEndTime:String(9+hours).padStart(2,'0')+':00',budgetPerPerson:{amountCents:budget,currency:'USD'},groupSize:5,transportation:'driving',vibeInterests:'dinner and something fun',startingState:'nothing-planned',existingStops:[]});
const pool=()=>fixtures.map(d=>{const c=candidateFromPlace(d.place);c.openingInformation=d.opening_hours;c.hoursChecked=true;return c;});
const matrix=(points:any[])=>({points,legs:points.map((_,i)=>points.map((__,j)=>({minutes:i===j?0:3,distanceMetres:i===j?0:1000,requestedMode:'driving' as const,actualMode:'driving' as const,source:'google-routes' as const})))});
function run(r:PlanningRequest,candidates=pool()) {return schedule({request:r,intent:lightweightIntent.normalize(r),start:540,desiredFinish:540+(Number(r.requiredEndTime.slice(0,2))-9)*60},candidates,matrix([origin,...candidates.map(c=>c.place)]));}
test('longer outings add distinct experiences without padding with coffee after dessert',()=>{
  for(const [hours,count] of [[3,2],[4,3],[6,4],[8,5],[10,5]]) {
    const r=request(hours),result=run(r);assert.equal(result.conflict,null);assert.equal(result.stops.length,count,`${hours}-hour outing`);
    assert.equal(new Set(result.stops.map(s=>s.candidate.id)).size,count);assert.equal(result.stops.filter(s=>s.candidate.role==='meal').length,1);assert.ok(result.stops.at(-1)!.departure<=540+hours*60+15);assert.deepEqual(finalConflicts(r,result.stops),[]);
  }
  assert.equal(suggestedStopCount(90),1);assert.equal(suggestedStopCount(1400),6);
});
test('extra stops respect a per-person budget and a hard cap rather than filling a quota',()=>{
  const r=request(8,4000),result=run(r);assert.equal(result.conflict,null);assert.equal(result.stops.length,3);assert.equal(result.stops.reduce((s,c)=>s+c.candidate.cost.value,0),4000);assert.equal(r.budgetPerPerson.amountCents,4000);
  const strict={...r,vibeInterests:'dinner and something fun, hard cap $20'},limited=run(strict);assert.ok(limited.stops.length>0);assert.ok(limited.stops.reduce((sum,s)=>sum+s.candidate.cost.value,0)<=2000);assert.ok(limited.rejected.some(r=>r.code==='HARD_BUDGET_CAP'));
});
test('closed extra places leave a valid shorter recommendation',()=>{
  const candidates=pool();for(const c of candidates.filter(c=>!['meal','main-activity'].includes(c.role)))c.openingInformation={source_expression:'TEST closed',weekly:Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(d=>[d,[]]))};
  const result=run(request(8),candidates);assert.equal(result.conflict,null);assert.equal(result.stops.length,2);assert.ok(result.rejected.some(r=>r.code==='CLOSED'));
});
test('duration-based scheduling keeps every supplied existing stop even above the automatic target',()=>{
  const r=request(8);r.startingState='almost-complete';
  r.existingStops=Array.from({length:7},(_,i)=>{const d=make('TEST_EXISTING_'+i,'cafe',i);return {id:'user_'+i,name:d.place.display_name,place:d.place,fixed:false,startTime:null,endTime:null,durationMinutes:30,note:null,constraints:{preservePlace:false,preserveStartTime:false,preserveEndTime:false,preserveDuration:false}};});
  const candidates=r.existingStops.map(s=>candidateFromPlace(s.place!,s,r)),result=run(r,candidates);assert.equal(result.conflict,null);assert.equal(result.stops.length,7);assert.deepEqual(finalConflicts(r,result.stops),[]);
});
test('long live-provider planning adds variety while keeping one bounded route matrix',async()=>{
  const records=types.flatMap((type,i)=>Array.from({length:6},(_,j)=>make(`TEST_BOUND_${i}_${j}`,type,i*6+j)));
  const groups:Record<string,string>={food:'fast_food_restaurant','casual-food':'fast_food_restaurant',bowling:'bowling_alley',park:'park',cafe:'cafe',dessert:'ice_cream_shop',shopping:'shopping_mall'};
  let searches=0,matrices=0,size=0;
  const world={searchPlaces:async(q:any)=>{searches++;return{places:records.filter(p=>p.place.primary_type===groups[q.types[0]]).map(p=>p.place),context:q.location,warnings:[]};},getPlaceDetailsMany:async(ids:string[])=>new Map(ids.map(id=>[id,{ok:true,details:records.find(d=>d.place.provider_place_id===id)!}])),getPlaceDetails:async(id:string)=>records.find(d=>d.place.provider_place_id===id)!};
  const result=await createRealPlanner(world as any,{getMatrix:async(points:any[])=>{matrices++;size=points.length;return matrix(points);}} as any).build(request(8));
  assert.equal(result.result.status,'complete');if(result.result.status!=='complete')return;assert.equal(result.result.primaryItinerary.stops.length,5);assert.ok(searches<=7);assert.equal(matrices,1);assert.ok(size<=14);assert.deepEqual(finalConflicts(request(8),result.diagnostics.selected),[]);
});
test('Google takeaway and delivery categories are meals, not entertainment stops',()=>{
  for(const type of ['meal_delivery','meal_takeaway']){const c=candidateFromPlace(make('TEST_FOOD_'+type,type).place);assert.equal(c.role,'meal');assert.equal(c.category,'Casual food');}
});
