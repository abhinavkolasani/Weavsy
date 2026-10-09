import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { createStore } from '../server/store.mjs';
import { createApi } from '../server/api.ts';
import { emptyDraft,newStop } from '../src/planning/draft.ts';
import { normalizeGooglePlace } from '../server/googleProvider.ts';

import {fixture,apiRequest} from './helpers/plannerFixture.ts';

test('plan reopens after a real SQLite restart with the same ID, fixed time, notes and person budget',async()=>{
 const dir=mkdtempSync(tmpdir()+'/rovelle-save-');let store=createStore(dir+'/plans.sqlite');const f=fixture();
 try{let api=createApi({store,env:{GOOGLE_MAPS_SERVER_KEY:'TEST'},fetcher:f.fetcher,now:f.now});const first=await(await api(apiRequest('/api/plans',{draft:f.draft}))).json();assert.equal(first.status,'complete');assert.match(first.planKey,/^[a-f0-9]{64}$/);
 store.close();store=createStore(dir+'/plans.sqlite');api=createApi({store,env:{GOOGLE_MAPS_SERVER_KEY:'TEST'},fetcher:f.fetcher,now:f.now});
 const response=await api(apiRequest('/api/plans/'+first.currentPlan.id,undefined,first.planKey));assert.equal(response.status,200);const reopened=(await response.json()).currentPlan;
 assert.equal(reopened.id,first.currentPlan.id);assert.equal(reopened.revision,1);assert.equal(reopened.request.budgetPerPerson.amountCents,4000);assert.equal(reopened.request.groupSize,5);assert.equal(reopened.request.existingStops[0].note,'Keep this exact dinner');
 const fixed=reopened.result.primaryItinerary.stops.find((s:any)=>s.id==='TEST_SAVE_FOOD');assert.equal(fixed.arrival,'19:00');assert.equal(fixed.departure,'19:45');assert.equal(fixed.exactTime,true);
 assert.equal(fixed.reason,first.result.primaryItinerary.stops.find((s:any)=>s.id===fixed.id).reason);assert.equal(fixed.hoursStatus,'OPEN_CONFIRMED');
 const db=new DatabaseSync(dir+'/plans.sqlite');const rows=JSON.stringify(db.prepare('SELECT * FROM saved_plans').all());assert.ok(!rows.includes('TEST private provider address'));assert.ok(!rows.includes('TEST stored'));assert.ok(!rows.includes('latitude'));assert.ok(!rows.includes(first.planKey));db.close();
 }finally{store.close();rmSync(dir,{recursive:true});}
});
test('server rejects missing/wrong capability, stale edits, and ignores tampered client current state',async()=>{
 const store=createStore(':memory:'),f=fixture(),api=createApi({store,env:{GOOGLE_MAPS_SERVER_KEY:'TEST'},fetcher:f.fetcher,now:f.now});try{
 const first=await(await api(apiRequest('/api/plans',{draft:f.draft}))).json(),id=first.currentPlan.id,key=first.planKey;
 const calls=f.calls;assert.equal((await api(apiRequest('/api/plans/'+id))).status,404);assert.equal((await api(apiRequest('/api/plans/'+id,undefined,'a'.repeat(64)))).status,404);assert.equal(f.calls,calls);
 const stop=first.currentPlan.result.primaryItinerary.stops.find((s:any)=>!s.fixed);
 const tampered=structuredClone(first.currentPlan);tampered.request.budgetPerPerson.amountCents=1;tampered.result.primaryItinerary.stops=[];
 const kept=await(await api(apiRequest('/api/plans/edit',{currentPlan:tampered,edit:{kind:'keep',placeId:stop.id}},key))).json();assert.equal(kept.currentPlan.request.budgetPerPerson.amountCents,4000);assert.equal(kept.currentPlan.revision,2);assert.equal(kept.currentPlan.id,id);
 assert.equal((await api(apiRequest('/api/plans/edit',{planId:id,revision:1,edit:{kind:'release',placeId:stop.id}},key))).status,409);
 const failed=await api(apiRequest('/api/plans/edit',{planId:id,revision:2,edit:{kind:'change',placeId:stop.id}},key));assert.equal(failed.status,409);assert.equal(store.getPlan(id).revision,2);
 }finally{store.close();}
});
test('reopen provider failure preserves saved state and later recovery does not create a new version',async()=>{
 const store=createStore(':memory:'),f=fixture(),api=createApi({store,env:{GOOGLE_MAPS_SERVER_KEY:'TEST'},fetcher:f.fetcher,now:f.now});try{
 const first=await(await api(apiRequest('/api/plans',{draft:f.draft}))).json();const before=store.getPlan(first.currentPlan.id);f.fail=true;
 assert.equal((await api(apiRequest('/api/plans/'+before.id,undefined,first.planKey))).status,503);assert.deepEqual(store.getPlan(before.id),before);
 f.fail=false;assert.equal((await api(apiRequest('/api/plans/'+before.id,undefined,first.planKey))).status,200);assert.equal(store.getPlan(before.id).revision,1);
 }finally{store.close();}
});
test('atomic revision update archives one version and refuses a competing stale update',()=>{
 const store=createStore(':memory:');try{const r={id:'TEST_PLAN',revision:1,tokenHash:'TEST_HASH',snapshot:'{}',updatedAt:'2026-10-09T12:00:00Z'};store.insertPlan(r);assert.equal(store.updatePlan({...r,revision:2,snapshot:'{"accepted":true}'},1),true);assert.equal(store.updatePlan({...r,revision:2,snapshot:'{"overwritten":true}'},1),false);assert.equal(store.getPlan(r.id).snapshot,'{"accepted":true}');}finally{store.close();}
});
test('failure to save supplemental run metrics cannot falsely report that a durably saved plan failed',async()=>{
 const real=createStore(':memory:'),f=fixture();const store={...real,save:()=>{throw new Error('TEST audit write failure');}};
 const api=createApi({store,env:{GOOGLE_MAPS_SERVER_KEY:'TEST'},fetcher:f.fetcher,now:f.now});try{
 const response=await api(apiRequest('/api/plans',{draft:f.draft}));assert.equal(response.status,200);const data=await response.json();assert.equal(data.status,'complete');assert.equal(data.evidenceSaved,false);assert.ok(real.getPlan(data.currentPlan.id));assert.match(data.planKey,/^[a-f0-9]{64}$/);
 }finally{real.close();}
});

test('reopen after skipping a flexible stop preserves history and excludes it from costs and travel',async()=>{
 const store=createStore(':memory:'),f=fixture();let api=createApi({store,env:{GOOGLE_MAPS_SERVER_KEY:'TEST'},fetcher:f.fetcher,now:f.now});
 try{
  const created=await(await api(apiRequest('/api/plans',{draft:f.draft}))).json();
  const target=created.currentPlan.result.primaryItinerary.stops.find((s:any)=>s.protection==='PLANNER_FLEXIBLE');assert.ok(target);
  const response=await api(apiRequest('/api/plans/live',{planId:created.currentPlan.id,revision:1,action:{kind:'skip',placeId:target.id}},created.planKey));
  assert.equal(response.status,200);const skipped=(await response.json()).currentPlan;
  const expected=skipped.result.primaryItinerary;
  api=createApi({store,env:{GOOGLE_MAPS_SERVER_KEY:'TEST'},fetcher:f.fetcher,now:f.now});
  const reopenedResponse=await api(apiRequest('/api/plans/'+skipped.id,undefined,created.planKey));assert.equal(reopenedResponse.status,200);
  const reopened=(await reopenedResponse.json()).currentPlan,itinerary=reopened.result.primaryItinerary;
  assert.deepEqual(reopened.execution,skipped.execution);assert.equal(reopened.revision,2);
  assert.equal(itinerary.costPerPersonCents,expected.costPerPersonCents);assert.deepEqual(itinerary.costRangeCents,expected.costRangeCents);
  assert.equal(itinerary.travelMinutes,expected.travelMinutes);assert.equal(itinerary.hasUnknownCosts,expected.hasUnknownCosts);assert.deepEqual(itinerary.sharedCosts,expected.sharedCosts);
  assert.ok(itinerary.stops.some((s:any)=>s.id===target.id));
  assert.equal(itinerary.costPerPersonCents,itinerary.stops.filter((s:any)=>s.id!==target.id).reduce((sum:number,s:any)=>sum+s.cost.value,0));
 }finally{store.close();}
});
