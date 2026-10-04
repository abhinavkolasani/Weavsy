import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGooglePlace, createGoogleWorldProvider, PLANNING_FIELDS } from '../server/googleProvider.ts';
import { qualifyPlace } from '../src/planner/qualification.ts';
import { candidateFromPlace } from '../src/planner/estimates.ts';
import { lightweightIntent, interestSuggestions } from '../src/planner/intent.ts';
import { createRealPlanner } from '../server/realPlanner.ts';
import { makeCurrentPlan, keepDecision, prepareEdit } from '../src/planning/currentPlan.ts';
import { openingStatus, isOpen, schedule } from '../src/planner/schedule.ts';
import { durableRun } from '../server/durableRun.ts';
import type { PlanningRequest } from '../src/planning/types.ts';
import { createApi } from '../server/api.ts';
import { emptyDraft, newStop } from '../src/planning/draft.ts';
import { validateRequest } from '../src/planning/validate.ts';
const raw=(id:string,type:string,extras:any={})=>({id,displayName:{text:'TEST '+id},formattedAddress:'TEST address',location:{latitude:33.82,longitude:-118.04},primaryType:type,types:[type],businessStatus:'OPERATIONAL',addressComponents:[{types:['country'],shortText:'US'}],regularOpeningHours:{periods:[{open:{day:0,hour:0}}]},...extras});
const records=[raw('TEST_TRUST_BEACH','beach'),raw('TEST_TRUST_MEAL','fast_food_restaurant'),raw('TEST_TRUST_DESSERT_A','ice_cream_shop'),raw('TEST_TRUST_DESSERT_B','ice_cream_shop'),raw('TEST_TRUST_COFFEE','cafe'),raw('TEST_TRUST_ACTIVITY','bowling_alley')].map(p=>normalizeGooglePlace(p));
const origin=normalizeGooglePlace(raw('TEST_TRUST_ORIGIN','locality')).place;
const request=(patch:Partial<PlanningRequest>={}):PlanningRequest=>({startingPlace:origin,startingLocation:origin.display_name,date:'2026-10-04',availableStartTime:'17:00',requiredEndTime:'20:00',budgetPerPerson:{amountCents:4000,currency:'USD'},groupSize:2,transportation:'driving',vibeInterests:'dinner beach calm walk around ice cream',startingState:'anchor',existingStops:[{id:'experience',name:'beach',entryKind:'activity',place:null,fixed:false,startTime:null,endTime:null,durationMinutes:null,note:null,constraints:{preservePlace:false,preserveStartTime:false,preserveEndTime:false,preserveDuration:false}}],...patch});
const routes={getMatrix:async(points:any[])=>({points,legs:points.map((_,i)=>points.map((__,j)=>({minutes:i===j?0:5,distanceMetres:i===j?0:1500,requestedMode:'driving' as const,actualMode:'driving' as const,source:'google-routes' as const})))}),getRouteEstimate:async()=>null};
function world(data=records){return {searchPlaces:async(q:any)=>({places:data.filter(p=>qualifyPlace(p.place,q.types[0]).accepted).map(d=>d.place),context:q.location,warnings:[]}),getPlaceDetailsMany:async(ids:string[])=>new Map(ids.map(id=>[id,{ok:true as const,details:data.find(d=>d.place.provider_place_id===id)!}])),getPlaceDetails:async(id:string)=>data.find(d=>d.place.provider_place_id===id)!};}
async function build(r=request(),context={}){return createRealPlanner(world() as any,routes).build(r,context);}
test('sanity qualification rejects non-consumer, generic and mismatched entities before ranking',()=>{
 for(const type of ['prison','courthouse','government_office','police','hospital','school','corporate_office','route','intersection','street_address','locality','point_of_interest']) {
  const p=normalizeGooglePlace(raw('TEST_INVALID_'+type,type,{types:type==='point_of_interest'?[type]:[type,'restaurant']})).place;
  const q=qualifyPlace(p,'food');assert.equal(q.accepted,false,type);
 }
 assert.equal(qualifyPlace(records[0].place,'food').reason,'ROLE_MISMATCH');
 assert.equal(qualifyPlace(records[1].place,'food').confidence,'high');
 const secondary=normalizeGooglePlace(raw('TEST_SECONDARY','point_of_interest',{types:['point_of_interest','bakery']})).place;
 assert.equal(qualifyPlace(secondary,'dessert').confidence,'medium');assert.equal(candidateFromPlace(secondary).role,'dessert');
});
test('an explicit cap and home deadline remain structured independently of the soft target',()=>{
 const draft={...emptyDraft(),startingLocation:origin.display_name,startingPlace:origin,date:'2026-10-04',availableStartTime:'17:00',requiredEndTime:'23:00',budgetPerPerson:'50',groupSize:'5',transportation:'driving' as const,vibeInterests:'Dinner, do not go over $40 per person. Must be home by 10:30 PM.'};
 const valid=validateRequest(draft,{requirePlaceSelections:true});assert.ok(valid.ok);assert.equal(valid.request.budgetPerPerson.amountCents,5000);assert.equal(valid.request.budgetCapPerPersonCents,4000);assert.equal(valid.request.requiredEndTime,'22:30');assert.equal(valid.request.finishIsHard,true);assert.equal(valid.request.returnToStart,true);
});
test('a museum experience cannot be satisfied by a bowling venue just because both are main activities',async()=>{
 assert.equal(qualifyPlace(records[5].place,'museum').accepted,false);
 const museum=request({vibeInterests:'museum',existingStops:[{...request().existingStops[0],name:'museum'}]});
 const run=await build(museum);assert.equal(run.result.status,'no-plan');
});
test('changing an optional stop requires one replacement of the same role and preserves all other IDs',async()=>{
 const initial=await build(request({requiredEndTime:'23:00',vibeInterests:'dinner beach dessert',existingStops:[]}));assert.equal(initial.result.status,'complete');if(initial.result.status!=='complete')return;
 const dessert=initial.result.primaryItinerary.stops.find(s=>s.role==='dessert')!;
 const current=makeCurrentPlan('TEST_RUN',request({requiredEndTime:'23:00',vibeInterests:'dinner beach dessert',existingStops:[]}),initial.result);
 const edit=prepareEdit(current,{kind:'change',placeId:dessert.id});const run=await build(edit.request,edit);assert.equal(run.result.status,'complete');if(run.result.status!=='complete')return;
 assert.equal(run.result.primaryItinerary.stops.length,initial.result.primaryItinerary.stops.length);assert.ok(run.result.primaryItinerary.stops.some(s=>s.role==='dessert'&&s.id!==dessert.id));assert.deepEqual(run.result.primaryItinerary.stops.filter(s=>s.role!=='dessert').map(s=>s.id).sort(),initial.result.primaryItinerary.stops.filter(s=>s.role!=='dessert').map(s=>s.id).sort());
});
test('a kept place can move to satisfy a legal earlier finish without freezing its inferred arrival',async()=>{
 const initial=await build(request({requiredEndTime:'22:00'}));assert.equal(initial.result.status,'complete');if(initial.result.status!=='complete')return;
 const plan=makeCurrentPlan('TEST_RUN',request({requiredEndTime:'22:00'}),initial.result),beach=plan.result.primaryItinerary.stops.find(s=>s.category==='Beach')!;
 const kept=keepDecision(plan,beach.id);assert.equal(kept.result.primaryItinerary.stops.find(s=>s.id===beach.id)!.exactTime,false);
 const edit=prepareEdit(kept,{kind:'details',request:{...plan.request,availableStartTime:'15:00',requiredEndTime:'18:00',finishIsHard:true}});const run=await build(edit.request,edit);assert.equal(run.result.status,'complete');if(run.result.status!=='complete')return;
 const moved=run.result.primaryItinerary.stops.find(s=>s.id===beach.id)!;assert.equal(moved.protection,'USER_KEPT');assert.notEqual(moved.arrival,beach.arrival);assert.equal(moved.exactTime,false);assert.ok(run.result.primaryItinerary.finish<='18:00');
});
test('explicitly keeping the beach experience permits a venue change while protecting the experience',async()=>{
 const first=await build();assert.equal(first.result.status,'complete');if(first.result.status!=='complete')return;
 const plan=makeCurrentPlan('TEST_RUN',request(),first.result),beach=plan.result.primaryItinerary.stops.find(s=>s.category==='Beach')!;
 const kept=keepDecision(plan,beach.id);const edit=prepareEdit(kept,{kind:'adjust',text:'Keep the beach experience, different beach'});
 const other=normalizeGooglePlace(raw('TEST_TRUST_OTHER_BEACH','beach'));const run=await createRealPlanner(world([...records,other]) as any,routes).build(edit.request,edit);assert.equal(run.result.status,'complete');if(run.result.status!=='complete')return;
 const next=run.result.primaryItinerary.stops.find(s=>s.role==='scenic-relax')!;assert.notEqual(next.id,beach.id);assert.equal(next.protection,'EXPERIENCE_ANCHOR');assert.equal(next.exactTime,false);
});
test('explicit coffee crawls permit additional cafes even when one cafe is already chosen',async()=>{
 const other=normalizeGooglePlace(raw('TEST_COFFEE_OTHER','cafe')).place;const coffee=candidateFromPlace(records[4].place);coffee.userStopId='chosen';coffee.protection='USER_PLACE';
 const r=request({existingStops:[],vibeInterests:'coffee crawl',requiredEndTime:'21:00'});const input={request:r,intent:lightweightIntent.normalize(r),start:17*60,desiredFinish:21*60};
 const candidates=[coffee,candidateFromPlace(other)];for(const c of candidates){c.openingInformation=records[4].opening_hours;c.hoursChecked=true;}
 const run=schedule(input,candidates,await routes.getMatrix([origin,...candidates.map(c=>c.place)]));assert.equal(run.conflict,null);assert.equal(run.stops.filter(s=>s.candidate.role==='coffee').length,2);
});
test('invalid submissions retain safe validation evidence without making provider calls',async()=>{
 let calls=0;const saved:any[]=[];const api=createApi({env:{GOOGLE_MAPS_SERVER_KEY:'TEST'},store:{get:()=>null,save:r=>{saved.push(r);}},fetcher:async()=>{calls++;throw new Error('Must not call');}});
 const draft={...emptyDraft(),startingLocation:origin.display_name,startingPlace:origin,date:'2026-10-04',availableStartTime:'17:00',requiredEndTime:'21:00',budgetPerPerson:'-1',groupSize:'0',transportation:'driving'};
 const response=await api(new Request('https://outing.test/api/plans',{method:'POST',body:JSON.stringify({draft})}));assert.equal(response.status,400);assert.equal(calls,0);assert.equal(saved[0].status,'validation-error');assert.ok(saved[0].diagnostics.validationErrors.groupSize);assert.equal(JSON.stringify(saved[0]).includes('TEST address'),false);
});
test('provider strict filters and bounded masks avoid arbitrary map entities and Atmosphere fields',async()=>{
 const bodies:any[]=[],masks:string[]=[];
 const google=createGoogleWorldProvider({key:'TEST',fetcher:async(_url,init)=>{bodies.push(JSON.parse(init!.body as string));masks.push((init!.headers as any)['X-Goog-FieldMask']);return Response.json({places:[]});}});
 await google.searchPlaces({query:'restaurants',types:['food'],location:origin});await google.searchPlaces({query:'restaurants in LA',types:['food']});
 assert.deepEqual(bodies[0].includedPrimaryTypes,['restaurant']);assert.equal(bodies[1].strictTypeFiltering,true);
 assert.match(PLANNING_FIELDS,/priceLevel/);assert.match(PLANNING_FIELDS,/regularOpeningHours/);assert.ok(masks.every(m=>!m.includes('*')&&!m.includes('reviews')&&!m.includes('photos')));
});
test('A: experience anchor resolves a real provider fixture beach without freezing chosen venue or time',async()=>{
 const run=await build();assert.equal(run.result.status,'complete');if(run.result.status!=='complete')return;
 assert.equal(run.result.primaryItinerary.stops.length,3);assert.ok(run.result.primaryItinerary.stops.some(s=>s.category==='Beach'));
 assert.equal(run.result.primaryItinerary.stops.filter(s=>['walk-explore','scenic-relax'].includes(s.role)).length,1);
 assert.ok(run.diagnostics.quality?.every(l=>l.passed));assert.equal(run.result.primaryItinerary.stops.find(s=>s.category==='Beach')!.fixed,false);
});
test('B/C: place anchor and exact fixed dinner survive changed budgets and composition',async()=>{
 const fixed={id:'dinner',name:records[1].place.display_name,place:records[1].place,fixed:true,startTime:'19:00',endTime:'19:45',durationMinutes:null,note:null,entryKind:'place' as const,protection:'USER_FIXED' as const,constraints:{preservePlace:true,preserveStartTime:true,preserveEndTime:true,preserveDuration:false}};
 const r=request({requiredEndTime:'22:00',existingStops:[fixed,{...fixed,id:'beach',name:records[0].place.display_name,place:records[0].place,fixed:false,startTime:null,endTime:null,protection:'USER_PLACE'}]});
 const run=await build(r);assert.equal(run.result.status,'complete');if(run.result.status!=='complete')return;
 const dinner=run.result.primaryItinerary.stops.find(s=>s.id===fixed.place.provider_place_id)!;assert.equal(dinner.arrival,'19:00');assert.equal(dinner.departure,'19:45');assert.ok(run.result.primaryItinerary.stops.some(s=>s.category==='Beach'));
});
test('D: desserts and coffee are one refreshment family unless a crawl was explicitly requested',async()=>{
 const run=await build(request({vibeInterests:'dinner chill dessert',existingStops:[],startingState:'nothing-planned',requiredEndTime:'23:00'}));assert.equal(run.result.status,'complete');if(run.result.status!=='complete')return;
 const refresh=run.result.primaryItinerary.stops.filter(s=>['coffee','dessert'].includes(s.role));assert.equal(refresh.length,1);assert.equal(refresh[0].role,'dessert');
 assert.deepEqual(lightweightIntent.normalize(request({vibeInterests:'coffee crawl'})).repeatRoles,['coffee']);
});
test('F/K: closed businesses and insufficient hours reject; missing or partial hours stay uncertain',async()=>{
 const closed=normalizeGooglePlace(raw('TEST_CLOSED','restaurant',{businessStatus:'CLOSED_TEMPORARILY'}));assert.equal(qualifyPlace(closed.place).reason,'CLOSED_BUSINESS');
 const c=candidateFromPlace(records[1].place);c.openingInformation={source_expression:'TEST',weekly:null,dated:{'2026-10-04':[{opens:'09:00',closes:'17:00'}]}};
 assert.equal(isOpen(c,'2026-10-04',16*60+50,17*60+50),false);
 assert.equal(openingStatus(c,'2026-10-04',18*60,19*60),'CLOSED_CONFIRMED');
 c.openingInformation=null;assert.equal(openingStatus(c,'2026-10-04',18*60,19*60),'HOURS_UNKNOWN');
 const unknown=records.map(d=>({...d,opening_hours:null}));const run=await createRealPlanner(world(unknown) as any,routes).build(request());assert.equal(run.result.status,'complete');if(run.result.status==='complete')assert.ok(run.result.primaryItinerary.stops.every(s=>s.warnings.some(w=>w.includes('Hours weren’t available'))));
});
test('costs retain signals, unknown admission and separate shared parking rather than claiming parks are free',()=>{
 const beach=candidateFromPlace(records[0].place);assert.equal(beach.cost.status,'UNKNOWN_COST');assert.ok(beach.cost.value>0);assert.equal(beach.cost.sharedCosts![0].amountCents,null);
 const priced=candidateFromPlace(normalizeGooglePlace(raw('TEST_PRICE','restaurant',{priceRange:{startPrice:{currencyCode:'USD',units:'20'},endPrice:{currencyCode:'USD',units:'30'}}})).place);
 assert.equal(priced.cost.status,'PROVIDER_PRICE_SIGNAL');assert.equal(priced.cost.value,2500);assert.equal(priced.cost.source,'provider-price-signal');
});
test('G: dinner-first and surgical dessert replacement preserve the kept beach and unrelated identities',async()=>{
 const first=await build();assert.equal(first.result.status,'complete');if(first.result.status!=='complete')return;
 const current=makeCurrentPlan('TEST_RUN',request(),first.result);
 const ordered=prepareEdit(current,{kind:'adjust',text:'Dinner first'});const dinnerFirst=await build(ordered.request,ordered);assert.equal(dinnerFirst.result.status,'complete');if(dinnerFirst.result.status!=='complete')return;
 assert.equal(dinnerFirst.result.primaryItinerary.stops[0].role,'meal');
 const plan={...current,result:dinnerFirst.result};const beach=plan.result.primaryItinerary.stops.find(s=>s.category==='Beach')!;
 const kept=keepDecision(plan,beach.id);const prepared=prepareEdit(kept,{kind:'adjust',text:'Keep the beach, different dessert'});
 const changed=await build(prepared.request,prepared);assert.equal(changed.result.status,'complete');if(changed.result.status!=='complete')return;
 assert.ok(changed.result.primaryItinerary.stops.some(s=>s.id===beach.id&&s.protection==='USER_KEPT'));
 const oldDessert=plan.result.primaryItinerary.stops.find(s=>s.role==='dessert')!.id;assert.ok(!changed.result.primaryItinerary.stops.some(s=>s.id===oldDessert));
 assert.deepEqual(changed.result.primaryItinerary.stops.filter(s=>s.role!=='dessert').map(s=>s.id).sort(),plan.result.primaryItinerary.stops.filter(s=>s.role!=='dessert').map(s=>s.id).sort());
});
test('H: minimal blank interests are valid, contextual chips are never automatic commitments',async()=>{
 const draft={...emptyDraft(),startingLocation:origin.display_name,startingPlace:origin,date:'2026-10-04',availableStartTime:'17:00',requiredEndTime:'21:00',budgetPerPerson:'40',groupSize:'2',transportation:'driving' as const};
 const valid=validateRequest(draft,{requirePlaceSelections:true});assert.ok(valid.ok);assert.deepEqual(valid.request.selectedInterests,[]);
 assert.ok(interestSuggestions('08:00').includes('Coffee'));assert.ok(interestSuggestions('18:00').includes('Dinner'));
 const run=await build(request({vibeInterests:'',startingState:'nothing-planned',existingStops:[]}));assert.equal(run.result.status,'complete');
});
test('I/J: return-home timing is included; explicit hard cap conflicts never silently exceed or discard fixed intent',async()=>{
 const fixed={id:'fixed',name:records[1].place.display_name,place:records[1].place,fixed:true,startTime:'19:00',endTime:'20:00',durationMinutes:null,note:null,entryKind:'place' as const,protection:'USER_FIXED' as const,constraints:{preservePlace:true,preserveStartTime:true,preserveEndTime:true,preserveDuration:false}};
 const r=request({vibeInterests:'dinner dessert',startingState:'almost-complete',existingStops:[fixed],requiredEndTime:'22:30',finishIsHard:true,returnToStart:true});const run=await build(r);assert.equal(run.result.status,'complete');if(run.result.status==='complete'){assert.ok(run.result.primaryItinerary.returnTravel);assert.equal(run.result.primaryItinerary.stops.find(s=>s.id===fixed.place.provider_place_id)!.arrival,'19:00');assert.ok(run.result.primaryItinerary.finish<='22:30');}
 assert.equal(lightweightIntent.normalize(request({vibeInterests:'Do not go over $40 per person'})).hardCapCents,4000);
 const impossible=await build({...r,vibeInterests:'do not go over $10 per person'});assert.equal(impossible.result.status,'no-plan');assert.match(impossible.result.message??'',/cap/);assert.equal(impossible.diagnostics.normalizedInput.request.existingStops[0].startTime,'19:00');
});
test('L: a kept place may move in time but must never be silently removed for a new hard finish',async()=>{
 const initial=await build();assert.equal(initial.result.status,'complete');if(initial.result.status!=='complete')return;
 const plan=makeCurrentPlan('TEST_RUN',request(),initial.result),beach=plan.result.primaryItinerary.stops.find(s=>s.category==='Beach')!;const kept=keepDecision(plan,beach.id);
 const short=prepareEdit(kept,{kind:'details',request:{...request(),requiredEndTime:'17:20',finishIsHard:true}});
 const run=await build(short.request,short);assert.equal(run.result.status,'no-plan');assert.match(run.result.message??'',/keep|protected/i);assert.equal(kept.result.primaryItinerary.stops.find(s=>s.id===beach.id)!.protection,'USER_KEPT');
 assert.throws(()=>prepareEdit(kept,{kind:'change',placeId:beach.id}),/preserve/);
});
test('editing API keeps one plan identity/revision, records run linkage, and preserves the old plan after conflicts',async()=>{
 const saved=new Map<string,any>();const all=[raw('TEST_TRUST_ORIGIN','locality'),...records.map(d=>raw(d.place.provider_place_id,d.place.primary_type!))];
 const api=createApi({env:{GOOGLE_MAPS_SERVER_KEY:'TEST'},store:{get:id=>saved.get(id),save:r=>{saved.set(r.runId,r);}},now:()=>new Date('2026-10-03T12:00:00Z'),fetcher:async(url,init)=>{const body=init?.body?JSON.parse(init.body as string):null;if(String(url).includes('computeRouteMatrix'))return Response.json(body.origins.flatMap((_:any,i:number)=>body.destinations.map((__:any,j:number)=>({originIndex:i,destinationIndex:j,condition:'ROUTE_EXISTS',duration:i===j?'0s':'300s',distanceMeters:i===j?0:1500}))));if(String(url).includes('searchNearby'))return Response.json({places:all.filter(p=>body.includedPrimaryTypes.includes(p.primaryType))});const found=all.find(p=>String(url).includes('/places/'+p.id));return Response.json(found);}});
 const post=async(path:string,body:any)=>{const response=await api(new Request('https://outing.test'+path,{method:'POST',body:JSON.stringify(body),headers:{'Content-Type':'application/json'}}));const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data;};
 const draft={...emptyDraft(),startingPlace:origin,startingLocation:origin.display_name,date:'2026-10-04',availableStartTime:'17:00',requiredEndTime:'21:00',budgetPerPerson:'40',groupSize:'2',transportation:'driving',vibeInterests:'dinner dessert beach',startingState:'anchor',existingStops:[{...newStop(),name:'beach',entryKind:'activity'}]};
 const first=await post('/api/plans',{draft});assert.equal(first.status,'complete');const beach=first.currentPlan.result.primaryItinerary.stops.find((s:any)=>s.category==='Beach');
 const keep=await post('/api/plans/edit',{currentPlan:first.currentPlan,edit:{kind:'keep',placeId:beach.id}});assert.equal(keep.currentPlan.id,first.currentPlan.id);assert.equal(keep.currentPlan.revision,2);
 const savedKeep=saved.get(keep.runId);assert.ok(savedKeep.currentPlan.history.some((h:any)=>h.type==='kept'));assert.equal(savedKeep.parentRunId,first.runId);assert.equal(JSON.stringify(savedKeep).includes('TEST address'),false);
 const impossible=await post('/api/plans/edit',{currentPlan:keep.currentPlan,edit:{kind:'details',request:{...keep.request,requiredEndTime:'17:15',finishIsHard:true}}});assert.ok(impossible.conflict);assert.equal(impossible.currentPlan.revision,2);assert.ok(impossible.currentPlan.result.primaryItinerary.stops.some((s:any)=>s.id===beach.id));
});
