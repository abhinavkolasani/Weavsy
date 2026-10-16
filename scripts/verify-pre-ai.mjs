// Live founder acceptance: Google only, paid AI forcibly disabled. Never archive provider content or access keys.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createApi } from '../server/api.ts';
import { createStore } from '../server/store.mjs';
import { emptyDraft, newStop } from '../src/planning/draft.ts';
import { isRealPlanResult } from '../src/itinerary/realPlan.ts';
import { outingWindow } from '../src/planning/timeline.ts';
import { toMinutes } from '../src/planning/validate.ts';
import { qualifyPlace } from '../src/planner/qualification.ts';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
assert.ok(process.env.GOOGLE_MAPS_SERVER_KEY, 'Configure the existing Google server key before live tests.');
const scratch = mkdtempSync(join(tmpdir(), 'rovelle-pre-ai-'));
let store = createStore(join(scratch, 'acceptance.sqlite'));
const env = { GOOGLE_MAPS_SERVER_KEY: process.env.GOOGLE_MAPS_SERVER_KEY, ROVELLE_MODEL_ENABLED: 'false' };
let googleCalls = 0, modelCalls = 0;
const fetcher = async (url, init) => {
  if (String(url).startsWith('https://api.openai.com/')) { modelCalls++; throw new Error('Paid AI is prohibited during pre-AI acceptance.'); }
  googleCalls++;
  return fetch(url, init);
};
const makeApi = () => createApi({ env, store, fetcher, allowDiagnostics: true, build: 'pre-ai-acceptance' });
let api = makeApi();
const records = [];
const reportPath = 'artifacts/pre-ai/live-results.json';
mkdirSync('artifacts/pre-ai', { recursive: true });
const startedAt = new Date().toISOString();
const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const date = new Date(localDate + 'T12:00:00Z');
// Always a future Saturday; the Friday study test uses the following Friday.
date.setUTCDate(date.getUTCDate() + ((6 - date.getUTCDay() + 7) % 7 || 7));
const saturday = date.toISOString().slice(0, 10);
const friday = new Date(date.getTime() + 6 * 86400000).toISOString().slice(0, 10);
async function call(path, body, key) {
  const response = await api(new Request('https://outing.test' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(key ? { 'X-Plan-Key': key } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }));
  const data = await response.json();
  assert.ok(response.ok, `${response.status}: ${data.error ?? 'Request failed'}`);
  return data;
}
async function select(query, bias) {
  const suggestions = await call('/api/world/autocomplete', { query, bias });
  assert.ok(suggestions.length, 'No live Google suggestion: ' + query);
  return (await call('/api/world/details', { placeId: suggestions[0].provider_place_id })).place;
}
async function selectDestination(query, location) {
  const found = await call('/api/world/search', { query, location, limit: 6 });
  const place = found.places.find(p => p.display_name.toLowerCase() === query.toLowerCase() && qualifyPlace(p, undefined, true).accepted);
  assert.ok(place, 'No exact consumer destination returned by Google: ' + query);
  return (await call('/api/world/details', { placeId: place.provider_place_id })).place;
}
const entry = (place, fixed = false, startTime = '', duration = '') => ({ ...newStop(fixed), entryKind: 'place', name: place.display_name, place, startTime, ...(duration ? { timingDetail: 'duration', durationMinutes: duration } : {}) });
const activity = name => ({ ...newStop(), entryKind: 'activity', name });
let base, basic, beach, fixedDinner;
function itinerary(run) {
  assert.equal(run.result?.status, 'complete', run.result?.message ?? run.error);
  assert.ok(isRealPlanResult(run.result));
  return run.result.primaryItinerary;
}
async function build(patch = {}) {
  const began = Date.now();
  const run = await call('/api/plans', { draft: { ...base, ...patch } });
  run.testElapsedMs = Date.now() - began;
  return run;
}
async function edit(run, change) {
  const next = await call('/api/plans/edit', { planId: run.currentPlan.id, revision: run.currentPlan.revision, edit: change }, run.planKey);
  return { ...next, planKey: run.planKey };
}
async function live(run, action) {
  const next = await call('/api/plans/live', { planId: run.currentPlan.id, revision: run.currentPlan.revision, action }, run.planKey);
  return { ...next, result: next.currentPlan.result, planKey: run.planKey };
}
function assertFeasible(run) {
  const plan = itinerary(run), request = run.request ?? run.currentPlan.request;
  assert.equal(request.budgetPerPerson.amountCents, Math.round(Number(base.budgetPerPerson) * 100));
  let cursor = outingWindow(request).start;
  for (const stop of plan.stops) {
    assert.equal(stop.place.provider, 'google');
    assert.equal(stop.id, stop.place.provider_place_id);
    assert.ok(!stop.id.startsWith('TEST'));
    const arrival = toMinutes(stop.arrival) + (stop.arrivalDayOffset ?? 0) * 1440;
    const departure = toMinutes(stop.departure) + (stop.departureDayOffset ?? 0) * 1440;
    assert.ok(arrival >= cursor + stop.travel.minutes + stop.transitionMinutes, 'Travel overlaps a stop.');
    assert.ok(departure > arrival);
    assert.notEqual(stop.hoursStatus, 'CLOSED_CONFIRMED');
    cursor = departure;
  }
  assert.ok(run.testElapsedMs === undefined || run.testElapsedMs < 30000, 'Build exceeded 30 seconds.');
}
function save() {
  writeFileSync(reportPath, JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), dates: { saturday, friday }, paidAiEnabled: false, googleCalls, modelCalls, records }, null, 2) + '\n');
}
async function scenario(number, name, work) {
  try {
    const result = await work();
    const run = result.run;
    const plan=run?.result?.primaryItinerary;
    const row = { number, name, functionality: 'Pass', dataAccuracy: result.dataAccuracy ?? 'Uncertain', quality: result.quality ?? 'Needs improvement', observation: result.observation, ...(run ? { runId: run.runId, planId: run.currentPlan?.id, revision: run.currentPlan?.revision, elapsedMs: run.testElapsedMs, placeIds: plan?.stops.map(s => s.id), roles: plan?.stops.map(s => s.role), hoursStatuses: plan?.stops.map(s=>s.hoursStatus), plannedStart:plan?.start,plannedFinish:plan?.finish,travelMinutes:plan?.travelMinutes,estimatedCostPerPersonCents: plan?.costPerPersonCents } : {}) };
    records.push(row); console.log(JSON.stringify(row));
  } catch (error) {
    const row = { number, name, functionality: 'Fail', dataAccuracy: 'Uncertain', quality: 'Needs improvement', observation: String(error.message).slice(0, 1100) };
    records.push(row); console.log(JSON.stringify(row));
  }
  save();
}

try {
  const origin = await select('Cypress, CA');
  base = { ...emptyDraft(), startingPlace: origin, startingLocation: origin.display_name, timeZone: 'America/Los_Angeles', date: saturday, availableStartTime: '16:00', requiredEndTime: '23:00', budgetPerPerson: '40', groupSize: '5', transportation: 'driving', vibeInterests: 'Dinner, something fun, and dessert', startingState: 'nothing-planned', existingStops: [] };
  await scenario(1, 'Nothing planned', async () => {
    basic = await build(); assertFeasible(basic);
    const roles = itinerary(basic).stops.map(s => s.role);
    for (const role of ['meal', 'main-activity', 'dessert']) assert.ok(roles.includes(role), 'Missing requested ' + role);
    assert.equal(basic.request.groupSize, 5);
    return { run: basic, observation: 'Real identities and nonoverlapping travel checked. Prices, admission and enjoyment are not verified.' };
  });
  const beachPatch = { groupSize: '2', availableStartTime: '17:00', requiredEndTime: '21:00', vibeInterests: 'Dinner, a peaceful beach walk, and ice cream' };
  await scenario(2, 'Beach date', async () => {
    beach = await build(beachPatch); assertFeasible(beach);
    const roles = itinerary(beach).stops.map(s => s.role);
    for (const role of ['meal', 'scenic-relax', 'dessert']) assert.ok(roles.includes(role), 'Missing requested ' + role);
    return { run: beach, observation: 'Beach, meal and dessert present. Peacefulness, romance, beach access and pacing need founder judgment.' };
  });
  await scenario(3, 'Specific destination', async () => {
    const pier = await selectDestination('Huntington Beach Pier', origin);
    assert.match(pier.display_name, /Huntington.*Pier/i);
    const run = await build({ ...beachPatch, startingState: 'anchor', existingStops: [entry(pier)] });
    assertFeasible(run);
    assert.ok(itinerary(run).stops.some(s => s.id === pier.provider_place_id && s.protection === 'USER_PLACE'));
    assert.ok(itinerary(run).stops.some(s => s.role === 'dessert'));
    return { run, observation: 'Exact selected pier ID preserved; no claim of verified pier/beach access.' };
  });
  await scenario(4, 'Dinner reservation', async () => {
    const restaurant = itinerary(basic).stops.find(s => s.role === 'meal').place;
    fixedDinner = await build({ groupSize: '4', startingState: 'reservation', existingStops: [entry(restaurant, true, '19:00', '60')] });
    assertFeasible(fixedDinner);
    const stops = itinerary(fixedDinner).stops, dinner = stops.find(s => s.id === restaurant.provider_place_id);
    assert.ok(dinner.fixed && dinner.exactTime); assert.equal(dinner.arrival, '19:00');
    assert.equal(fixedDinner.request.existingStops[0].startTime, '19:00');
    assert.ok(stops.some(s => s.departure < '19:00') && stops.some(s => s.arrival >= '20:00'), 'Missing fill before or after fixed dinner.');
    return { run: fixedDinner, observation: 'Simulated user booking preserves exact ID, 7 PM and user-entered 60 minutes. No booking was made.' };
  });
  await scenario(5, 'Partial outing', async () => {
    const run = await build({ groupSize: '3', startingState: 'partial-plan', existingStops: [activity('Bowling'), activity('Dessert afterward')], vibeInterests: 'Bowling, then dessert. Fill the missing parts.' });
    assertFeasible(run);
    const stops = itinerary(run).stops, bowl = stops.findIndex(s => s.category === 'Bowling'), dessert = stops.findIndex(s => s.role === 'dessert');
    assert.ok(bowl >= 0 && dessert > bowl, 'Decided bowling → dessert sequence was not preserved.');
    return { run, observation: 'Experience choices and bowling before dessert checked. Specific venue suitability needs founder judgment.' };
  });
  await scenario(6, 'Almost complete', async () => {
    const chosen = itinerary(basic).stops.filter(s => ['meal', 'main-activity', 'dessert'].includes(s.role));
    const run = await build({ startingState: 'almost-complete', existingStops: chosen.map(s => entry(s.place)) });
    assertFeasible(run);
    const stop = chosen.find(s => s.role === 'dessert');
    const request = structuredClone(run.request), index = request.existingStops.findIndex(s => s.place.provider_place_id === stop.id);
    const alternatives = await call('/api/world/search', { query: 'dessert', types: ['dessert'], location: stop.place, limit: 6 });
    const alternative = alternatives.places.find(p => !chosen.some(s => s.id === p.provider_place_id));
    assert.ok(alternative, 'No independent real dessert available for the explicit edit.');
    // Change only this user-selected decision through Edit details.
    request.existingStops[index] = { ...request.existingStops[index], name: alternative.display_name, place: alternative };
    const changed = await edit(run, { kind: 'details', request });
    assert.equal(changed.conflict, null);
    for (const other of chosen.filter(s => s.id !== stop.id)) assert.ok(itinerary(changed).stops.some(s => s.id === other.id), 'Another decided place was rebuilt.');
    assert.ok(itinerary(changed).stops.some(s => s.id === alternative.provider_place_id));
    assert.ok(!itinerary(changed).stops.some(s => s.id === stop.id));
    assert.equal(changed.currentPlan.id, run.currentPlan.id);
    return { run: changed, observation: 'Explicitly selected a different real dessert through Edit details; other two user places and saved-plan identity remain.' };
  });
  await scenario(7, 'Strict budget', async () => {
    const run = await build({ groupSize: '2', budgetPerPerson: '35', budgetIsCap: true, vibeInterests: 'Dinner and an activity; must not exceed $35 per person.' });
    assert.equal(run.request.budgetPerPerson.amountCents, 3500);
    if (run.result.status === 'complete') {
      const plan = itinerary(run); assert.ok(plan.costPerPersonCents <= 3500);
      assert.ok(plan.warnings.some(w => /cap.*estimates|prices.*unverified/i.test(w)));
      assert.ok(plan.stops.some(s => s.role === 'meal') && plan.stops.some(s => s.role === 'main-activity'), 'Claimed complete dinner/activity without both experiences.');
    } else assert.match(run.result.message, /cap|budget|fit|constraint/i);
    return { run, observation: 'Cap applies to estimates, never guaranteed real spend. Infeasibility is acceptable when both requested experiences cannot fit.' };
  });
  await scenario(8, 'Short relaxed night', async () => {
    const run = await build({ groupSize: '2', availableStartTime: '20:00', requiredEndTime: '21:30', finishIsHard: true, vibeInterests: 'Just a relaxed walk and dessert near Cypress. Less driving.' });
    assertFeasible(run);
    const plan = itinerary(run); assert.ok(plan.finish <= '21:30');
    assert.ok(plan.stops.some(s => ['walk-explore', 'scenic-relax'].includes(s.role)) && plan.stops.some(s => s.role === 'dessert'), 'Walk and dessert were not both included.');
    assert.ok(plan.stops.length <= 2, 'Short outing gained unnecessary extra stops.');
    return { run, observation: 'Ninety-minute hard finish, two requested experiences and no extra stops checked; relaxed feel requires founder judgment.' };
  });
  await scenario(9, 'Difficult timing', async () => {
    const distant = await selectDestination('Santa Monica Pier', origin);
    const restaurant = itinerary(fixedDinner).stops.find(s => s.exactTime).place;
    const run = await build({ availableStartTime: '18:00', requiredEndTime: '20:00', finishIsHard: true, startingState: 'partial-plan', existingStops: [entry(distant, true, '18:10', '30'), entry(restaurant, true, '19:00', '60')] });
    assert.notEqual(run.result.status, 'complete');
    assert.equal(run.request.existingStops[0].place.provider_place_id, distant.provider_place_id);
    assert.equal(run.request.existingStops[1].startTime, '19:00');
    return { run, observation: 'Unreachable commitments rejected without silently moving or replacing either user decision.' };
  });
  await scenario(10, 'Keep and change', async () => {
    const stops = itinerary(basic).stops, keptId = stops[0].id, target = stops.find(s => s.id !== keptId && s.role === 'dessert');
    assert.ok(target);
    const kept = await edit(basic, { kind: 'keep', placeId: keptId });
    const changed = await edit(kept, { kind: 'change', placeId: target.id });
    assert.equal(changed.conflict, null);
    const next = itinerary(changed).stops;
    for (const old of stops.filter(s => s.id !== target.id)) assert.ok(next.some(s => s.id === old.id), 'Unselected stop replaced.');
    assert.ok(!next.some(s => s.id === target.id)); assert.ok(next.some(s => s.id === keptId && s.protection === 'USER_KEPT'));
    basic = changed;
    return { run: changed, observation: 'Only selected dessert replaced. Kept protection, other identities, same Plan and affected travel retained.' };
  });
  await scenario(11, 'Save and return', async () => {
    const previous = basic.currentPlan;
    store.close(); store = createStore(join(scratch, 'acceptance.sqlite')); api = makeApi();
    const reopened = await call('/api/plans/' + previous.id, undefined, basic.planKey);
    assert.equal(reopened.currentPlan.id, previous.id); assert.equal(reopened.currentPlan.revision, previous.revision);
    assert.deepEqual(reopened.currentPlan.result.primaryItinerary.stops.map(s => [s.id, s.protection, s.arrival]), previous.result.primaryItinerary.stops.map(s => [s.id, s.protection, s.arrival]));
    assert.equal(reopened.currentPlan.request.budgetPerPerson.amountCents, 4000);
    if (reopened.currentPlan.result.primaryItinerary.costPerPersonCents > 4000) assert.ok(reopened.currentPlan.result.primaryItinerary.warnings.some(w => /above your.*target/i.test(w)));
    return { run: { ...reopened, result: reopened.currentPlan.result }, quality: 'Good', observation: 'Actual SQLite close/reopen and new API instance retained edited Plan, IDs, times, budget and Keep. Browser/cross-device confirmation remains separate.' };
  });
  await scenario(12, 'Running late', async () => {
    const first = itinerary(basic).stops[0];
    let run = await live(basic, { kind: 'complete', placeId: first.id });
    run = await live(run, { kind: 'late', minutes: 15 });
    const skipped = itinerary(run).stops.find(s => s.id !== first.id && ['PLANNER_FLEXIBLE', 'EXPERIENCE_ANCHOR'].includes(s.protection));
    assert.ok(skipped); run = await live(run, { kind: 'skip', placeId: skipped.id });
    const preserved = s => ({ id: s.id, arrival: s.arrival, departure: s.departure, arrivalDayOffset: s.arrivalDayOffset, departureDayOffset: s.departureDayOffset, duration: s.duration, cost: s.cost, protection: s.protection, exactTime: s.exactTime, note: s.note });
    assert.deepEqual(preserved(itinerary(run).stops.find(s => s.id === first.id)), preserved(first));
    for (const type of ['completed', 'late', 'skipped']) assert.ok(run.currentPlan.execution.some(e => e.type === type));
    return { run, observation: 'Simulated completion, 15-minute delay and skip retained immutable completed stop and explicit history. This is bounded repair, not a real outing or autonomous replacement.' };
  });
  await scenario(13, 'Library reality', async () => {
    const buenaPark = await select('Buena Park, CA', origin);
    const run = await build({ startingPlace: buenaPark, startingLocation: buenaPark.display_name, date: friday, groupSize: '1', availableStartTime: '14:00', requiredEndTime: '17:00', vibeInterests: 'Somewhere to study, preferably a public library near Buena Park or Cypress College. Check access and parking.' });
    if (run.result.status === 'clarification') return { run, observation: 'Unsupported study access is explicitly clarified; no library availability or parking claims invented.' };
    const plan = itinerary(run), library = plan.stops.find(s => /library|study/i.test(s.category));
    assert.ok(library, 'Study request returned a leisure outing instead of study access or a clarification.');
    assert.ok(library.warnings.some(w => /access|visitor|public/i.test(w)), 'Study access restrictions not disclosed.');
    assert.ok(plan.warnings.concat(library.warnings).some(w => /parking/i.test(w)));
    const reopened = await call('/api/plans/' + run.currentPlan.id, undefined, run.planKey);
    assert.ok(itinerary({ result: reopened.currentPlan.result }).stops.find(s => s.id === library.id).warnings.some(w => /access/i.test(w)));
    return { run, observation: 'Live library identity and Friday provider hours checked when supplied. Public/student access, exceptions and parking costs remain explicitly uncertain.' };
  });
} finally {
  save(); store.close(); rmSync(scratch, { recursive: true, force: true });
}
// Failure injection is deterministic and mock-only, never a live AI request.
for (const [number, name] of [[14, 'Missing or failed provider information'], [15, 'Invalid AI response (mock only)']]) {
  await scenario(number, name, async () => {
    const checked = spawnSync(process.execPath, ['--experimental-strip-types', '--test', `--test-name-pattern=^scenario ${number}:`, 'tests/pre-ai.test.ts'], { encoding: 'utf8' });
    assert.equal(checked.status, 0, 'Controlled failure regression failed; run tests/pre-ai.test.ts for details.');
    return { dataAccuracy: 'Uncertain', quality: 'Good', observation: number === 14 ? 'Injected unknown hours/prices and provider failures on reopen/edit/live; no fabricated data or saved-state corruption.' : 'Mock-only fabricated ID, omitted fixed reservation and attempted timing override rejected. Safe fallback preserved fixed ID and 7 PM; no external AI request.' };
  });
}
assert.equal(modelCalls, 0, 'Pre-AI acceptance must never call OpenAI.');
console.log(`Completed 13 live scenarios and 2 controlled checks; ${records.filter(r => r.functionality === 'Fail').length} failures. No paid model calls.`);
if (records.some(r => r.functionality === 'Fail')) process.exitCode = 1;
