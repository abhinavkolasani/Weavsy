import test from 'node:test';
import assert from 'node:assert/strict';
import { placeService, DAYS, PLACE_CATEGORIES } from '../src/data/index.ts';
import { syntheticPlaces } from '../src/data/syntheticCatalog.ts';
import { createLocalPlaceService, PlaceQueryError } from '../src/data/localPlaceService.ts';
import { assertValidCatalog, CatalogValidationError } from '../src/data/validateCatalog.ts';
import { validatePlannerSelectedStops } from '../src/itinerary/catalogContract.ts';
import type { PlaceQuery, PlaceService } from '../src/data/index.ts';

const expectedIds = [
  'TEST_SIT_DOWN_01','TEST_SIT_DOWN_02','TEST_SIT_DOWN_03','TEST_SIT_DOWN_04',
  'TEST_CASUAL_01','TEST_CASUAL_02','TEST_CASUAL_03',
  'TEST_CAFE_01','TEST_CAFE_02','TEST_CAFE_03','TEST_CAFE_04',
  'TEST_ACTIVE_01','TEST_ACTIVE_02','TEST_ACTIVE_03','TEST_ACTIVE_04',
  'TEST_ENTERTAINMENT_01','TEST_ENTERTAINMENT_02','TEST_ENTERTAINMENT_03',
  'TEST_WALK_01','TEST_WALK_02','TEST_WALK_03',
  'TEST_PARK_01','TEST_PARK_02','TEST_PARK_03',
];

test('catalog has 24 stable IDs, seven categories and honest synthetic provenance', async () => {
  const all = await placeService.queryPlaces({ include_inactive: true });
  assert.deepEqual(all.map(p => p.place_id), expectedIds);
  assert.equal(new Set(all.map(p => p.place_id)).size, 24);
  assert.deepEqual(new Set(all.map(p => p.category)), new Set(PLACE_CATEGORIES));
  for (const p of all) {
    assert.equal(p.data_status, 'synthetic'); assert.match(p.name, /^TEST_/);
    assert.match(p.area, /fictional/); assert.match(p.data_notes, /not a real place/);
    assert.equal(p.latitude, null); assert.equal(p.longitude, null); assert.equal(p.address, null);
    assert.deepEqual(Object.keys(p.opening_hours.weekly), [...DAYS]);
  }
  assert.equal(Math.min(...all.map(p => p.estimated_cost_per_person.amount_cents)), 0);
  assert.equal(Math.max(...all.map(p => p.estimated_cost_per_person.amount_cents)), 6500);
  assert.equal(Math.min(...all.map(p => p.typical_duration_minutes)), 20);
  assert.equal(Math.max(...all.map(p => p.typical_duration_minutes)), 150);
});

test('active selection excludes retired IDs; direct lookup still supports inspection', async () => {
  assert.equal((await placeService.listActivePlaces()).length, 22);
  assert.equal((await placeService.queryPlaces()).length, 22);
  assert((await placeService.listActivePlaces()).every(p => p.active));
  assert.equal((await placeService.getPlaceById('TEST_SIT_DOWN_04'))?.active, false);
  assert.equal((await placeService.getPlaceById('TEST_ENTERTAINMENT_03'))?.active, false);
  assert.equal(await placeService.getPlaceById('TEST_MISSING_99'), null);
  assert.equal(await placeService.getPlaceById('test_cafe_01'), null); // IDs are exact.
});

test('weekday, weekend, split, closed and unknown hours remain distinct', async () => {
  const p = await placeService.getPlaceById('TEST_SIT_DOWN_01'); assert(p);
  assert.deepEqual(p.opening_hours.weekly.monday, []);
  assert.equal(p.opening_hours.weekly.wednesday?.length, 2);
  assert.notDeepEqual(p.opening_hours.weekly.friday, p.opening_hours.weekly.saturday);
  assert.equal((await placeService.getPlaceById('TEST_WALK_03'))?.opening_hours.weekly.thursday, null);
});

test('queries combine category, budget, tags, occasion, area, status and group constraints', async () => {
  const cozy = await placeService.queryPlaces({ category:'cafe_dessert',max_cost_per_person_cents:700,vibe_tags_any:['cozy','missing'],occasion_tags_any:['coffee'],group_size:2,data_status:'synthetic',area:'TEST_ZONE_NORTH (fictional)' });
  assert.deepEqual(cozy.map(p => p.place_id), ['TEST_CAFE_01']);
  const free = await placeService.queryPlaces({ max_cost_per_person_cents:0 });
  assert(free.length > 0); assert(free.every(p => p.active && p.estimated_cost_per_person.amount_cents === 0));
  const solo = await placeService.queryPlaces({ category:'active_activity', group_size:1 });
  assert(!solo.some(p => p.place_id === 'TEST_ACTIVE_01'));
  assert(solo.some(p => p.place_id === 'TEST_ACTIVE_02'));
  assert.deepEqual(await placeService.queryPlaces({ vibe_tags_any:['no-such-tag'] }), []);
  assert.deepEqual(await placeService.queryPlaces({ data_status:'verified' }), []);
  assert.equal((await placeService.queryPlaces({ vibe_tags_any:[] })).length,22);
});

test('unsupported or invalid filters fail rather than quietly broadening results', async () => {
  for (const query of [{ max_cost_per_person_cents:-1 }, {max_cost_per_person_cents:0.5}, {group_size:0}, {group_size:1.5}, {include_inactive:'true'}, {category:'made-up'}, {vibe_tags_any:'cozy'}, {unknown_field:'ignored?'}]) {
    await assert.rejects(placeService.queryPlaces(query as PlaceQuery), PlaceQueryError);
  }
});

test('returned nested records and input fixture mutations cannot alter the service', async () => {
  const input = structuredClone(syntheticPlaces);
  const service = createLocalPlaceService(input);
  input[0].name = 'TEST_RENAMED';
  const first = await service.getPlaceById('TEST_CAFE_01'); assert(first);
  (first.vibe_tags as string[]).push('tampered');
  (first.estimated_cost_per_person as {amount_cents:number}).amount_cents = 999999;
  assert.equal((await service.getPlaceById('TEST_SIT_DOWN_01'))?.name,'TEST_SIT_DOWN_01');
  const again = await service.getPlaceById('TEST_CAFE_01'); assert(again);
  assert(!again.vibe_tags.includes('tampered')); assert.equal(again.estimated_cost_per_person.amount_cents,700);
});

test('bad catalog identity, facts and hours are rejected before serving any record', () => {
  const cases: Array<(data:any[])=>void> = [
    d => {d[1].place_id = d[0].place_id;},
    d => {d[0].name = 'Plausible Real Cafe';},
    d => {d[0].estimated_cost_per_person.amount_cents = -1;},
    d => {d[0].typical_duration_minutes = 0;},
    d => {d[0].latitude = 100;},
    d => {delete d[0].opening_hours.weekly.sunday;},
    d => {d[0].opening_hours.timezone = 'Invalid/Zone';},
    d => {d[0].opening_hours.weekly.monday = [{opens:'10:00',closes:'09:00'}];},
    d => {d[0].opening_hours.weekly.monday = [{opens:'09:00',closes:'12:00'},{opens:'11:00',closes:'13:00'}];},
    d => {d[0].group_size = {min:6,max:2,recommended:4};},
  ];
  for(const mutate of cases){const data=structuredClone(syntheticPlaces);mutate(data);assert.throws(()=>createLocalPlaceService(data),CatalogValidationError);}
  assert.throws(()=>assertValidCatalog(null),CatalogValidationError);
});

test('valid references resolve only canonical catalog facts, preserving reference order', async () => {
  const result = await validatePlannerSelectedStops([{place_id:'TEST_CAFE_01'},{place_id:'TEST_PARK_01'}]);
  assert(result.ok);assert.deepEqual(result.stops.map(s=>s.place_id),['TEST_CAFE_01','TEST_PARK_01']);
  assert.equal(result.stops[0].source,'catalog');assert.equal(result.stops[0].place.name,'TEST_CAFE_01');
  assert.equal(result.stops[0].place.estimated_cost_per_person.amount_cents,700);
});

test('missing and inactive IDs return distinct errors without partial accepted results', async () => {
  const result = await validatePlannerSelectedStops([{place_id:'TEST_CAFE_01'},{place_id:'TEST_MISSING_99'},{place_id:'TEST_SIT_DOWN_04'}]);
  assert(!result.ok);assert.deepEqual(result.issues.map(i=>i.code),['PLACE_NOT_FOUND','PLACE_INACTIVE']);
  assert.deepEqual(result.issues.map(i=>i.index),[1,2]);assert(!('stops' in result));
});

test('malformed references and fabricated name/price payloads cannot bypass the contract', async () => {
  for (const input of [null,{},[null],[{place_id:''}],[{place_id:42}],[{name:'Cafe'}],[{place_id:'TEST_CAFE_01',name:'Invented Business',price:0}]]) {
    const result=await validatePlannerSelectedStops(input);assert(!result.ok);
  }
  assert.deepEqual(await validatePlannerSelectedStops([]),{ok:true,stops:[]});
});

test('inactive status is checked when references are validated, not trusted from old results', async () => {
  const data=structuredClone(syntheticPlaces);
  const first=await validatePlannerSelectedStops([{place_id:'TEST_CAFE_01'}],createLocalPlaceService(data));assert(first.ok);
  data.find(p=>p.place_id==='TEST_CAFE_01')!.active=false;
  const changed=await validatePlannerSelectedStops(first.stops.map(({place_id})=>({place_id})),createLocalPlaceService(data));
  assert(!changed.ok);assert.equal(changed.issues[0].code,'PLACE_INACTIVE');
});

test('data access failure is surfaced; validation never fabricates a fallback place', async () => {
  const unavailable: PlaceService={...placeService,async getPlaceById(){throw new Error('Catalog unavailable');}};
  await assert.rejects(validatePlannerSelectedStops([{place_id:'TEST_CAFE_01'}],unavailable),/Catalog unavailable/);
});
