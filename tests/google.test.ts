import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleWorldProvider,normalizeGooglePlace,normalizeGoogleHours,PLANNING_FIELDS } from '../server/googleProvider.ts';
import { createGoogleRouting,decodePolyline } from '../server/googleRouting.ts';
import { isPlaceReference } from '../src/world/reference.ts';
import { durableDraft,hydrateSession,serializeSession } from '../src/world/durable.ts';
import { durableRun } from '../server/durableRun.ts';
import { emptyDraft,newStop } from '../src/planning/draft.ts';
import { validateRequest } from '../src/planning/validate.ts';
import { candidateFromPlace } from '../src/planner/estimates.ts';
import { createRealPlanner } from '../server/realPlanner.ts';
import { isOpen } from '../src/planner/schedule.ts';
const fixture=(id='TEST_GOOGLE_FIXTURE_ONE')=>({id,displayName:{text:'TEST Google Place'},formattedAddress:'TEST address',location:{latitude:34.05,longitude:-118.24},primaryType:'restaurant',types:['restaurant'],businessStatus:'OPERATIONAL',addressComponents:[{types:['country'],shortText:'US'}],attributions:[],regularOpeningHours:{periods:[{open:{day:5,hour:17},close:{day:6,hour:1}}],weekdayDescriptions:['TEST Friday hours']}});
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
test('Google identity is normalized, US-only, and raw objects do not escape',()=>{
  const raw=fixture();const d=normalizeGooglePlace({...raw,photos:[{huge:'not requested'}]},'2026-10-02T20:00:00Z');
  assert.ok(isPlaceReference(d.place));assert.equal(d.place.provider,'google');assert.equal(d.estimated_cost_per_person,null);assert.equal((d as any).photos,undefined);
  assert.throws(()=>normalizeGooglePlace({...raw,addressComponents:[{types:['country'],shortText:'CA'}]}),/United States/);
  assert.equal(normalizeGooglePlace({...raw,businessStatus:'CLOSED_PERMANENTLY'}).business_status,'unavailable');
  assert.throws(()=>normalizeGooglePlace({...raw,location:null}),/location/);
});
test('Google weekly hours support midnight, closed days, 24/7 and current-date exceptions',()=>{
  const h=normalizeGoogleHours(fixture(),'2026-10-02T20:00:00Z')!;
  assert.deepEqual(h.weekly?.friday,[{opens:'17:00',closes:'24:00'}]);assert.deepEqual(h.weekly?.saturday,[{opens:'00:00',closes:'01:00'}]);assert.deepEqual(h.weekly?.monday,[]);
  const full=normalizeGoogleHours({regularOpeningHours:{periods:[{open:{day:0,hour:0}}]}},'2026-10-02T20:00:00Z')!;
  assert.deepEqual(full.weekly?.monday,[{opens:'00:00',closes:'24:00'}]);
  const holiday=normalizeGoogleHours({...fixture(),utcOffsetMinutes:-420,currentOpeningHours:{periods:[]}},'2026-10-02T20:00:00Z')!;
  const candidate=candidateFromPlace(normalizeGooglePlace(fixture()).place);candidate.openingInformation=holiday;
  assert.equal(isOpen(candidate,'2026-10-02',19*60,20*60),false);
  assert.equal(isOpen(candidate,'2026-10-09',19*60,20*60),true);
  assert.equal(normalizeGoogleHours({},'2026-10-02T20:00:00Z'),null);
});
test('Google predictions use US restriction and session token, and cannot claim coordinates',async()=>{
  let body:any,headers:any;
  const world=createGoogleWorldProvider({key:'TEST_PRIVATE_KEY',fetcher:async(_url,init)=>{body=JSON.parse(init!.body as string);headers=init!.headers;return json({suggestions:[{placePrediction:{placeId:fixture().id,structuredFormat:{mainText:{text:'TEST Google Place'},secondaryText:{text:'TEST area'}}}}]});}});
  const [suggestion]=await world.autocompleteLocation('TEST',undefined,'test-session');
  assert.deepEqual(body.includedRegionCodes,['us']);assert.equal(body.sessionToken,'test-session');assert.equal((suggestion as any).latitude,undefined);assert.equal(isPlaceReference(suggestion),false);assert.ok(!headers['X-Goog-FieldMask'].includes('*'));
});
test('Google candidate search provides hours in its mask and avoids repeating detail calls within a run',async()=>{
  const calls:any[]=[];const world=createGoogleWorldProvider({key:'TEST',fetcher:async(url,init)=>{calls.push({url:String(url),init});return json({places:[fixture()]});}});
  const result=await world.searchPlaces({query:'food',location:fixture().location,types:['food'],limit:3});
  const details=await world.getPlaceDetailsMany!(result.places.map(p=>p.provider_place_id));
  assert.equal(calls.length,1);assert.equal(details.get(fixture().id)?.ok,true);assert.ok((calls[0].init.headers as any)['X-Goog-FieldMask'].includes('places.regularOpeningHours'));
  assert.equal(JSON.parse(calls[0].init.body).rankPreference,'DISTANCE');assert.ok(PLANNING_FIELDS.includes('currentOpeningHours'));
});
test('Google failures and missing/inactive IDs never create fallback places',async()=>{
  await assert.rejects(createGoogleWorldProvider({key:''}).autocompleteLocation('TEST'),/configured/);
  await assert.rejects(createGoogleWorldProvider({key:'TEST',fetcher:async()=>{throw new Error('offline');}}).autocompleteLocation('TEST'),/reach/);
  await assert.rejects(createGoogleWorldProvider({key:'TEST',fetcher:async()=>json({},403)}).getPlaceDetails(fixture().id),/authenticate/);
  await assert.rejects(createGoogleWorldProvider({key:'TEST',fetcher:async()=>json({},404)}).getPlaceDetails(fixture().id),/no longer/);
  await assert.rejects(createGoogleWorldProvider({key:'TEST'}).getPlaceDetails('node/123'),/again/);
  assert.deepEqual((await createGoogleWorldProvider({key:'TEST',fetcher:async()=>json({})}).autocompleteLocation('TEST')),[]);
});
test('direct Google details can refresh an address ID without searching for a replacement',async()=>{
  const oldId='TEST_GOOGLE_OLD_ADDRESS',canonical=fixture('TEST_GOOGLE_CANONICAL_ADDRESS');let calls=0;
  const world=createGoogleWorldProvider({key:'TEST',fetcher:async url=>{calls++;assert.ok(String(url).endsWith('/places/'+oldId));return json(canonical);}});
  const resolved=await world.resolveReferences([oldId]);
  assert.equal(resolved.get(oldId)?.provider_place_id,canonical.id);
  assert.equal((await world.getPlaceDetails(canonical.id)).place.provider_place_id,canonical.id);
  assert.equal(calls,1);
});
test('Google routes preserve directional network times and reject incomplete matrices and transit',async()=>{
  const points=[fixture().location,{latitude:34.1,longitude:-118.2}];let body:any;
  const router=createGoogleRouting({key:'TEST',fetcher:async(_url,init)=>{body=JSON.parse(init!.body as string);return json([{condition:'ROUTE_EXISTS',duration:'0s',distanceMeters:0},{destinationIndex:1,condition:'ROUTE_EXISTS',duration:'601s',distanceMeters:5000},{originIndex:1,condition:'ROUTE_EXISTS',duration:'900s',distanceMeters:5500},{originIndex:1,destinationIndex:1,condition:'ROUTE_EXISTS',duration:'0s',distanceMeters:0}]);}});
  const matrix=await router.getMatrix(points,'driving');
  assert.equal(matrix.legs[0][1]?.minutes,11);assert.equal(matrix.legs[1][0]?.minutes,15);assert.equal(matrix.legs[0][1]?.source,'google-routes');assert.equal(body.routingPreference,'TRAFFIC_UNAWARE');
  await assert.rejects(router.getMatrix(points,'transit'),/Transit/);
  await assert.rejects(createGoogleRouting({key:'TEST',fetcher:async()=>json([])}).getMatrix(points,'driving'),/incomplete/);
  assert.deepEqual(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@'),[[-120.2,38.5],[-120.95,40.7],[-126.453,43.252]]);
});
test('Google IDs survive storage and refresh while fixed intent and per-person budget remain independent',async()=>{
  const d=emptyDraft(),p=normalizeGooglePlace(fixture()).place;
  Object.assign(d,{startingLocation:p.display_name,startingPlace:p,date:'2026-10-03',availableStartTime:'16:00',requiredEndTime:'23:00',budgetPerPerson:'40',groupSize:'5',transportation:'driving',vibeInterests:'dinner',startingState:'reservation'});
  d.existingStops=[{...newStop(true),name:p.display_name,place:p,startTime:'19:00',note:'User intent'}];
  const encoded=serializeSession({version:1,screen:'form',draft:d,submission:null});
  assert.ok(!encoded.includes('TEST Google Place'));assert.ok(!encoded.includes('TEST address'));assert.ok(encoded.includes(p.provider_place_id));
  const restored=await hydrateSession(encoded,async()=>normalizeGooglePlace({...fixture(),displayName:{text:'TEST refreshed name'}}));
  assert.equal(restored.state.draft.existingStops[0].fixed,true);assert.equal(restored.state.draft.existingStops[0].startTime,'19:00');assert.equal(restored.state.draft.existingStops[0].note,'User intent');assert.equal(restored.state.draft.existingStops[0].name,'TEST refreshed name');
  const valid=validateRequest(restored.state.draft,{requirePlaceSelections:true});assert.ok(valid.ok);if(valid.ok)assert.equal(valid.request.budgetPerPerson.amountCents,4000);
  const failed=await hydrateSession(encoded,async()=>{throw new Error('offline');});assert.equal(failed.state.draft.existingStops[0].pendingPlaceId,p.provider_place_id);assert.equal(failed.state.draft.existingStops[0].fixed,true);assert.ok(failed.warning);
  const durable=durableDraft(d);assert.equal(durable.startingPlace,null);assert.equal(durable.existingStops[0].place,null);
  const saved=durableRun({request:valid.ok?valid.request:null,runId:'TEST',diagnostics:{},status:'complete'});assert.ok(!JSON.stringify(saved).includes('TEST refreshed name'));
});

test('bounded live planner keeps cheap activities and avoids a second meal before fixed dinner',async()=>{
  const make=(id,type)=>normalizeGooglePlace({...fixture(id),displayName:{text:'TEST '+id},primaryType:type,types:[type],regularOpeningHours:{periods:[{open:{day:0,hour:0}}]}});
  const meal=make('TEST_GOOGLE_MEAL','fast_food_restaurant'),park=make('TEST_GOOGLE_PARK','park'),dessert=make('TEST_GOOGLE_DESSERT','ice_cream_shop'),paid=[1,2,3,4].map(i=>make('TEST_GOOGLE_BOWLING_'+i,'bowling_alley'));
  const all=[meal,park,dessert,...paid];
  const world={searchPlaces:async q=>({places:q.types[0]==='park'?[park.place]:q.types[0]==='bowling'?paid.map(p=>p.place):q.types[0]==='dessert'?[dessert.place]:q.types[0].includes('food')?[meal.place]:[],context:q.location,warnings:[]}),getPlaceDetailsMany:async ids=>new Map(ids.map(id=>[id,{ok:true,details:all.find(p=>p.place.provider_place_id===id)}])),getPlaceDetails:async id=>all.find(p=>p.place.provider_place_id===id)};
  const routing={getMatrix:async(points,mode)=>({points,legs:points.map((_,i)=>points.map((__,j)=>({minutes:i===j?0:3,distanceMetres:i===j?0:1000,requestedMode:mode,actualMode:'driving',source:'google-routes'})))})};
  const draft={...emptyDraft(),startingLocation:meal.place.display_name,startingPlace:meal.place,date:'2026-10-03',availableStartTime:'16:00',requiredEndTime:'23:00',budgetPerPerson:'20',groupSize:'5',transportation:'driving',vibeInterests:'dinner and something fun'};
  const valid=validateRequest(draft,{requirePlaceSelections:true});assert.ok(valid.ok);
  const planner=createRealPlanner(world,routing);const cheap=await planner.build(valid.request);assert.equal(cheap.result.status,'complete');assert.equal(cheap.result.primaryItinerary.costPerPersonCents,2000);assert.ok(cheap.result.primaryItinerary.stops.some(s=>s.id===park.place.provider_place_id));
  const fixedDraft={...draft,budgetPerPerson:'40',startingState:'reservation',existingStops:[{...newStop(true),place:meal.place,name:meal.place.display_name,startTime:'19:00'}]};
  const fixed=validateRequest(fixedDraft,{requirePlaceSelections:true});assert.ok(fixed.ok);const result=await planner.build(fixed.request);assert.equal(result.result.status,'complete');assert.equal(result.result.primaryItinerary.stops.filter(s=>s.role==='meal').length,1);assert.equal(result.result.primaryItinerary.stops.find(s=>s.role==='meal').arrival,'19:00');
  const withDessert=validateRequest({...fixedDraft,budgetPerPerson:'60',vibeInterests:'dinner, something fun and dessert'},{requirePlaceSelections:true});assert.ok(withDessert.ok);
  const ending=await planner.build(withDessert.request);assert.equal(ending.result.status,'complete');
  const sequence=ending.result.primaryItinerary.stops;assert.ok(sequence.findIndex(s=>s.role==='dessert')>sequence.findIndex(s=>s.role==='meal'));
  const active=validateRequest({...draft,budgetPerPerson:'40',vibeInterests:'something active'},{requirePlaceSelections:true});assert.ok(active.ok);
  const activePlan=await planner.build(active.request);assert.equal(activePlan.result.status,'complete');assert.ok(activePlan.result.primaryItinerary.stops.some(s=>s.category==='Bowling'));
  const chill=validateRequest({...draft,budgetPerPerson:'40',vibeInterests:'chill'},{requirePlaceSelections:true});assert.ok(chill.ok);
  const chillPlan=await planner.build(chill.request);assert.equal(chillPlan.result.status,'complete');assert.ok(chillPlan.result.primaryItinerary.stops.some(s=>s.role==='walk-explore'));
});
