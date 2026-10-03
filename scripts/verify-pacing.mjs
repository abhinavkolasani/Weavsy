import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { durableDraft } from '../src/world/durable.ts';
const base=process.env.OUTING_TEST_BASE_URL??'http://127.0.0.1:5174';
async function api(path,body){const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(32000)});const d=await r.json();if(!r.ok)throw new Error(d.error);return d;}
const suggestions=await api('/api/world/autocomplete',{query:'Los Angeles'});
const p=suggestions.find(p=>p.display_name==='Los Angeles');assert.ok(p);
const origin=(await api('/api/world/details',{placeId:p.provider_place_id})).place;
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const tomorrow=new Date(today+'T12:00:00Z');tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
const draft={timeZone:'America/Los_Angeles',startingLocation:origin.display_name,startingPlace:origin,date:tomorrow.toISOString().slice(0,10),availableStartTime:'13:00',requiredEndTime:'19:00',budgetPerPerson:'80',groupSize:'5',transportation:'driving',vibeInterests:'dinner and something fun',startingState:'nothing-planned',existingStops:[]};
const rows=[];
async function check(name,patch,expectedCount){const at=Date.now(),run=await api('/api/plans',{draft:{...draft,...patch}}),plan=run.result.primaryItinerary;const elapsedMs=Date.now()-at;assert.equal(run.status,'complete',run.result.message??name);assert.ok(elapsedMs<30000);if(expectedCount)assert.equal(plan.stops.length,expectedCount,name);assert.equal(run.request.budgetPerPerson.amountCents,Math.round(Number(patch.budgetPerPerson??'80')*100));const row={name,elapsedMs,runId:run.runId,status:run.status,request:durableDraft(run.request),stopCount:plan.stops.length,costPerPersonCents:plan.costPerPersonCents,finish:plan.finish,finishDayOffset:plan.finishDayOffset,stops:plan.stops.map(s=>({placeId:s.id,userStopId:s.userStopId,arrival:s.arrival,arrivalDayOffset:s.arrivalDayOffset,departure:s.departure,departureDayOffset:s.departureDayOffset,fixed:s.fixed,role:s.role}))};rows.push(row);console.log(JSON.stringify({name,elapsedMs,stopCount:row.stopCount,costPerPersonCents:row.costPerPersonCents,finish:row.finish,finishDayOffset:row.finishDayOffset}));return run;}
for(const [hours,count] of [[3,2],[4,3],[6,4],[8,5]])await check(`${hours}-hour-outing`,{requiredEndTime:String(13+hours).padStart(2,'0')+':00'},count);
const midnight=await check('midnight-finish',{availableStartTime:'20:00',requiredEndTime:'00:00',budgetPerPerson:'40'});assert.equal(midnight.request.endDayOffset,1);
// This ID was selected from live Google autocomplete, not invented by a fixture.
const dinner=(await api('/api/world/details',{placeId:'ChIJ46bPF3nPwoARoaAUfJqh_PY'})).place;
const fixed=await check('fixed-dinner-next-day',{availableStartTime:'20:00',requiredEndTime:'03:00',startingState:'reservation',existingStops:[{id:crypto.randomUUID(),name:dinner.display_name,place:dinner,entryKind:'place',fixed:true,startTime:'00:30',startDayOffset:1,timingDetail:'end-time',endTime:'01:30',endDayOffset:1,durationMinutes:'',note:'Keep this late dinner'}]});
const stop=fixed.result.primaryItinerary.stops.find(s=>s.fixed);assert.equal(stop.arrival,'00:30');assert.equal(stop.arrivalDayOffset,1);assert.equal(stop.departure,'01:30');assert.equal(stop.departureDayOffset,1);
mkdirSync('artifacts/overnight',{recursive:true});writeFileSync('artifacts/overnight/live-pacing-results.json',JSON.stringify(rows,null,2));
console.log('Live duration and overnight checks passed.');
