import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDraft, newStop, changeStartingState, removeExistingStop } from '../src/planning/draft.ts';
import { validateRequest } from '../src/planning/validate.ts';
import { initialState, restoreState } from '../src/planning/state.ts';
import { createFounderMetadata } from '../src/founder/metadata.ts';
import { createResultShell } from '../src/planning/engine.ts';
import type { PlanningDraft } from '../src/planning/types.ts';
const validDraft = (): PlanningDraft => ({ ...emptyDraft(), startingLocation: 'Los Angeles', date: '2026-10-02', availableStartTime: '16:00', requiredEndTime: '22:00', budgetPerPerson: '75.50', groupSize: '2', transportation: 'walking', vibeInterests: 'Relaxed dinner and art' });

test('all eight inputs are preserved as structured fields', () => {
 const result=validateRequest(validDraft()); assert(result.ok);
 assert.deepEqual(result.request,{startingLocation:'Los Angeles',date:'2026-10-02',availableStartTime:'16:00',requiredEndTime:'22:00',budgetPerPerson:{amountCents:7550,currency:'USD'},groupSize:2,transportation:'walking',vibeInterests:'Relaxed dinner and art',startingState:'nothing-planned',existingStops:[]});
});
test('required values, negative budget, fractional/zero group and same-day timing are rejected', () => {
 assert(!validateRequest(emptyDraft()).ok);
 for (const patch of [{groupSize:'0'},{groupSize:'-1'},{groupSize:'1.5'},{budgetPerPerson:'-5'},{budgetPerPerson:''},{budgetPerPerson:'1.234'},{requiredEndTime:'15:00'},{requiredEndTime:'16:00'},{date:'2026-02-30'},{startingLocation:' '},{vibeInterests:' '}]) assert(!validateRequest({...validDraft(),...patch}).ok,JSON.stringify(patch));
 assert(validateRequest({...validDraft(),budgetPerPerson:'0'}).ok);
});
test('each of the five starting states submits, with unknown duration allowed', () => {
 for(const mode of ['nothing-planned','anchor','reservation','partial-plan','almost-complete'] as const){const d=changeStartingState(validDraft(),mode).draft; if(d.existingStops.length)d.existingStops[0]={...d.existingStops[0],name:'My dinner',startTime:mode==='reservation'?'19:00':''};const r=validateRequest(d);assert(r.ok,mode);assert.equal(r.request.startingState,mode);if(mode!=='nothing-planned')assert.equal(r.request.existingStops[0].durationMinutes,null)}
});
test('7 PM dinner remains fixed in request and after serialization/refresh', () => {
 const d=changeStartingState(validDraft(),'reservation').draft;d.existingStops[0]={...d.existingStops[0],name:'Fixed dinner',startTime:'19:00',note:'Keep this booking'};
 const r=validateRequest(d);assert(r.ok);const s=r.request.existingStops[0];assert.equal(s.fixed,true);assert.equal(s.startTime,'19:00');assert.equal(s.constraints.preservePlace,true);assert.equal(s.constraints.preserveStartTime,true);assert.equal(s.durationMinutes,null);
 const state={...initialState(),draft:d,screen:'results',submission:{request:r.request,result:createResultShell(),metadata:createFounderMetadata()}};
 const restored=restoreState(JSON.stringify(state));assert.equal(restored.screen,'results');assert.deepEqual(restored.submission?.request,r.request);
});
test('repeatable mixed fixed/flexible pieces preserve names, timing alternatives and notes', () => {
 const d={...validDraft(),startingState:'partial-plan' as const,existingStops:[{...newStop(true),name:'Dinner',startTime:'19:00',timingDetail:'end-time' as const,endTime:'20:30',note:'Window table'},{...newStop(),name:'Walk',timingDetail:'duration' as const,durationMinutes:'30'},{...newStop(),name:'Browse'}]};
 const r=validateRequest(d);assert(r.ok);assert.equal(r.request.existingStops.length,3);assert.equal(r.request.existingStops[0].endTime,'20:30');assert.equal(r.request.existingStops[1].durationMinutes,30);assert.equal(r.request.existingStops[1].fixed,false);assert.equal(r.request.existingStops[2].durationMinutes,null);
});
test('switching modes keeps fixed pieces and does not silently drop them for Nothing planned', () => {
 const d={...validDraft(),startingState:'partial-plan' as const,existingStops:[{...newStop(true),name:'Dinner',startTime:'19:00'}]};
 const next=changeStartingState(d,'almost-complete');assert.deepEqual(next.draft.existingStops,d.existingStops);
 const blank=changeStartingState(next.draft,'nothing-planned');assert(blank.error);assert.deepEqual(blank.draft.existingStops,d.existingStops);
});
test('reservation requires a time; known fixed timing must fit the outing', () => {
 const d=changeStartingState(validDraft(),'reservation').draft;d.existingStops[0].name='Dinner';assert(!validateRequest(d).ok);
 for(const startTime of ['15:00','22:00'])assert(!validateRequest({...d,existingStops:[{...d.existingStops[0],startTime}]}).ok);
 assert(!validateRequest({...d,existingStops:[{...d.existingStops[0],startTime:'19:00',timingDetail:'duration',durationMinutes:'240'}]}).ok);
 assert(!validateRequest({...d,existingStops:[{...d.existingStops[0],startTime:'19:00',timingDetail:'end-time',endTime:'18:00'}]}).ok);
});
test('submitted snapshot stays separate from later draft edits', () => {
 const d=validDraft(),r=validateRequest(d);assert(r.ok);d.startingLocation='Changed draft';assert.equal(r.request.startingLocation,'Los Angeles');
 const restored=restoreState(JSON.stringify({...initialState(),draft:d,submission:{request:r.request,result:createResultShell(),metadata:createFounderMetadata()}}));assert.equal(restored.draft.startingLocation,'Changed draft');assert.equal(restored.submission?.request.startingLocation,'Los Angeles');
});
test('bad, missing, or old tab state safely starts a fresh form', () => {
 for(const raw of [null,'','broken','null','{}','{"version":2}',JSON.stringify({version:1,draft:[],screen:'results'})])assert.deepEqual(restoreState(raw),initialState());
 const restored=restoreState(JSON.stringify({...initialState(),draft:validDraft(),screen:'results',submission:{request:{existingStops:[null]},metadata:{},result:{}}}));assert.equal(restored.screen,'form');assert.equal(restored.draft.startingLocation,'Los Angeles');
});
test('result shell honestly contains no generated itinerary',()=>assert.deepEqual(createResultShell(),{status:'not-generated',primaryItinerary:null}));

test('removing a first anchor retains remaining pieces and their required fixed status', () => {
 const first={...newStop(true),name:'First anchor'};
 const second={...newStop(),name:'Second piece'};
 const d={...validDraft(),startingState:'anchor' as const,existingStops:[first,second]};
 const next=removeExistingStop(d,first.id);assert.equal(next.existingStops.length,1);assert.equal(next.existingStops[0].id,second.id);assert.equal(next.existingStops[0].fixed,true);assert(validateRequest(next).ok);
 const empty=removeExistingStop(next,second.id);assert.equal(empty.existingStops.length,0);assert.equal(changeStartingState(empty,'nothing-planned').error,undefined);
});
