import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpenAIModelGateway,validProposal,runtimePacket } from '../server/model/gateway.ts';
import type { ModelPacket, PlanProposal } from '../server/model/gateway.ts';
import { proposalIdentityErrors } from '../server/model/validateProposal.ts';
import { createRealPlanner } from '../server/realPlanner.ts';
import { normalizeGooglePlace } from '../server/googleProvider.ts';
import { candidateFromPlace } from '../src/planner/estimates.ts';
import { lightweightIntent } from '../src/planner/intent.ts';
import { schedule } from '../src/planner/schedule.ts';
import type { PlanningRequest } from '../src/planning/types.ts';
const raw=(id:string,type:string)=>({id,displayName:{text:'TEST model '+id},location:{latitude:33.82,longitude:-118.04},primaryType:type,types:[type],businessStatus:'OPERATIONAL',addressComponents:[{types:['country'],shortText:'US'}],regularOpeningHours:{periods:[{open:{day:0,hour:0}}]}});
const details=[raw('TEST_MODEL_FOOD','fast_food_restaurant'),raw('TEST_MODEL_BOWL','bowling_alley'),raw('TEST_MODEL_DESSERT','ice_cream_shop')].map(p=>normalizeGooglePlace(p));
const origin=normalizeGooglePlace(raw('TEST_MODEL_ORIGIN','locality')).place;
const request:PlanningRequest={startingPlace:origin,startingLocation:'TEST origin',date:'2026-10-10',availableStartTime:'16:00',requiredEndTime:'23:00',budgetPerPerson:{amountCents:4000,currency:'USD'},groupSize:5,transportation:'driving',vibeInterests:'dinner fun dessert',startingState:'nothing-planned',existingStops:[]};
const candidates=details.map(d=>{const c=candidateFromPlace(d.place);c.hoursChecked=true;c.openingInformation=d.opening_hours;return c;});
const routes={getMatrix:async(points:any[])=>({points,legs:points.map((_,i)=>points.map((__,j)=>({minutes:i===j?0:5,distanceMetres:i===j?0:1500,requestedMode:'driving' as const,actualMode:'driving' as const,source:'google-routes' as const})))}),getRouteEstimate:async()=>null};
async function packet():Promise<ModelPacket>{return{task:'create',input:{request,intent:lightweightIntent.normalize(request),start:960,desiredFinish:1380},candidates,matrix:await routes.getMatrix([origin,...candidates.map(c=>c.place)])};}
const proposal=(cs=candidates):PlanProposal=>({status:'plan',interpreted_intent:'An easy dinner and activity',stops:cs.map(c=>({place_id:c.id,experience_role:c.role,purpose:'A complementary part of the outing'})),preserved_place_ids:[],assumptions:[],changes:[],uncertainties:['Prices are estimates'],verification_needed:[],pacing_reason:'Space for conversation',budget_reason:'Per-person estimates',explanation:'One complete outing'});
const env={ROVELLE_MODEL_ENABLED:'true',ROVELLE_MODEL:'TEST_MODEL',OPENAI_API_KEY:'TEST_PRIVATE_KEY'};
test('disabled and unconfigured model never makes a paid request',async()=>{
 let calls=0;const fetcher:typeof fetch=async()=>{calls++;throw new Error('Must not call');};
 assert.equal((await createOpenAIModelGateway({...env,ROVELLE_MODEL_ENABLED:'false'},fetcher).propose(await packet())).metrics.status,'disabled');
 assert.equal((await createOpenAIModelGateway({...env,OPENAI_API_KEY:''},fetcher).propose(await packet())).metrics.status,'unavailable');assert.equal(calls,0);
});
test('Responses gateway sends compact constitution, strict schema, store false and only approved task context',async()=>{
 let sent:any;const result=await createOpenAIModelGateway({...env,ROVELLE_MODEL_INPUT_USD_PER_MILLION:'2',ROVELLE_MODEL_OUTPUT_USD_PER_MILLION:'4'},async(_url,init)=>{sent=JSON.parse(init!.body as string);return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(proposal())}]}],usage:{input_tokens:100,output_tokens:50}});}).propose(await packet());
 assert.equal(sent.store,false);assert.equal(sent.text.format.strict,true);assert.match(sent.instructions,/Planner Constitution v0.1/);assert.ok(!JSON.stringify(sent).includes('TEST_PRIVATE_KEY'));assert.ok(!sent.input.includes('Builder Context'));assert.ok(!sent.instructions.includes('Builder Context v0.7'));
 assert.equal(JSON.parse(sent.input).request.budget_per_person_cents,4000);assert.equal(result.metrics.calls,1);assert.equal(result.metrics.retries,0);assert.equal(result.metrics.estimatedCostUsd,.0004);assert.equal(result.metrics.status,'proposed');assert.ok(validProposal(result.proposal));
});
test('malformed JSON, extra fields, refusal, incomplete and network failure never become an accepted proposal',async()=>{
 for(const body of [{status:'completed',output:[{type:'message',content:[{type:'output_text',text:'not json'}]}]},{status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({...proposal(),invented:true})}]}]},{status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'No'}]}]},{status:'incomplete',output:[]}]){
 const result=await createOpenAIModelGateway(env,async()=>Response.json(body)).propose(await packet());assert.equal(result.proposal,null);assert.ok(['malformed','unavailable'].includes(result.metrics.status));assert.equal(result.metrics.calls,1);
 }
 const failed=await createOpenAIModelGateway(env,async()=>{throw new Error('TEST secret failure');}).propose(await packet());assert.equal(failed.proposal,null);assert.equal(failed.metrics.status,'unavailable');assert.ok(!JSON.stringify(failed).includes('TEST secret'));
});
test('software rejects fabricated/duplicate IDs, mismatched roles and missing mandatory places regardless of model claims',()=>{
 const bad=proposal();bad.stops.push({...bad.stops[0]});bad.stops[1].place_id='INVENTED';assert.ok(proposalIdentityErrors(bad,candidates).includes('UNKNOWN_PLACE'));assert.ok(proposalIdentityErrors(bad,candidates).includes('DUPLICATE_PLACE'));
 const fixed=candidates.map((c,i)=>({...c,userStopId:i===0?'user':null}));const missing=proposal(candidates.slice(1));missing.preserved_place_ids=[candidates[0].id];assert.ok(proposalIdentityErrors(missing,fixed).includes('MISSING_COMMITMENT'));
 const mismatch=proposal();mismatch.stops[0].experience_role='scenic-relax';assert.ok(proposalIdentityErrors(mismatch,candidates).includes('ROLE_MISMATCH'));
});
test('proposed sequence respects fixed arrival, closed hours, mapped travel and hard budget',async()=>{
 const p=await packet(),cs=structuredClone(candidates);cs[0].fixed=true;cs[0].fixedStart=19*60;cs[0].userStopId='fixed';cs[0].protection='USER_FIXED';
 const scheduled=schedule(p.input,cs,p.matrix,[cs[1].id,cs[0].id,cs[2].id]);assert.equal(scheduled.conflict,null);assert.equal(scheduled.stops.find(s=>s.candidate.id===cs[0].id)!.arrival,19*60);
 const cap={...p.input,intent:{...p.input.intent,hardCapCents:0,budgetPolicy:'hard-cap' as const}};assert.ok(schedule(cap,cs,p.matrix,cs.map(c=>c.id)).conflict);
 cs[0].place.provider_metadata.business_status='CLOSED_PERMANENTLY';assert.ok(schedule(p.input,cs,p.matrix,cs.map(c=>c.id)).conflict);
});
test('planner accepts validated model ordering; invalid proposal falls back visibly to independently validated rules',async()=>{
 const world={searchPlaces:async()=>({places:details.map(d=>d.place),warnings:[],context:null}),getPlaceDetailsMany:async(ids:string[])=>new Map(ids.map(id=>[id,{ok:true as const,details:details.find(d=>d.place.provider_place_id===id)!}])),getPlaceDetails:async(id:string)=>details.find(d=>d.place.provider_place_id===id)!};
 for(const invalid of [false,true]){
 const model={propose:async(p:ModelPacket)=>({proposal:invalid?{...proposal(),stops:[{place_id:'MADE_UP',experience_role:'meal',purpose:'bad'}]}:proposal(candidates.slice().reverse()),metrics:{provider:'openai' as const,model:'TEST',constitutionVersion:'0.1',status:'proposed' as const,calls:1,retries:0,latencyMs:1,inputTokens:100,outputTokens:50,estimatedCostUsd:null}})};
 const built=await createRealPlanner(world as any,routes,{model}).build(request);assert.equal(built.result.status,'complete');assert.equal(built.diagnostics.reasoning?.status,invalid?'rejected':'accepted');assert.ok(built.diagnostics.quality?.every(q=>q.passed));
 if(!invalid&&built.result.status==='complete')assert.deepEqual(built.result.primaryItinerary.stops.map(s=>s.id),candidates.slice().reverse().map(c=>c.id));
 }
});
test('model inference can choose a calm two-stop structure without maximizing a seven-hour window',async()=>{
 const p=await packet(),chosen=[candidates[0].id,candidates[2].id];const run=schedule(p.input,candidates,p.matrix,chosen);
 assert.equal(run.conflict,null);assert.deepEqual(run.stops.map(s=>s.candidate.id),chosen);assert.ok(run.stops.at(-1)!.departure<p.input.desiredFinish);
});
