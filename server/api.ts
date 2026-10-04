import { validateRequest } from '../src/planning/validate.ts';
import { isPlanningDraft } from '../src/planning/state.ts';
import { outingClock } from '../src/planning/clock.ts';
import { WorldError } from './worldProvider.ts';
import { createGoogleWorldProvider } from './googleProvider.ts';
import { createGoogleRouting } from './googleRouting.ts';
import { createRealPlanner } from './realPlanner.ts';
import { durableRun } from './durableRun.ts';
import { durableDraft } from '../src/world/durable.ts';
import { isCurrentPlan, makeCurrentPlan, keepDecision, prepareEdit, requestToDraft } from '../src/planning/currentPlan.ts';
import type { CurrentPlan, PlanEdit } from '../src/planning/currentPlan.ts';

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
  const retainRun=async(run:any)=>{await options.store.save(durableRun(run));if(options.allowDiagnostics){if(liveRuns.size>=20)liveRuns.delete(liveRuns.keys().next().value!);liveRuns.set(run.runId,run);}};
  return async function handleApi(req: Request): Promise<Response> {
    const path = new URL(req.url).pathname;
    try {
      if (req.method === 'GET' && path === '/api/world/config') return json({ provider: 'google', configured: !!options.env.GOOGLE_MAPS_SERVER_KEY, browserKey: options.env.GOOGLE_MAPS_BROWSER_KEY ?? '', mapId: options.env.GOOGLE_MAPS_MAP_ID ?? 'DEMO_MAP_ID' });
      if (req.method === 'GET' && path.startsWith('/api/runs/')) {
        if (!options.allowDiagnostics) return json({ error: 'Not found' }, 404);
        const id = path.slice(10), run = liveRuns.get(id) ?? await options.store.get(id);
        return json(run ?? { error: 'Run not found' }, run ? 200 : 404);
      }
      if (req.method !== 'POST' || !['/api/plans', '/api/plans/edit', '/api/world/autocomplete', '/api/world/details', '/api/world/search', '/api/world/route'].includes(path)) return json({ error: 'Unknown endpoint' }, 404);
      const reader = req.body?.getReader();
      if (!reader) throw new WorldError('Send a valid request.', 400);
      let bytes = 0, body = '';
      const decoder = new TextDecoder();
      while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.byteLength; if (bytes > 250000) { await reader.cancel(); throw new WorldError('Request too large', 413); } body += decoder.decode(chunk.value, { stream: true }); }
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
      let current:CurrentPlan|null=null,edit:PlanEdit|null=null,prepared:ReturnType<typeof prepareEdit>|null=null;
      if(path==='/api/plans/edit') {
        if(!isCurrentPlan(input.currentPlan)||!input.edit||!['keep','release','change','adjust','details'].includes(input.edit.kind))throw new WorldError('The current plan could not be read. Your choices are still here.',400);
        current=input.currentPlan as CurrentPlan;edit=input.edit as PlanEdit;
        if(['keep','release','change'].includes(edit.kind)&&typeof (edit as {placeId:string}).placeId!=='string')throw new WorldError('Choose the stop you want to edit.',400);
        if(edit.kind==='adjust'&&typeof edit.text!=='string')throw new WorldError('Describe the change you want.',400);
        if(edit.kind==='keep'||edit.kind==='release') {
          let next:CurrentPlan;try{next=keepDecision(current,edit.placeId,edit.kind==='release');}catch(e){throw new WorldError(e instanceof Error?e.message:'This stop could not be updated.',409);}
          const run={runId:crypto.randomUUID(),timestamp:now().toISOString(),build:options.build??'cloud',request:next.request,status:'complete',result:next.result,currentPlan:next,parentRunId:current.runId,edit};next.runId=run.runId;
          await retainRun(run);
          return json({runId:run.runId,request:next.request,result:next.result,currentPlan:next});
        }
        try{prepared=prepareEdit(current,edit);}catch(e){const message=e instanceof Error?e.message:'This change could not be applied.';const runId=crypto.randomUUID();await retainRun({runId,timestamp:now().toISOString(),build:options.build??'cloud',request:current.request,status:'edit-conflict',currentPlan:current,parentRunId:current.runId,edit,diagnostics:{conflicts:[message],errorCodes:['EDIT_CONFLICT'],quality:[{lens:'INTENT_FIDELITY',passed:false,issues:[message]}]}});return json({error:message,runId},409);}
        input.draft=requestToDraft(prepared.request);
      }
      if (!isPlanningDraft(input.draft)) throw new WorldError('Your outing details are incomplete. Review the form and try again.', 400);
      if (input.draft.existingStops.length > 20) throw new WorldError('Keep this outing to 20 existing stops or fewer.', 400);
      const valid = validateRequest(input.draft, { requirePlaceSelections: true });
      if (!valid.ok) {const runId=crypto.randomUUID();await options.store.save({runId,timestamp:now().toISOString(),build:options.build??'cloud',parentRunId:current?.runId??null,status:'validation-error',request:durableDraft(input.draft),edit:edit?.kind==='details'?{kind:'details',request:durableDraft(edit.request)}:edit,diagnostics:{validationErrors:valid.errors,quality:[{lens:'INTENT_FIDELITY',passed:false,issueCount:Object.keys(valid.errors).length}]}});return json({ error: Object.values(valid.errors)[0], details: valid.errors,runId }, 400);}
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
        let retained=prepared?.retainedStops??[];
        if(edit?.kind==='details')retained=retained.filter(s=>!s.userStopId); // Edited/removed intake pieces are explicit human changes.
        if(retained.length){const refreshed=await world.resolveReferences(retained.map(s=>s.place.provider_place_id));retained=retained.map(s=>({...s,place:refreshed.get(s.place.provider_place_id)!}));}
        return createRealPlanner(world, routing, { clock: now }).build(request,{retainedStops:retained,excludedIds:prepared?.excludedIds,surgical:prepared?.surgical,replacementRole:prepared?.replacementRole});
      })().catch(error=>({result:{status:'no-plan',primaryItinerary:null,message:error instanceof WorldError?error.message:'Place or travel information could not load. Your choices are still here. Please try again.'},diagnostics:{conflicts:['PROVIDER_OR_TIME_FAILURE'],errorCodes:['PROVIDER_OR_TIME_FAILURE'],quality:[{lens:'REAL_WORLD_ACCURACY',passed:false,issues:['Place, travel or current-time validation failed.']}]}}));
      const timeout = new Promise<any>(resolve => { timer = setTimeout(() => resolve({ result: { status: 'no-plan', primaryItinerary: null, message: 'Real place or travel information took too long to load. Your choices are saved. Please try again.' }, diagnostics: { normalizedRequest: structuredClone(request), conflicts: ['PROVIDER_TIMEOUT'],errorCodes:['PROVIDER_TIMEOUT'],quality:[{lens:'REAL_WORLD_ACCURACY',passed:false,issues:['Place or travel service timed out.']}], elapsedLimitMs: 27000 } }), 27000); });
      const planned = await Promise.race([boundedWork, timeout]).finally(() => clearTimeout(timer));
      const parentId=current?.runId??input.parentRunId;
      const parentRunId = typeof parentId === 'string' && await options.store.get(parentId) ? parentId : null;
      const runId=crypto.randomUUID();
      const currentPlan=planned.result.status==='complete'?(current?{...current,revision:current.revision+1,runId,request,result:planned.result,excludedPlaceIds:prepared!.excludedIds,history:[...prepared!.history,{at:now().toISOString(),type:'changed' as const,runId},...planned.result.primaryItinerary.stops.map((s:any)=>({at:now().toISOString(),type:'selected' as const,placeId:s.id,runId}))].slice(-500)}:makeCurrentPlan(runId,request,planned.result)):current;
      const run = { runId, timestamp: now().toISOString(), build: options.build ?? 'cloud', request, status: planned.result.status, result: planned.result, diagnostics: planned.diagnostics, parentRunId,currentPlan,edit };
      await retainRun(run);
      return json({ runId: run.runId, request, result: planned.result, status: run.status,currentPlan,conflict:current&&planned.result.status!=='complete'?planned.result.message:null });
    } catch (error) {
      if (error instanceof WorldError) return json({ error: error.message }, error.status);
      // Public responses never disclose credentials, provider payloads or internal diagnostics.
      return json({ error: 'The outing service is unavailable right now. Your choices are still here. Please try again.' }, 503);
    }
  };
}
