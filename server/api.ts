import { validateRequest } from '../src/planning/validate.ts';
import { isPlanningDraft } from '../src/planning/state.ts';
import { outingClock } from '../src/planning/clock.ts';
import { WorldError } from './worldProvider.ts';
import { createGoogleWorldProvider } from './googleProvider.ts';
import { createGoogleRouting } from './googleRouting.ts';
import { createRealPlanner } from './realPlanner.ts';
import { durableRun } from './durableRun.ts';

export interface RunStore {
  save(run: any): void | Promise<void>;
  get(id: string): any | Promise<any>;
}
export interface ApiEnvironment {
  GOOGLE_MAPS_SERVER_KEY?: string;
  GOOGLE_MAPS_BROWSER_KEY?: string;
  GOOGLE_MAPS_MAP_ID?: string;
}
/** The Node preview and cloud deployment use this same API and planning pipeline. */
export function createApi(options: { env: ApiEnvironment; store: RunStore; build?: string; allowDiagnostics?: boolean; fetcher?: typeof fetch; now?: () => Date }) {
  const liveRuns = new Map<string, any>();
  const now = options.now ?? (() => new Date());
  const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
  return async function handleApi(req: Request): Promise<Response> {
    const path = new URL(req.url).pathname;
    try {
      if (req.method === 'GET' && path === '/api/world/config') return json({ provider: 'google', configured: !!options.env.GOOGLE_MAPS_SERVER_KEY, browserKey: options.env.GOOGLE_MAPS_BROWSER_KEY ?? '', mapId: options.env.GOOGLE_MAPS_MAP_ID ?? 'DEMO_MAP_ID' });
      if (req.method === 'GET' && path.startsWith('/api/runs/')) {
        if (!options.allowDiagnostics) return json({ error: 'Not found' }, 404);
        const id = path.slice(10), run = liveRuns.get(id) ?? await options.store.get(id);
        return json(run ?? { error: 'Run not found' }, run ? 200 : 404);
      }
      if (req.method !== 'POST' || !['/api/plans', '/api/world/autocomplete', '/api/world/details', '/api/world/search', '/api/world/route'].includes(path)) return json({ error: 'Unknown endpoint' }, 404);
      const reader = req.body?.getReader();
      if (!reader) throw new WorldError('Send a valid request.', 400);
      let bytes = 0, body = '';
      const decoder = new TextDecoder();
      while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.byteLength; if (bytes > 100000) { await reader.cancel(); throw new WorldError('Request too large', 413); } body += decoder.decode(chunk.value, { stream: true }); }
      body += decoder.decode();
      let input: any;
      try { input = JSON.parse(body); } catch { throw new WorldError('Send a valid request.', 400); }
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new WorldError('Send a valid request.', 400);
      const world = createGoogleWorldProvider({ key: options.env.GOOGLE_MAPS_SERVER_KEY ?? '', fetcher: options.fetcher, now });
      const routing = createGoogleRouting({ key: options.env.GOOGLE_MAPS_SERVER_KEY ?? '', fetcher: options.fetcher });
      if (path === '/api/world/autocomplete') return json(await world.autocompleteLocation(input.query, input.bias, input.sessionToken));
      if (path === '/api/world/details') { if (typeof input.placeId !== 'string') throw new WorldError('Select a valid place.', 400); return json(await world.getPlaceDetails(input.placeId, input.sessionToken)); }
      if (path === '/api/world/search') return json(await world.searchPlaces(input));
      if (path === '/api/world/route') return json(await routing.getRouteEstimate(input.origin, input.destination, input.mode));
      if (!isPlanningDraft(input.draft)) throw new WorldError('Your outing details are incomplete. Review the form and try again.', 400);
      if (input.draft.existingStops.length > 20) throw new WorldError('Keep this outing to 20 existing stops or fewer.', 400);
      const valid = validateRequest(input.draft, { requirePlaceSelections: true });
      if (!valid.ok) return json({ error: Object.values(valid.errors)[0], details: valid.errors }, 400);
      const request = valid.request;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const boundedWork = (async () => {
        const selections = [request.startingPlace!, ...request.existingStops.flatMap(stop => stop.place ? [stop.place] : [])];
        const references = await world.resolveReferences(selections.map(p => p.provider_place_id), selections);
        request.startingPlace = references.get(request.startingPlace!.provider_place_id)!;
        request.startingLocation = request.startingPlace.display_name;
        request.existingStops = request.existingStops.map(stop => stop.place ? { ...stop, place: references.get(stop.place.provider_place_id)!, name: references.get(stop.place.provider_place_id)!.display_name } : stop);
        const current = validateRequest({ ...input.draft, startingLocation: request.startingLocation, startingPlace: request.startingPlace }, { requirePlaceSelections: true, notBefore: outingClock(request.timeZone, request.startingPlace, now()) });
        if (!current.ok) throw new WorldError(Object.values(current.errors)[0], 400);
        return createRealPlanner(world, routing, { clock: now }).build(request);
      })();
      const timeout = new Promise<any>(resolve => { timer = setTimeout(() => resolve({ result: { status: 'no-plan', primaryItinerary: null, message: 'Real place or travel information took too long to load. Your choices are saved. Please try again.' }, diagnostics: { normalizedRequest: structuredClone(request), conflicts: ['PROVIDER_TIMEOUT'], elapsedLimitMs: 27000 } }), 27000); });
      const planned = await Promise.race([boundedWork, timeout]).finally(() => clearTimeout(timer));
      const parentRunId = typeof input.parentRunId === 'string' && await options.store.get(input.parentRunId) ? input.parentRunId : null;
      const run = { runId: crypto.randomUUID(), timestamp: now().toISOString(), build: options.build ?? 'cloud', request, status: planned.result.status, result: planned.result, diagnostics: planned.diagnostics, parentRunId };
      await options.store.save(durableRun(run));
      if (options.allowDiagnostics) { if (liveRuns.size >= 20) liveRuns.delete(liveRuns.keys().next().value!); liveRuns.set(run.runId, run); }
      return json({ runId: run.runId, request, result: planned.result, status: run.status });
    } catch (error) {
      if (error instanceof WorldError) return json({ error: error.message }, error.status);
      // Public responses never disclose credentials, provider payloads or internal diagnostics.
      return json({ error: 'The outing service is unavailable right now. Your choices are still here. Please try again.' }, 503);
    }
  };
}
