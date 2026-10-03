import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createApi } from '../server/api.ts';
import { createCloudStore, withinPublicLimits } from '../server/cloudStore.ts';
import cloudWorker from '../server/cloudWorker.ts';
import { normalizeGooglePlace } from '../server/googleProvider.ts';
import { emptyDraft, newStop } from '../src/planning/draft.ts';
function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync('drizzle/0000_regular_forge.sql', 'utf8'));
  const db = { prepare(sql: string) { let values: any[] = []; const statement = sqlite.prepare(sql); const adapter = { bind(...args: any[]) { values = args; return adapter; }, async first() { return statement.get(...values) ?? null; }, async run() { return statement.run(...values); } }; return adapter; }, async batch(statements: any[]) { sqlite.exec('BEGIN'); try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec('COMMIT'); return results; } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } };
  return { sqlite, db };
}
const request = (path: string, body?: unknown, headers = {}) => new Request('https://outing.example' + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const rawPlace = (id: string, type: string) => ({ id, displayName: { text: 'TEST cloud venue' }, formattedAddress: 'TEST address', location: { latitude: 34.05, longitude: -118.24 }, primaryType: type, types: [type], businessStatus: 'OPERATIONAL', addressComponents: [{ types: ['country'], shortText: 'US' }], regularOpeningHours: { periods: [{ open: { day: 0, hour: 0 } }] } });
test('public configuration omits the server key and hides founder run records', async () => {
  const { sqlite, db } = database();
  const api = createApi({ env: { GOOGLE_MAPS_SERVER_KEY: 'TEST_SECRET_SERVER', GOOGLE_MAPS_BROWSER_KEY: 'TEST_BROWSER' }, store: createCloudStore(db) });
  const config = await (await api(request('/api/world/config'))).json();
  assert.equal(config.browserKey, 'TEST_BROWSER'); assert.equal(config.configured, true); assert.equal(JSON.stringify(config).includes('TEST_SECRET_SERVER'), false);
  assert.equal((await api(request('/api/runs/a-private-run'))).status, 404); sqlite.close();
});
test('shared API rejects invalid requests before a Google call and handles missing configuration', async () => {
  const { sqlite, db } = database(); let calls = 0;
  const api = createApi({ env: {}, store: createCloudStore(db), fetcher: async () => { calls++; throw new Error('TEST private provider failure'); } });
  assert.equal((await api(request('/api/plans', { draft: { ...emptyDraft(), groupSize: '0' } }))).status, 400);
  const unavailable = await api(request('/api/world/autocomplete', { query: 'Los Angeles' })); assert.equal(unavailable.status, 503); assert.equal(calls, 0);
  assert.equal((await api(request('/api/world/details', { placeId: 'not valid !' }))).status, 400); sqlite.close();
});
test('cloud API builds an overnight plan and persists fixed intent, IDs and per-person budget', async () => {
  const { sqlite, db } = database();
  const origin = rawPlace('TEST_CLOUD_ORIGIN', 'locality'), meal = rawPlace('TEST_CLOUD_DINNER', 'restaurant'), activity = rawPlace('TEST_CLOUD_BOWLING', 'bowling_alley');
  const fetcher = async (url: any, init: any) => {
    const address = String(url), body = init.body ? JSON.parse(init.body) : null;
    if (address.includes('computeRouteMatrix')) return Response.json(body.origins.flatMap((_: unknown, i: number) => body.destinations.map((__: unknown, j: number) => ({ originIndex: i, destinationIndex: j, condition: 'ROUTE_EXISTS', duration: i === j ? '0s' : '300s', distanceMeters: i === j ? 0 : 1500 }))));
    if (address.includes('searchNearby')) return Response.json({ places: body.includedTypes.includes('bowling_alley') ? [activity] : body.includedTypes.includes('restaurant') ? [meal] : [] });
    const record = [origin, meal, activity].find(p => address.includes('/places/' + p.id));
    assert.ok(record, 'Unexpected provider request in isolated TEST scenario'); return Response.json(record);
  };
  const start = normalizeGooglePlace(origin).place, venue = normalizeGooglePlace(meal).place;
  const draft = { ...emptyDraft(), date: '2026-10-03', startingLocation: start.display_name, startingPlace: start, availableStartTime: '22:00', requiredEndTime: '03:00', budgetPerPerson: '80', groupSize: '5', transportation: 'driving', vibeInterests: 'dinner and something fun', startingState: 'reservation', existingStops: [{ ...newStop(true), name: venue.display_name, place: venue, startTime: '00:30', timingDetail: 'end-time', endTime: '01:30', note: 'Keep my overnight dinner' }] };
  const store = createCloudStore(db), api = createApi({ env: { GOOGLE_MAPS_SERVER_KEY: 'TEST' }, store, fetcher: fetcher as typeof fetch, now: () => new Date('2026-10-02T12:00:00Z') });
  const response = await api(request('/api/plans', { draft })), run = await response.json();
  assert.equal(response.status, 200); assert.equal(run.status, 'complete'); assert.equal(run.request.endDate, '2026-10-04'); assert.equal(run.request.budgetPerPerson.amountCents, 8000);
  const fixed = run.result.primaryItinerary.stops.find((s: any) => s.fixed); assert.equal(fixed.arrival, '00:30'); assert.equal(fixed.arrivalDayOffset, 1); assert.equal(fixed.departure, '01:30');
  const saved = await store.get(run.runId); assert.equal(saved.request.existingStops[0].fixed, true); assert.equal(saved.request.existingStops[0].startDayOffset, 1); assert.equal(saved.request.existingStops[0].pendingPlaceId, meal.id); assert.equal(saved.request.existingStops[0].note, 'Keep my overnight dinner'); assert.equal(JSON.stringify(saved).includes('TEST address'), false);
  sqlite.close();
});
test('public rate limits are shared by independent database adapters and exclude plain IP addresses', async () => {
  const { sqlite, db } = database(), at = 1_800_000_000_000;
  const r = request('/api/plans', {}, { 'cf-connecting-ip': '192.0.2.42' });
  for (let i = 0; i < 6; i++) assert.equal(await withinPublicLimits(db, r, at), true);
  assert.equal(await withinPublicLimits({ ...db }, r, at), false); assert.equal(await withinPublicLimits(db, r, at + 300000), true);
  assert.equal(JSON.stringify(sqlite.prepare('SELECT * FROM request_limits').all()).includes('192.0.2.42'), false); sqlite.close();
});
test('cloud entry point refuses private files, founder paths and cross-site API posts', async () => {
  const { sqlite, db } = database(); const env = { DB: db, ASSETS: { fetch: async () => new Response('TEST frontend') } };
  for (const path of ['/.env.local', '/server/start.mjs', '/founder', '/founder/runs', '/api/runs/private']) assert.equal((await cloudWorker.fetch(request(path), env)).status, 404);
  assert.equal((await cloudWorker.fetch(request('/api/plans', {}, { Origin: 'https://other.example' }), env)).status, 403);
  const root = await cloudWorker.fetch(request('/'), env); assert.equal(root.status, 200); assert.equal(root.headers.get('X-Content-Type-Options'), 'nosniff'); sqlite.close();
});
