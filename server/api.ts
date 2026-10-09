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
import { hashPlanToken, newPlanToken, planSnapshot, restorePlan } from './planRepository.ts';
import type { PlanRepository, StoredPlan } from './planRepository.ts';
import { createOpenAIModelGateway } from './model/gateway.ts';
import type { ModelEnvironment } from './model/gateway.ts';
import { applyLiveAction,remainingContext,mergeRemaining } from './liveRepair.ts';
import type { LiveAction } from './liveRepair.ts';

export interface RunStore {
  save(run: any): void | Promise<void>;
  get(id: string): any | Promise<any>;
}
export interface ApiEnvironment extends ModelEnvironment {
  GOOGLE_MAPS_SERVER_KEY?: string;
  GOOGLE_MAPS_BROWSER_KEY?: string;
  GOOGLE_MAPS_MAP_ID?: string;
}
/** The Node preview and cloud deployment use this same API and planning pipeline. */
export function createApi(options: { env: ApiEnvironment; store: RunStore; build?: string; allowDiagnostics?: boolean; fetcher?: typeof fetch; now?: () => Date }) {
  const liveRuns = new Map<string, any>();
  // Production stores implement durable storage. Small injected test stores have isolated memory storage.
  const memoryPlans=new Map<string,StoredPlan>();
  const repository:PlanRepository='getPlan' in options.store?options.store as RunStore & PlanRepository:{getPlan:id=>memoryPlans.get(id)??null,insertPlan:r=>{memoryPlans.set(r.id,r);},updatePlan:(r,expected)=>{if(memoryPlans.get(r.id)?.revision!==expected)return false;memoryPlans.set(r.id,r);return true;}};
  const now = options.now ?? (() => new Date());
  const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
  const retainRun=async(run:any)=>{let saved=true;try{await options.store.save(durableRun(run));}catch{saved=false;}run.evidenceSaved=saved;if(options.allowDiagnostics){if(liveRuns.size>=20)liveRuns.delete(liveRuns.keys().next().value!);liveRuns.set(run.runId,run);}return saved;};
  const authorize=async(req:Request,id:unknown)=>{const token=req.headers.get('X-Plan-Key')??'';if(typeof id!=='string'||id.length>100||!/^[a-f0-9]{64}$/.test(token))throw new WorldError('Use the saved link to open this outing.',404);const record=await repository.getPlan(id);if(!record||record.tokenHash!==await hashPlanToken(token))throw new WorldError('This outing could not be found. Check your saved link.',404);return record;};
  const persist=async(plan:CurrentPlan,previous:StoredPlan|null)=>{
    if(previous&&plan.revision===previous.revision)return null;
    const token=previous?null:newPlanToken();
    const record:StoredPlan={id:plan.id,revision:plan.revision,tokenHash:previous?.tokenHash??await hashPlanToken(token!),snapshot:planSnapshot(plan),updatedAt:now().toISOString(),eventJson:JSON.stringify({type:previous?'updated':'created',previousRevision:previous?.revision??null,signals:plan.history.slice(-15),explicitExecution:plan.execution?.slice(-1)??[]})};
    if(previous){if(!await repository.updatePlan(record,previous.revision))throw new WorldError('This plan changed in another tab. Reopen your saved link before editing again.',409);}
    else await repository.insertPlan(record);
    return token;
  };
  return async function handleApi(req: Request): Promise<Response> {
    const path = new URL(req.url).pathname;
    const began=Date.now(),abort=new AbortController(),deadline=setTimeout(()=>abort.abort(),27000);
    const providerMetrics={calls:0,failedCalls:0,googleCalls:0,modelCalls:0};
    const observedFetch:typeof fetch=async(url,init)=>{providerMetrics.calls++;if(String(url).startsWith('https://api.openai.com/'))providerMetrics.modelCalls++;else providerMetrics.googleCalls++;try{const response=await(options.fetcher??fetch)(url,{...init,signal:init?.signal?AbortSignal.any([init.signal,abort.signal]):abort.signal});if(!response.ok)providerMetrics.failedCalls++;return response;}catch(error){providerMetrics.failedCalls++;throw error;}};
    try {
      if (req.method === 'GET' && path === '/api/world/config') return json({ provider: 'google', configured: !!options.env.GOOGLE_MAPS_SERVER_KEY, browserKey: options.env.GOOGLE_MAPS_BROWSER_KEY ?? '', mapId: options.env.GOOGLE_MAPS_MAP_ID ?? 'DEMO_MAP_ID' });
      if(req.method==='GET'&&path.startsWith('/api/plans/')) {
        const record=await authorize(req,path.slice('/api/plans/'.length));
        const world=createGoogleWorldProvider({key:options.env.GOOGLE_MAPS_SERVER_KEY??'',fetcher:observedFetch,now});
        const routing=createGoogleRouting({key:options.env.GOOGLE_MAPS_SERVER_KEY??'',fetcher:observedFetch});
        const currentPlan=await restorePlan(record,world,routing);
        return json({currentPlan,runId:currentPlan.runId});
      }
      if (req.method === 'GET' && path.startsWith('/api/runs/')) {
        if (!options.allowDiagnostics) return json({ error: 'Not found' }, 404);
        const id = path.slice(10), run = liveRuns.get(id) ?? await options.store.get(id);
        return json(run ?? { error: 'Run not found' }, run ? 200 : 404);
      }
      if (req.method !== 'POST' || !['/api/plans', '/api/plans/edit', '/api/plans/live', '/api/world/autocomplete', '/api/world/details', '/api/world/search', '/api/world/route'].includes(path)) return json({ error: 'Unknown endpoint' }, 404);
      const reader = req.body?.getReader();
      if (!reader) throw new WorldError('Send a valid request.', 400);
      let bytes = 0, body = '';
      const decoder = new TextDecoder();
      while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.byteLength; if (bytes > 250000) { await reader.cancel(); throw new WorldError('Request too large', 413); } body += decoder.decode(chunk.value, { stream: true }); }
      body += decoder.decode();
      let input: any;
      try { input = JSON.parse(body); } catch { throw new WorldError('Send a valid request.', 400); }
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new WorldError('Send a valid request.', 400);
      const world = createGoogleWorldProvider({ key: options.env.GOOGLE_MAPS_SERVER_KEY ?? '', fetcher: observedFetch, now });
      const routing = createGoogleRouting({ key: options.env.GOOGLE_MAPS_SERVER_KEY ?? '', fetcher: observedFetch });
      if (path === '/api/world/autocomplete') return json(await world.autocompleteLocation(input.query, input.bias, input.sessionToken));
      if (path === '/api/world/details') { if (typeof input.placeId !== 'string') throw new WorldError('Select a valid place.', 400); return json(await world.getPlaceDetails(input.placeId, input.sessionToken)); }
      if (path === '/api/world/search') return json(await world.searchPlaces(input));
      if (path === '/api/world/route') return json(await routing.getRouteEstimate(input.origin, input.destination, input.mode));
      if(path==='/api/plans/live') {
        const record=await authorize(req,input.planId);
        if(input.revision!==record.revision)throw new WorldError('This plan changed in another tab. Reopen your saved link before continuing.',409);
        if(!input.action||!['complete','skip','unavailable','late'].includes(input.action.kind))throw new WorldError('Choose an outing update.',400);
        const current=await restorePlan(record,world,routing);
        let repaired;try{repaired=await applyLiveAction(current,input.action as LiveAction,world,routing,now());}catch(e){throw new WorldError(e instanceof WorldError?e.message:e instanceof Error?e.message:'The update could not be applied.',409);}
        if(!repaired.changed)return json({currentPlan:current,runId:current.runId});
        const next=repaired.plan;next.runId=crypto.randomUUID();await persist(next,record);
        const evidenceSaved=await retainRun({runId:next.runId,timestamp:now().toISOString(),build:options.build??'cloud',request:next.request,result:next.result,currentPlan:next,parentRunId:current.runId,status:repaired.conflict?'repair-conflict':'complete',edit:{kind:'live',action:input.action},diagnostics:{metrics:{...providerMetrics,elapsedMs:Date.now()-began},conflicts:repaired.conflict?[repaired.conflict]:[],errorCodes:repaired.conflict?['LIVE_CONFLICT']:[]}});
        return json({currentPlan:next,runId:next.runId,conflict:repaired.conflict,evidenceSaved});
      }
      let current:CurrentPlan|null=null,edit:PlanEdit|null=null,prepared:ReturnType<typeof prepareEdit>|null=null,stored:StoredPlan|null=null;
      let remainder:ReturnType<typeof remainingContext>=null,canonicalRequest:CurrentPlan['request']|null=null;
      if(path==='/api/plans/edit') {
        if(!input.edit||!['keep','release','change','adjust','details'].includes(input.edit.kind))throw new WorldError('The current plan could not be read. Your choices are still here.',400);
        stored=await authorize(req,input.planId??input.currentPlan?.id);
        if((input.revision??input.currentPlan?.revision)!==stored.revision)throw new WorldError('This plan changed in another tab. Reopen your saved link before editing again.',409);
        current=await restorePlan(stored,world,routing);edit=input.edit as PlanEdit;
        if(['keep','release','change'].includes(edit.kind)&&typeof (edit as {placeId:string}).placeId!=='string')throw new WorldError('Choose the stop you want to edit.',400);
        if(edit.kind==='adjust'&&typeof edit.text!=='string')throw new WorldError('Describe the change you want.',400);
        if(edit.kind==='keep'||edit.kind==='release') {
          let next:CurrentPlan;try{next=keepDecision(current,edit.placeId,edit.kind==='release');}catch(e){throw new WorldError(e instanceof Error?e.message:'This stop could not be updated.',409);}
          if(next.revision===current.revision)return json({runId:current.runId,request:current.request,result:current.result,currentPlan:current});
          const run={runId:crypto.randomUUID(),timestamp:now().toISOString(),build:options.build??'cloud',request:next.request,status:'complete',result:next.result,currentPlan:next,parentRunId:current.runId,edit};next.runId=run.runId;
          await persist(next,stored);
          const evidenceSaved=await retainRun(run);
          return json({runId:run.runId,request:next.request,result:next.result,currentPlan:next,evidenceSaved});
        }
        try{prepared=prepareEdit(current,edit);}catch(e){const message=e instanceof Error?e.message:'This change could not be applied.';const runId=crypto.randomUUID();await retainRun({runId,timestamp:now().toISOString(),build:options.build??'cloud',request:current.request,status:'edit-conflict',currentPlan:current,parentRunId:current.runId,edit,diagnostics:{conflicts:[message],errorCodes:['EDIT_CONFLICT'],quality:[{lens:'INTENT_FIDELITY',passed:false,issues:[message]}]}});return json({error:message,runId},409);}
        try{remainder=remainingContext(current,prepared.request,prepared.retainedStops,now());}catch(e){throw new WorldError(e instanceof Error?e.message:'Future stops could not be updated.',409);}
        if(remainder){canonicalRequest=prepared.request;prepared.retainedStops=remainder.retainedStops;}
        input.draft=requestToDraft(remainder?.request??prepared.request);
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
        const timeValidation = validateRequest({ ...input.draft, startingLocation: request.startingLocation, startingPlace: request.startingPlace }, { requirePlaceSelections: true, notBefore: outingClock(request.timeZone, request.startingPlace, now()) });
        if (!timeValidation.ok) throw new WorldError(Object.values(timeValidation.errors)[0], 400);
        let retained=prepared?.retainedStops??[];
        if(edit?.kind==='details')retained=retained.filter(s=>!s.userStopId); // Edited/removed intake pieces are explicit human changes.
        if(retained.length){const refreshed=await world.resolveReferences(retained.map(s=>s.place.provider_place_id));retained=retained.map(s=>({...s,place:refreshed.get(s.place.provider_place_id)!}));}
        return createRealPlanner(world, routing, { clock: now,model:createOpenAIModelGateway(options.env,observedFetch) }).build(request,{retainedStops:retained,excludedIds:prepared?.excludedIds,surgical:prepared?.surgical,replacementRole:prepared?.replacementRole,currentPlan:current});
      })().catch(error=>({result:{status:'no-plan',primaryItinerary:null,message:error instanceof WorldError?error.message:'Place or travel information could not load. Your choices are still here. Please try again.'},diagnostics:{conflicts:['PROVIDER_OR_TIME_FAILURE'],errorCodes:['PROVIDER_OR_TIME_FAILURE'],quality:[{lens:'REAL_WORLD_ACCURACY',passed:false,issues:['Place, travel or current-time validation failed.']}]}}));
      const timeout = new Promise<any>(resolve => { timer = setTimeout(() => resolve({ result: { status: 'no-plan', primaryItinerary: null, message: 'Real place or travel information took too long to load. Your choices are saved. Please try again.' }, diagnostics: { normalizedRequest: structuredClone(request), conflicts: ['PROVIDER_TIMEOUT'],errorCodes:['PROVIDER_TIMEOUT'],quality:[{lens:'REAL_WORLD_ACCURACY',passed:false,issues:['Place or travel service timed out.']}], elapsedLimitMs: 27000 } }), 27000); });
      const planned = await Promise.race([boundedWork, timeout]).finally(() => clearTimeout(timer));
      planned.diagnostics.metrics={...providerMetrics,elapsedMs:Date.now()-began,planner:planned.diagnostics.reasoning?.status==='accepted'?'model-proposal':'deterministic',googleCostUsd:null,modelCostUsd:planned.diagnostics.reasoning?.estimatedCostUsd??null};
      if(remainder&&current&&planned.result.status==='complete')planned.result=mergeRemaining(current,planned.result.primaryItinerary,remainder);
      const submittedRequest=canonicalRequest??request;
      const parentId=current?.runId??input.parentRunId;
      const parentRunId = typeof parentId === 'string' && await options.store.get(parentId) ? parentId : null;
      const runId=crypto.randomUUID();
      const currentPlan=planned.result.status==='complete'?(current?{...current,revision:current.revision+1,liveAttention:undefined,runId,request:submittedRequest,result:planned.result,excludedPlaceIds:prepared!.excludedIds,history:[...prepared!.history,{at:now().toISOString(),type:'changed' as const,runId},...planned.result.primaryItinerary.stops.map((s:any)=>({at:now().toISOString(),type:'shown' as const,placeId:s.id,runId}))].slice(-500)}:makeCurrentPlan(runId,submittedRequest,planned.result)):current;
      const run = { runId, timestamp: now().toISOString(), build: options.build ?? 'cloud', request:submittedRequest, status: planned.result.status, result: planned.result, diagnostics: planned.diagnostics, parentRunId,currentPlan,edit };
      const planKey=currentPlan&&planned.result.status==='complete'?await persist(currentPlan,stored):null;
      const evidenceSaved=await retainRun(run);
      return json({ runId: run.runId, request:submittedRequest, result: planned.result, status: run.status,currentPlan,evidenceSaved,...(planKey?{planKey}:{}),conflict:current&&planned.result.status!=='complete'?planned.result.message:null });
    } catch (error) {
      if (error instanceof WorldError) return json({ error: error.message }, error.status);
      // Public responses never disclose credentials, provider payloads or internal diagnostics.
      return json({ error: 'The outing service is unavailable right now. Your choices are still here. Please try again.' }, 503);
    }finally{clearTimeout(deadline);abort.abort();}
  };
}
