import test from 'node:test';
import assert from 'node:assert/strict';
import { localClock } from '../src/planning/clock.ts';
import { emptyDraft } from '../src/planning/draft.ts';
import { validateRequest } from '../src/planning/validate.ts';
const draft=()=>({...emptyDraft(),date:'2026-10-02',startingLocation:'Los Angeles',availableStartTime:'18:00',requiredEndTime:'23:00',budgetPerPerson:'40',groupSize:'5',transportation:'driving' as const,vibeInterests:'dinner'});
test('clock respects browser timezone and rounds forward so seconds do not permit a past start',()=>{
 const now=new Date('2026-10-03T00:43:35Z');assert.deepEqual(localClock('America/Los_Angeles',now),{date:'2026-10-02',time:'17:44',timeZone:'America/Los_Angeles'});
 assert.equal(localClock('Asia/Tokyo',now).date,'2026-10-03');assert.equal(localClock('Asia/Tokyo',now).time,'09:44');
 assert.equal(localClock('America/Los_Angeles',new Date('2026-10-03T00:43:00Z')).time,'17:43');
});
test('today cannot start in the past, tomorrow can use earlier hours, past dates cannot submit',()=>{
 const notBefore={date:'2026-10-02',time:'17:44'};
 assert(!validateRequest({...draft(),availableStartTime:'16:00'},{notBefore}).ok);
 assert(validateRequest({...draft(),availableStartTime:'17:44'},{notBefore}).ok);
 assert(validateRequest({...draft(),date:'2026-10-03',availableStartTime:'09:00'},{notBefore}).ok);
 assert(!validateRequest({...draft(),date:'2026-10-01'},{notBefore}).ok);
});
test('midnight and timezone validation are safe',()=>{
 assert.deepEqual(localClock('America/Los_Angeles',new Date('2026-10-03T06:59:59Z')),{date:'2026-10-03',time:'00:00',timeZone:'America/Los_Angeles'});
 assert.throws(()=>localClock('Invalid/TimeZone'));
});

test('origin offset keeps starts in the present across US time zones without changing a fixed time',async()=>{
  const {outingClock}=await import('../src/planning/clock.ts');
  const place={provider:'google',provider_metadata:{utc_offset_minutes:-240}};
  assert.equal(outingClock('America/Los_Angeles',place,new Date('2026-10-03T02:00:01Z')).time,'22:01');
  assert.equal(outingClock('America/Los_Angeles',place,new Date('2026-10-03T04:00:01Z')).date,'2026-10-03');
});
