import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../server/api.ts';
import { createStore } from '../server/store.mjs';
import { createGoogleWorldProvider, normalizeGooglePlace } from '../server/googleProvider.ts';
import { createGoogleRouting } from '../server/googleRouting.ts';
import { createRealPlanner } from '../server/realPlanner.ts';
import { createOpenAIModelGateway, type ModelPacket, type PlanProposal } from '../server/model/gateway.ts';
import { validateRequest } from '../src/planning/validate.ts';
import { lightweightIntent } from '../src/planner/intent.ts';
import { candidateFromPlace } from '../src/planner/estimates.ts';
import { schedule } from '../src/planner/schedule.ts';
import { fixture, apiRequest } from './helpers/plannerFixture.ts';
import { planSnapshot, restorePlan } from '../server/planRepository.ts';
import { makeCurrentPlan } from '../src/planning/currentPlan.ts';
import { qualifyPlace } from '../src/planner/qualification.ts';

test('scenarios 3/9: an explicitly selected pier is usable without inventing fees or access',()=>{
  const pier=normalizeGooglePlace(raw('TEST_PUBLIC_PIER','fishing_pier')).place;
  assert.equal(qualifyPlace(pier).accepted,true);const candidate=candidateFromPlace(pier);
  assert.equal(candidate.role,'walk-explore');assert.equal(candidate.cost.status,'UNKNOWN_COST');assert.equal(candidate.cost.sharedCosts![0].amountCents,null);
  const route=normalizeGooglePlace(raw('TEST_USER_PIER_ROUTE','route')).place;
  assert.equal(qualifyPlace(route).accepted,false);assert.equal(qualifyPlace(route,undefined,true).accepted,true);
});

const raw = (id: string, type: string, extra: object = {}) => ({ id, displayName: { text: 'TEST pre-AI ' + id }, location: { latitude: 33.82, longitude: -118.04 }, primaryType: type, types: [type], addressComponents: [{ types: ['country'], shortText: 'US' }], businessStatus: 'OPERATIONAL', regularOpeningHours: { periods: [{ open: { day: 0, hour: 0 } }] }, ...extra });
const request = () => {
  const f = fixture(), valid = validateRequest(f.draft);
  assert.ok(valid.ok); return valid.request;
};

test('scenario 7: must not exceed is a structured per-person hard cap and generic activity is understood', () => {
  const f = fixture();
  const valid = validateRequest({ ...f.draft, startingState: 'nothing-planned', existingStops: [], budgetPerPerson: '40', vibeInterests: 'Dinner and an activity; must not exceed $35 per person.' });
  assert.ok(valid.ok); assert.equal(valid.request.budgetCapPerPersonCents, 3500);
  assert.equal(valid.request.budgetPerPerson.amountCents, 4000);
  assert.ok(lightweightIntent.normalize(valid.request).desiredRoles.includes('main-activity'));
});

test('scenarios 7/8: missing requested experiences cannot quietly become a complete empty-commitment outing', () => {
  const r = { ...request(), startingState: 'nothing-planned' as const, existingStops: [], vibeInterests: 'dinner and something fun', budgetIsCap: true, budgetCapPerPersonCents: 3500 };
  const food = candidateFromPlace(normalizeGooglePlace(raw('TEST_BUDGET_FOOD', 'fast_food_restaurant')).place);
  const bowling = candidateFromPlace(normalizeGooglePlace(raw('TEST_BUDGET_BOWL', 'bowling_alley')).place);
  const points = [r.startingPlace!, food.place, bowling.place];
  const matrix = { points, legs: points.map((_, i) => points.map((__, j) => ({ minutes: i === j ? 0 : 5, distanceMetres: i === j ? 0 : 1500, actualMode: 'driving' as const, requestedMode: 'driving' as const, source: 'google-routes' as const }))) };
  const result = schedule({ request: r, intent: lightweightIntent.normalize(r), start: 960, desiredFinish: 1380 }, [food, bowling], matrix);
  assert.ok(result.conflict); assert.equal(result.stops.length, 0);
});

test('scenario 8: a 90-minute walk and dessert uses short estimated visits', async () => {
  const r = { ...request(), startingState: 'nothing-planned' as const, existingStops: [], availableStartTime: '20:00', requiredEndTime: '21:30', finishIsHard: true, vibeInterests: 'Just a relaxed walk and dessert. Less driving.' };
  const details = [raw('TEST_SHORT_PARK', 'park'), raw('TEST_SHORT_DESSERT', 'ice_cream_shop')].map(p => normalizeGooglePlace(p));
  const world = { searchPlaces: async () => ({ places: details.map(d => d.place), warnings: [], context: null }), getPlaceDetailsMany: async (ids: string[]) => new Map(ids.map(id => [id, { ok: true as const, details: details.find(d => d.place.provider_place_id === id)! }])) };
  const routing = { getMatrix: async (points: any[]) => ({ points, legs: points.map((_, i) => points.map((__, j) => ({ minutes: i === j ? 0 : 5, distanceMetres: i === j ? 0 : 1500, actualMode: 'driving' as const, requestedMode: 'driving' as const, source: 'google-routes' as const }))) }), getRouteEstimate: async () => null };
  const built = await createRealPlanner(world as any, routing).build(r);
  assert.equal(built.result.status, 'complete'); if (built.result.status !== 'complete') return;
  assert.deepEqual(built.result.primaryItinerary.stops.map(s => s.role).sort(), ['dessert', 'walk-explore']);
  assert.ok(built.result.primaryItinerary.finish <= '21:30');
});

test('scenario 13: Friday study uses a library, respects date-specific closure and exposes access/parking uncertainty', async () => {
  const friday = '2026-10-23';
  const details = [normalizeGooglePlace(raw('TEST_LIBRARY_CLOSED', 'library')), normalizeGooglePlace(raw('TEST_LIBRARY_OPEN', 'library'))];
  details[0].opening_hours = { source_expression: 'TEST exception', weekly: details[0].opening_hours!.weekly, dated: { [friday]: [] } };
  const seen: string[] = [];
  const world = { searchPlaces: async (q: any) => { seen.push(...q.types); return { places: details.map(d => d.place), warnings: [], context: null }; }, getPlaceDetailsMany: async (ids: string[]) => new Map(ids.map(id => [id, { ok: true as const, details: details.find(d => d.place.provider_place_id === id)! }])) };
  const routing = { getMatrix: async (points: any[]) => ({ points, legs: points.map((_, i) => points.map((__, j) => ({ minutes: i === j ? 0 : 5, distanceMetres: i === j ? 0 : 1500, actualMode: 'driving' as const, requestedMode: 'driving' as const, source: 'google-routes' as const }))) }), getRouteEstimate: async () => null };
  const r = { ...request(), date: friday, availableStartTime: '14:00', requiredEndTime: '17:00', vibeInterests: 'Study at a library near Buena Park or Cypress College.', startingState: 'nothing-planned' as const, existingStops: [] };
  const built = await createRealPlanner(world as any, routing).build(r);
  assert.equal(built.result.status, 'complete'); if (built.result.status !== 'complete') return;
  assert.ok(seen.includes('study')); assert.ok(!seen.includes('food'));
  assert.equal(built.result.primaryItinerary.stops.length, 1);
  const library = built.result.primaryItinerary.stops[0];
  assert.equal(library.id, 'TEST_LIBRARY_OPEN'); assert.equal(library.hoursStatus, 'OPEN_CONFIRMED');
  assert.ok(library.warnings.some(w => /access/i.test(w)));
  assert.equal(library.cost.status, 'UNKNOWN_COST'); assert.equal(library.cost.sharedCosts![0].amountCents, null);
  const worldWithDetails={...world,getPlaceDetails:async(id:string)=>id===r.startingPlace!.provider_place_id?normalizeGooglePlace(raw(id,'locality')):details.find(d=>d.place.provider_place_id===id)!};
  const current=makeCurrentPlan('TEST_LIBRARY_RUN',r,built.result);
  const reopened=await restorePlan({id:current.id,revision:1,tokenHash:'TEST',snapshot:planSnapshot(current),updatedAt:'2026-10-16T12:00:00Z'},worldWithDetails as any,routing);
  const savedLibrary=reopened.result.primaryItinerary.stops[0];
  assert.equal(savedLibrary.id,library.id);assert.ok(savedLibrary.warnings.some(w=>/access/i.test(w)));assert.ok(savedLibrary.warnings.some(w=>/parking/i.test(w)));
});

test('scenarios 7/11: refreshed cost signals expose a cap conflict without changing saved decisions',async()=>{
  const f=fixture(),store=createStore(':memory:');let expensive=false;
  const fetcher:typeof fetch=async(url,init)=>{
    const response=await f.fetcher(url,init);if(!String(url).includes('places.googleapis.com'))return response;
    const data=await response.json();for(const place of data.places??[data])if(place.id==='TEST_SAVE_FOOD')place.priceLevel=expensive?'PRICE_LEVEL_VERY_EXPENSIVE':'PRICE_LEVEL_INEXPENSIVE';
    return Response.json(data,{status:response.status});
  };
  const api=createApi({env:{GOOGLE_MAPS_SERVER_KEY:'TEST'},store,fetcher,now:f.now});
  try{
    const created=await(await api(apiRequest('/api/plans',{draft:{...f.draft,budgetIsCap:true}}))).json();assert.equal(created.status,'complete');
    const before=structuredClone(store.getPlan(created.currentPlan.id));expensive=true;
    const response=await api(apiRequest('/api/plans/'+before.id,undefined,created.planKey));assert.equal(response.status,200);
    const reopened=(await response.json()).currentPlan;
    assert.equal(reopened.liveAttention,'constraint-conflict');assert.ok(reopened.result.primaryItinerary.warnings.some((w:string)=>/estimates exceed.*cap/i.test(w)));
    assert.equal(reopened.result.primaryItinerary.stops.find((s:any)=>s.id==='TEST_SAVE_FOOD').arrival,'19:00');assert.deepEqual(store.getPlan(before.id),before);
  }finally{store.close();}
});

test('scenario 14: absent hours/prices are uncertain, and provider outages never overwrite a saved Plan', async () => {
  const f = fixture(), store = createStore(':memory:');
  const fetcher: typeof fetch = async (url, init) => {
    const response = await f.fetcher(url, init);
    if (!String(url).includes('places.googleapis.com')) return response;
    const data = await response.json();
    for (const p of data.places ?? [data]) { delete p.regularOpeningHours; delete p.priceLevel; delete p.priceRange; }
    return Response.json(data, { status: response.status });
  };
  const api = createApi({ env: { GOOGLE_MAPS_SERVER_KEY: 'TEST', ROVELLE_MODEL_ENABLED: 'false' }, store, fetcher, now: f.now });
  try {
    const created = await (await api(apiRequest('/api/plans', { draft: f.draft }))).json();
    assert.equal(created.status, 'complete');
    assert.ok(created.result.primaryItinerary.stops.every((s: any) => s.hoursStatus === 'HOURS_UNKNOWN' && s.warnings.some((w: string) => /hours/i.test(w))));
    assert.ok(created.result.primaryItinerary.warnings.some((w: string) => /not verified|unverified/i.test(w)));
    const before = structuredClone(store.getPlan(created.currentPlan.id)); f.fail = true;
    for (const [path, body] of [
      ['/api/plans/' + before.id, undefined],
      ['/api/plans/edit', { planId: before.id, revision: before.revision, edit: { kind: 'adjust', text: 'Less driving' } }],
      ['/api/plans/live', { planId: before.id, revision: before.revision, action: { kind: 'late', minutes: 15 } }],
    ] as const) {
      const response = await api(apiRequest(path, body, created.planKey));
      assert.equal(response.status, 503); assert.deepEqual(store.getPlan(before.id), before);
      assert.ok(!JSON.stringify(await response.json()).includes('TEST provider outage'));
    }
    f.fail = false;
    assert.equal((await api(apiRequest('/api/plans/' + before.id, undefined, created.planKey))).status, 200);
    assert.deepEqual(store.getPlan(before.id), before);
  } finally { store.close(); }
});

test('scenario 15: mock invalid IDs and changed fixed identity are rejected before safe deterministic fallback', async () => {
  for (const kind of ['invalid-id', 'replace-reservation']) {
    const f = fixture(), r = request(), before = structuredClone(r);
    const world = createGoogleWorldProvider({ key: 'TEST', fetcher: f.fetcher }), routing = createGoogleRouting({ key: 'TEST', fetcher: f.fetcher });
    const model = { propose: async (packet: ModelPacket) => {
      const included = packet.candidates.filter(c => kind !== 'replace-reservation' || c.id !== 'TEST_SAVE_FOOD');
      const proposal: PlanProposal = { status: 'plan', interpreted_intent: 'TEST malicious fixture', stops: included.map(c => ({ place_id: c.id, experience_role: c.role, purpose: 'TEST' })), preserved_place_ids: ['TEST_SAVE_FOOD'], assumptions: [], changes: [], uncertainties: [], verification_needed: [], pacing_reason: 'TEST', budget_reason: 'TEST', explanation: 'TEST' };
      if (kind === 'invalid-id') proposal.stops.push({ place_id: 'TEST_INVENTED_ID', experience_role: 'meal', purpose: 'TEST' });
      return { proposal, metrics: { provider: 'openai' as const, model: 'TEST MOCK ONLY', constitutionVersion: '0.1', status: 'proposed' as const, calls: 0, retries: 0, latencyMs: 0, inputTokens: null, outputTokens: null, estimatedCostUsd: null } };
    } };
    const built = await createRealPlanner(world, routing, { model }).build(r);
    assert.equal(built.diagnostics.reasoning?.status, 'rejected');
    assert.ok(built.diagnostics.reasoning?.validationErrors?.includes(kind === 'invalid-id' ? 'UNKNOWN_PLACE' : 'MISSING_COMMITMENT'));
    assert.equal(built.result.status, 'complete'); if (built.result.status !== 'complete') continue;
    const fixed = built.result.primaryItinerary.stops.find(s => s.id === 'TEST_SAVE_FOOD')!;
    assert.equal(fixed.arrival, '19:00'); assert.equal(fixed.departure, '19:45'); assert.equal(fixed.protection, 'USER_FIXED');
    assert.ok(!built.result.primaryItinerary.stops.some(s => s.id === 'TEST_INVENTED_ID')); assert.deepEqual(r, before);
  }
});

test('scenario 15: mock AI cannot add its own arrival to override the backend fixed time', async () => {
  const f = fixture(), r = request();
  const fixed = candidateFromPlace(r.existingStops[0].place!, r.existingStops[0], r);
  const packet: ModelPacket = { task: 'create', input: { request: r, intent: lightweightIntent.normalize(r), start: 960, desiredFinish: 1380 }, candidates: [fixed], matrix: { points: [], legs: [] } };
  const proposed = { status: 'plan', interpreted_intent: 'TEST', stops: [{ place_id: fixed.id, experience_role: fixed.role, purpose: 'TEST', arrival: '20:00' }], preserved_place_ids: [fixed.id], assumptions: [], changes: [], uncertainties: [], verification_needed: [], pacing_reason: 'TEST', budget_reason: 'TEST', explanation: 'TEST' };
  let mockCalls = 0;
  const gateway = createOpenAIModelGateway({ OPENAI_API_KEY: 'TEST NOT A REAL KEY', ROVELLE_MODEL_ENABLED: 'true', ROVELLE_MODEL: 'TEST MOCK' }, async () => { mockCalls++; return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(proposed) }] }] }); });
  const response = await gateway.propose(packet);
  assert.equal(mockCalls, 1); assert.equal(response.proposal, null); assert.equal(response.metrics.status, 'malformed');
  assert.equal(r.existingStops[0].startTime, '19:00'); assert.ok(f.calls === 0);
});
