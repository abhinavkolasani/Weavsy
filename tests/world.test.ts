import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorldProvider, normalizePhoton, inferSearchType, WorldError } from '../server/worldProvider.ts';
import { isPlaceReference, parsePlaceId } from '../src/world/reference.ts';
import { normalizeOpeningHours } from '../src/world/openingHours.ts';
import { validateRequest } from '../src/planning/validate.ts';
import { emptyDraft, newStop } from '../src/planning/draft.ts';
import { initialState, restoreState } from '../src/planning/state.ts';
import { createFounderMetadata } from '../src/founder/metadata.ts';
const stamp='2026-10-02T23:00:00Z';
// Synthetic transport payloads are isolated engineering fixtures, never served by the app.
const feature=(id=123,lat=35,lon=139)=>({geometry:{type:'Point',coordinates:[lon,lat]},properties:{osm_type:'N',osm_id:id,name:'TEST transport fixture',osm_key:'amenity',osm_value:'restaurant',city:'TEST city',country:'TEST country'}});
const place=()=>normalizePhoton(feature(),stamp)!;
const providerWith=(handler:(url:string)=>Response|Promise<Response>)=>createWorldProvider({fetcher:(async(url)=>handler(String(url))) as typeof fetch,intervalMs:0});
test('real-world references preserve provider namespace and reject malformed coordinates/identity',()=>{
 const p=place();assert(isPlaceReference(p));assert.equal(p.provider_place_id,'node/123');assert.equal(p.latitude,35);assert.equal(p.longitude,139);assert.equal(normalizePhoton({...feature(),geometry:{coordinates:[999,999]}},stamp),null);assert.equal(normalizePhoton({...feature(),properties:{name:'Invented'}},stamp),null);for(const id of ['123','node/0','way/-5','node/123;out;','google/fake'])assert.equal(parsePlaceId(id),null);assert(!isPlaceReference({...p,provider_metadata:{...p.provider_metadata,osm_id:'456'}}));
});
test('worldwide autocomplete has no country restriction, deduplicates and isolates cached data',async()=>{
 const urls:string[]=[];const provider=providerWith(url=>{urls.push(url);return Response.json({features:[feature(),feature()]});});
 const first=await provider.autocompleteLocation('Tokyo, Japan');assert.equal(first.length,1);assert(!new URL(urls[0]).searchParams.has('countrycode'));assert(!new URL(urls[0]).searchParams.has('lat'));first[0].display_name='mutated';const second=await provider.autocompleteLocation('Tokyo, Japan');assert.equal(second[0].display_name,'TEST transport fixture');assert.equal(urls.length,1);
});
test('explicit location bias preserves named-place relevance; named businesses are not generic category searches',async()=>{
 let requested='';const provider=providerWith(url=>{requested=url;return Response.json({features:[feature()]});});
 await provider.autocompletePlace('Cypress, CA',{latitude:34.0522,longitude:-118.2437});assert.equal(new URL(requested).searchParams.get('location_bias_scale'),'1');
 assert.equal(inferSearchType('casual dinner'),'food');assert.equal(inferSearchType('dessert'),'dessert');assert.equal(inferSearchType('Hard Rock Cafe'),undefined);assert.equal(inferSearchType('Central Park'),undefined);
 await assert.rejects(()=>provider.searchPlaces({query:'food',types:['toString' as never]}),e=>e instanceof WorldError&&e.status===400);
});
test('old place identity is refreshed and unavailable places cannot silently survive the refresh',async()=>{
 let time=Date.parse(stamp), calls=0;
 const provider=createWorldProvider({now:()=>time,intervalMs:0,fetcher:(async url=>{calls++;return String(url).includes('komoot')?Response.json({features:[feature()]}):Response.json({elements:[]});}) as typeof fetch});
 await provider.autocompletePlace('Fixture');await provider.resolveReferences(['node/123']);assert.equal(calls,1);time+=16*60*1000;
 await assert.rejects(()=>provider.resolveReferences(['node/123']),e=>e instanceof WorldError&&e.status===404);assert.equal(calls,2);
});
test('saved selections after server restart use canonical live identity rather than caller-supplied facts',async()=>{
 const provider=providerWith(()=>Response.json({features:[feature()]}));
 const hint={...place(),display_name:'Caller-supplied name',latitude:0,longitude:0};const resolved=await provider.resolveReferences(['node/123'],[hint]);assert.equal(resolved.get('node/123')?.latitude,35);assert.equal(resolved.get('node/123')?.display_name,'TEST transport fixture');
});
test('nearby categories use geography, obey radius and never manufacture prices',async()=>{
 let requested='';const provider=providerWith(url=>{requested=url;return Response.json({features:[feature(123,35,139),feature(456,45,149)]});});
 const result=await provider.searchPlaces({query:'bowling',location:{latitude:35,longitude:139},radius:1000});assert.equal(result.places.length,1);const url=new URL(requested);assert.equal(url.pathname,'/reverse/');assert.equal(url.searchParams.get('radius'),'1');assert(url.searchParams.getAll('include').includes('osm.leisure.bowling_alley'));assert(!('estimated_cost_per_person' in result.places[0]));
 assert(!url.searchParams.has('location_bias_scale'));
});
test('category plus city queries resolve the area before querying nearby real candidates',async()=>{
 const urls:string[]=[];const provider=providerWith(url=>{urls.push(url);const f=feature();if(new URL(url).pathname==='/api/')f.properties={...f.properties,osm_key:'place',osm_value:'town'};return Response.json({features:[f]});});
 const result=await provider.searchPlaces({query:'casual dinner Cypress'});assert.equal(new URL(urls[0]).searchParams.get('q'),'Cypress');assert.equal(new URL(urls[1]).pathname,'/reverse/');assert.equal(new URL(urls[1]).searchParams.get('lat'),'35');assert.equal(new URL(urls[1]).searchParams.getAll('include').length,1);assert.equal(new URL(urls[1]).searchParams.get('include'),'osm.amenity.restaurant,osm.amenity.fast_food');assert.deepEqual(result.context,{latitude:35,longitude:139});
});
test('details normalize useful fields and keep unknowns explicit',async()=>{
 const provider=providerWith(url=>url.includes('komoot')?Response.json({features:[feature()]}):Response.json({elements:[{type:'node',id:123,lat:35,lon:139,tags:{name:'TEST transport fixture',amenity:'restaurant',opening_hours:'Mo-Fr 09:00-17:00; Sa 10:00-14:00; Su off',website:'javascript:unsafe'}}]}));
 await provider.autocompletePlace('Fixture');const details=await provider.getPlaceDetails('node/123');assert.equal(details.place.provider_metadata.lookup_source,'overpass');assert.equal(details.opening_hours?.weekly?.saturday[0].opens,'10:00');assert.deepEqual(details.opening_hours?.weekly?.sunday,[]);assert.equal(details.website,null);assert.equal(details.estimated_cost_per_person,null);assert.equal(details.typical_duration_minutes,null);
});
test('complex opening hours remain uninterpreted instead of silently becoming precise',()=>{
 assert.equal(normalizeOpeningHours('Mo-Fr 09:00-17:00; PH off')?.weekly,null);assert.equal(normalizeOpeningHours('Fr 22:00-02:00')?.weekly,null);assert.equal(normalizeOpeningHours(undefined),null);assert.equal(normalizeOpeningHours('24/7')?.weekly?.monday[0].closes,'24:00');
 assert.equal(normalizeOpeningHours('Mo off; Mo 10:00-12:00')?.weekly,null);
});
test('invalid, missing and inactive IDs fail clearly, with no accepted fallback',async()=>{
 const provider=providerWith(()=>Response.json({elements:[]}));await assert.rejects(()=>provider.getPlaceDetails('madeup'),e=>e instanceof WorldError&&e.status===400);await assert.rejects(()=>provider.getPlaceDetails('node/456'),e=>e instanceof WorldError&&e.status===404);
 const inactive=providerWith(()=>Response.json({elements:[{type:'node',id:123,lat:35,lon:139,tags:{name:'TEST closed fixture',disused:'yes'}}]}));await assert.rejects(()=>inactive.getPlaceDetails('node/123'),e=>e instanceof WorldError&&e.status===410);
});
test('network failures never fabricate places, while previously resolved identity can survive partial detail failure',async()=>{
 const provider=createWorldProvider({intervalMs:0,fetcher:(async()=>{throw new Error('offline');}) as typeof fetch});await assert.rejects(()=>provider.autocompleteLocation('Tokyo'),/Couldn’t reach/);
 const partial=providerWith(url=>{if(url.includes('komoot'))return Response.json({features:[feature()]});throw new Error('details offline');});await partial.autocompletePlace('Fixture');const result=await partial.getPlaceDetails('node/123');assert.equal(result.place.provider_place_id,'node/123');assert.equal(result.place.provider_metadata.details_status,'unavailable');assert.equal(result.opening_hours,null);assert(result.warnings.length);
});
test('throttle errors pause requests; unsupported filters are explicit errors',async()=>{
 let calls=0;const provider=providerWith(()=>{calls++;return new Response('',{status:429});});await assert.rejects(()=>provider.autocompleteLocation('Tokyo'),/busy/);await assert.rejects(()=>provider.autocompleteLocation('London'),/taking a break/);assert.equal(calls,1);
 await assert.rejects(()=>provider.searchPlaces({query:'food',openAt:'19:00'}),e=>e instanceof WorldError&&e.status===400);await assert.rejects(()=>provider.searchPlaces({query:'food',pricePreference:1}),/not supported/);
});
test('unselected text is rejected in the real-place flow; non-venue user activities are preserved honestly',()=>{
 const d={...emptyDraft(),startingLocation:'Tokyo',date:'2026-10-02',availableStartTime:'16:00',requiredEndTime:'23:00',budgetPerPerson:'40',groupSize:'5',transportation:'driving' as const,vibeInterests:'food'};
 assert(!validateRequest(d,{requirePlaceSelections:true}).ok);const selected={...d,startingLocation:place().display_name,startingPlace:place()};assert(validateRequest(selected,{requirePlaceSelections:true}).ok);
 const activity={...newStop(true),name:'A walk',entryKind:'activity' as const,startTime:'19:00'};const r=validateRequest({...selected,startingState:'partial-plan',existingStops:[activity]},{requirePlaceSelections:true});assert(r.ok);assert.equal(r.request.existingStops[0].fixed,true);assert.equal(r.request.existingStops[0].place,null);assert.equal(r.request.existingStops[0].source,'user');assert.equal(r.request.budgetPerPerson.amountCents,4000);
});
test('three independent selections retain fixed time/notes through refresh and later draft edits',()=>{
 const refs=[123,456,789].map(id=>normalizePhoton(feature(id),stamp)!);const d={...emptyDraft(),startingLocation:refs[0].display_name,startingPlace:refs[0],availableStartTime:'16:00',requiredEndTime:'23:00',budgetPerPerson:'40',groupSize:'5',transportation:'walking' as const,vibeInterests:'food',startingState:'partial-plan' as const,existingStops:refs.map((p,i)=>({...newStop(i===0),name:p.display_name,place:p,entryKind:'place' as const,startTime:i===0?'19:00':'',note:'Keep this'}))};
 const r=validateRequest(d,{requirePlaceSelections:true});assert(r.ok);const raw=JSON.stringify({...initialState(),draft:d,screen:'results',submission:{request:r.request,result:{status:'not-generated',primaryItinerary:null},metadata:createFounderMetadata()}});const restored=restoreState(raw);assert.equal(restored.screen,'results');assert.deepEqual(restored.submission?.request,r.request);assert.equal(r.request.existingStops[0].startTime,'19:00');assert.deepEqual(r.request.existingStops.map(s=>s.fixed),[true,false,false]);d.existingStops[0].place.latitude=0;assert.equal(r.request.existingStops[0].place?.latitude,35);
});
