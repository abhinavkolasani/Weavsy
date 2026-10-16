import type { CandidatePlace, OpenWindow, PlannerInput, Rejection, ScheduledStop } from './types.ts';
import type { RouteMatrix } from '../routing/types.ts';
import { WEEKDAYS } from '../world/types.ts';
import { toMinutes } from '../planning/validate.ts';
import { addDays } from '../planning/timeline.ts';
import { suggestedStopCount } from './pacing.ts';
import { roleFamily, qualifyPlace } from './qualification.ts';

export function fixedTime(candidate:CandidatePlace) {return candidate.fixedStart ?? (candidate.fixedEnd!==null?candidate.fixedEnd-candidate.duration.value:null);}
export function findWindows(input:PlannerInput, existing:CandidatePlace[]):OpenWindow[] {
  const fixed=existing.filter(c=>fixedTime(c)!==null).sort((a,b)=>fixedTime(a)!-fixedTime(b)!);
  const windows:OpenWindow[]=[];let cursor=input.start,after:string|null=null;
  for(const stop of fixed){const at=fixedTime(stop)!;if(at>cursor)windows.push({start:cursor,end:at,beforeStopId:stop.userStopId,afterStopId:after,travelAccountedDuringScheduling:true});cursor=Math.max(cursor,stop.fixedEnd??at+stop.duration.value);after=stop.userStopId;}
  if(cursor<input.desiredFinish)windows.push({start:cursor,end:input.desiredFinish,beforeStopId:null,afterStopId:after,travelAccountedDuringScheduling:true});
  return windows;
}
export function fixedConflicts(input:PlannerInput, existing:CandidatePlace[]):string[] {
  const fixed=existing.filter(c=>fixedTime(c)!==null).sort((a,b)=>fixedTime(a)!-fixedTime(b)!);
  const conflicts:string[]=[];let end=input.start;
  for(const c of fixed){const at=fixedTime(c)!;if(at<end)conflicts.push(`${c.place.display_name} is fixed before you can finish the previous commitment. Its time has not been moved.`);end=c.fixedEnd??at+c.duration.value;if(end>input.start+1440)conflicts.push(`${c.place.display_name} extends beyond a single overnight outing. Its time has not been moved.`);}
  return conflicts;
}
function intervals(candidate:CandidatePlace,date:string) {
  const windows:{start:number;end:number}[]=[];
  for(let offset=0;offset<=1;offset++) {
    const current=addDays(date,offset),day=(new Date(`${current}T12:00:00Z`).getUTCDay()+6)%7;
    const hours=candidate.openingInformation?.dated?.[current] ?? candidate.openingInformation?.weekly?.[WEEKDAYS[day]] ?? null;
    for(const h of hours??[{opens:'00:00',closes:'24:00'}])windows.push({start:offset*1440+toMinutes(h.opens),end:offset*1440+toMinutes(h.closes)});
  }
  const merged:{start:number;end:number}[]=[];
  for(const w of windows.sort((a,b)=>a.start-b.start)){const last=merged.at(-1);if(last&&w.start<=last.end)last.end=Math.max(last.end,w.end);else merged.push({...w});}
  return merged;
}
export function openingStatus(candidate:CandidatePlace,date:string,start:number,end:number):NonNullable<CandidatePlace['hoursStatus']> {
  if(candidate.place.provider_metadata.business_status?.startsWith('CLOSED'))return 'CLOSED_CONFIRMED';
  const hasDay=(offset:number)=>{const d=addDays(date,offset),weekday=WEEKDAYS[(new Date(d+'T12:00:00Z').getUTCDay()+6)%7];return candidate.openingInformation?.dated?.[d]!==undefined||candidate.openingInformation?.weekly?.[weekday]!==undefined;};
  if(!hasDay(Math.floor(start/1440))&&!hasDay(Math.floor((end-1)/1440)))return 'HOURS_UNKNOWN';
  if(!isOpen(candidate,date,start,end))return 'CLOSED_CONFIRMED';
  return hasDay(Math.floor(start/1440))&&hasDay(Math.floor((end-1)/1440))?'OPEN_CONFIRMED':'HOURS_PARTIAL';
}
export function isOpen(candidate:CandidatePlace,date:string,start:number,end:number) {
  const hours=intervals(candidate,date);
  return hours.some(h=>h.start<=start&&h.end>=end);
}
export function hasOpeningWindow(candidate:CandidatePlace,date:string,start:number,end:number) {
  const hours=intervals(candidate,date);
  return hours.some(h=>Math.max(start,h.start)+candidate.duration.value<=Math.min(end,h.end));
}
function nextOpen(candidate:CandidatePlace,date:string,arrival:number):number|null {
  const hours=intervals(candidate,date);
  for(const h of hours) {const start=Math.max(arrival,h.start);if(start+candidate.duration.value<=h.end)return start;}
  return null;
}
export function scoreCandidate(input:PlannerInput,candidate:CandidatePlace) {
  const target=input.request.budgetPerPerson.amountCents;
  const factors={vibe:candidate.vibeTags.includes(input.intent.mood)?12:input.intent.mood==='playful'&&candidate.vibeTags.includes('fun')?12:0,interests:input.intent.interests.filter(t=>candidate.interestTags.includes(t)).length*6,role:input.intent.desiredRoles.includes(candidate.role)?20:0,budget:Math.max(-20,8-Math.max(0,candidate.cost.value-target*.7)/200),category:candidate.category==='Restaurant'&&target>=4500?12:candidate.category==='Casual food'&&target<3000?8:['Active activity','Bowling'].includes(candidate.category)&&input.intent.mood==='active'?30:0,identity:candidate.userStopId?40:0,uncertainty:candidate.hoursChecked&&candidate.openingInformation?.weekly?2:0};
  return {factors,total:Object.values(factors).reduce((sum,v)=>sum+v,0)};
}
export interface ScheduleResult { stops:ScheduledStop[]; rejected:Rejection[]; conflict:string|null }
/** Bounded beam search over mandatory pieces + a small candidate universe. No provider ranking shortcut. */
export function schedule(input:PlannerInput,candidates:CandidatePlace[],matrix:RouteMatrix,sequence?:string[]):ScheduleResult {
  const rejected=new Map<string,Rejection>();
  const reject=(c:CandidatePlace,code:string,detail:string)=>rejected.set(`${c.id}:${code}`,{placeId:c.id,code,detail});
  const mandatory=candidates.filter(c=>c.userStopId);
  const fixed=mandatory.filter(c=>fixedTime(c)!==null).sort((a,b)=>fixedTime(a)!-fixedTime(b)!);
  const targetStops=sequence?.length??(input.replacementRole?mandatory.length+1:Math.max(mandatory.length,Math.min(6,Math.max(input.intent.desiredRoles.length,suggestedStopCount(input.desiredFinish-input.start)))));
  const maxStops=targetStops;
  const fixedFinish=Math.max(input.desiredFinish,...fixed.map(c=>(c.fixedEnd??fixedTime(c)!+c.duration.value)));
  const limit=Math.min(input.start+1440,input.intent.finishPolicy==='hard'?input.desiredFinish:fixedFinish+15);
  const target=input.request.budgetPerPerson.amountCents;
  const cap=input.intent.hardCapCents;
  const baseline=mandatory.reduce((s,c)=>s+c.cost.value,0);
  // A protected expensive anchor isn't removed to meet a soft budget. Extras remain restrained.
  const severeLimit=Math.max(baseline,target===0?0:target*1.65+500);
  const desired=input.intent.desiredRoles.slice(0,6);
  const covered=(role:string,stops:ScheduledStop[])=>stops.some(s=>s.candidate.role===role||(role==='walk-explore'&&s.candidate.role==='scenic-relax'));
  const anchored=(stops:ScheduledStop[])=>(input.intent.experienceAnchors??[]).every(a=>stops.some(s=>s.candidate.role===a.role&&qualifyPlace(s.candidate.place,a.search).accepted))&&(!input.replacementRole||stops.some(s=>!s.candidate.userStopId&&s.candidate.role===input.replacementRole));
  type State={stops:ScheduledStop[];cursor:number;previous:number;cost:number;score:number};
  let beam:State[]=[{stops:[],cursor:input.start,previous:0,cost:0,score:0}];
  let best:State|null=null,bestValue=-Infinity,mandatoryOnly:State|null=null;
  const quality=(s:State)=>s.score-Math.max(0,s.cost-target)/100*1.5-s.stops.length*8-Math.abs(s.stops.length-targetStops)*12+desired.filter(r=>covered(r,s.stops)).length*35;
  for(let depth=0;depth<maxStops;depth++) {
    const next:State[]=[];
    for(const state of beam) {
      const used=new Set(state.stops.map(s=>s.candidate.id));
      const nextFixed=fixed.find(c=>!used.has(c.id));
      for(let i=0;i<candidates.length;i++) {
        const c=candidates[i];if(used.has(c.id)||sequence&&c.id!==sequence[depth])continue;
        if(c.qualification&&!c.qualification.accepted){reject(c,c.qualification.reason??'LOW_PLACE_CONFIDENCE',c.qualification.detail);continue;}
        if(c.place.provider_metadata.business_status?.startsWith('CLOSED')){reject(c,'CLOSED_BUSINESS','Provider reports a closed business.');continue;}
        if(!c.userStopId&&input.replacementRole&&c.role!==input.replacementRole)continue;
        if(!sequence&&!c.userStopId&&!(input.intent.repeatRoles??[]).includes(c.role)&&mandatory.some(p=>p.role===c.role)){reject(c,'DUPLICATE_ROLE','An existing choice already serves this role.');continue;}
        if(fixedTime(c)!==null&&nextFixed?.id!==c.id)continue;
        if(!sequence&&!c.userStopId&&!(input.intent.repeatRoles??[]).includes(c.role)&&state.stops.some(s=>roleFamily(s.candidate.role)===roleFamily(c.role))){reject(c,'DUPLICATE_ROLE','An existing stop already serves this experience family.');continue;}
        if(!c.userStopId&&input.intent.dinnerFirst&&!state.stops.length&&c.role!=='meal'){reject(c,'REQUESTED_SEQUENCE','You asked for the meal first.');continue;}
        const travel=matrix.legs[state.previous]?.[i+1];
        if(!travel){reject(c,'TRANSPORT_MISMATCH','No usable route for the selected mode.');continue;}
        const maxJourney=input.request.transportation==='driving'?(input.intent.lessDriving?20:35):30;
        if(!sequence&&!c.userStopId&&travel.minutes>maxJourney){reject(c,'TOO_FAR','Journey is too long for a compact outing.');continue;}
        const buffer=travel.distanceMetres===0?0:travel.actualMode==='driving'?10:5;
        const ready=state.cursor+travel.minutes+buffer;
        let arrival:number;
        const fixedAt=fixedTime(c);
        if(fixedAt!==null) {if(ready>fixedAt){reject(c,'IMPOSSIBLE_BEFORE_FIXED_STOP','Route and transition do not fit the fixed arrival.');continue;}arrival=fixedAt;}
        else {
          const open=nextOpen(c,input.request.date,Math.ceil(ready/5)*5);
          if(open===null){reject(c,'CLOSED','Known hours do not fit this visit.');continue;}
          arrival=open;
        }
        const departure=c.fixedEnd??arrival+c.duration.value;
        if(departure<=arrival||departure>limit){reject(c,'INSUFFICIENT_TIME','Visit would finish outside the useful wrap-up window.');continue;}
        if(!isOpen(c,input.request.date,arrival,departure)){reject(c,'CLOSED','Known hours do not cover the visit.');continue;}
        if(input.request.returnToStart){const back=matrix.legs[i+1]?.[0];if(!back||departure+back.minutes+(back.distanceMetres?10:0)>input.desiredFinish){reject(c,'HOME_BY_CONFLICT','Visit and the journey back miss your required finish.');continue;}}
        if(fixedAt===null&&nextFixed) {
          const fixedIndex=candidates.indexOf(nextFixed)+1,leg=matrix.legs[i+1]?.[fixedIndex];
          if(!leg || departure+leg.minutes+(leg.distanceMetres===0?0:leg.actualMode==='driving'?10:5)>fixedTime(nextFixed)!){reject(c,'IMPOSSIBLE_BEFORE_FIXED_STOP','Visit would make the next fixed commitment unreachable.');continue;}
        }
        const cost=state.cost+c.cost.value;
        const remainingCommitments=mandatory.filter(m=>!used.has(m.id)&&m.id!==c.id).reduce((sum,m)=>sum+m.cost.value,0);
        if(!sequence&&!c.userStopId&&!desired.includes(c.role)&&cost+remainingCommitments>Math.max(baseline,target)){reject(c,'EXTRA_BUDGET_MISMATCH','An added break would use budget reserved for the outing.');continue;}
        if(cap!==null&&cost>cap){reject(c,'HARD_BUDGET_CAP','Estimated spend exceeds the explicitly stated cap.');continue;}
        if(!sequence&&!c.userStopId&&cost>severeLimit){reject(c,'SEVERE_BUDGET_MISMATCH','Estimated spend would substantially exceed the target.');continue;}
        const wait=Math.max(0,arrival-ready);
        const timingPreference=c.preferredStart!==null&&fixedAt===null?Math.abs(arrival-c.preferredStart)*.025:0;
        const localMinute=arrival%1440;
        const outdoorLate=c.vibeTags.includes('outdoors')&&(localMinute>=19*60||localMinute<6*60)?14:0;
        const dessertBeforeMeal=!c.userStopId&&c.role==='dessert'&&!covered('meal',state.stops)&&(desired.includes('meal')||mandatory.some(m=>m.role==='meal'))?30:0;
        const previous=state.stops.at(-1)?.candidate;
        const progression=previous?.role==='meal'&&['dessert','scenic-relax','walk-explore'].includes(c.role)?8:c.role==='meal'&&localMinute>=17*60&&localMinute<=21*60?6:0;
        const score=scoreCandidate(input,c).total-travel.minutes*(input.intent.lessDriving?2:.65)-wait*.15-timingPreference-outdoorLate-dessertBeforeMeal+progression+(c.protection==='PLANNER_FLEXIBLE'&&c.userStopId?8:0);
        const stop:ScheduledStop={candidate:c,arrival,departure,travel,bufferMinutes:buffer,waitMinutes:wait,score};
        const ns:State={stops:[...state.stops,stop],cursor:departure,previous:i+1,cost,score:state.score+score};next.push(ns);
        const extrasOverBudget=!sequence&&cost>Math.max(baseline,target)&&ns.stops.some(s=>!s.candidate.userStopId&&!desired.includes(s.candidate.role)&&s.candidate.cost.value>0);
        const sequenceComplete=!sequence||ns.stops.length===sequence.length;
        if(sequenceComplete&&!extrasOverBudget&&anchored(ns.stops)&&mandatory.every(m=>ns.stops.some(s=>s.candidate.id===m.id))&&(!mandatoryOnly||quality(ns)>quality(mandatoryOnly)))mandatoryOnly=ns;
        if(sequenceComplete&&!extrasOverBudget&&anchored(ns.stops)&&mandatory.every(m=>ns.stops.some(s=>s.candidate.id===m.id))&&(sequence||desired.every(r=>covered(r,ns.stops)))) {
          const value=quality(ns);if(value>bestValue){best=ns;bestValue=value;}
        }
      }
    }
    beam=next.sort((a,b)=>quality(b)-quality(a)).slice(0,64);
    if(!beam.length)break;
  }
  // If the user's pieces already form a complete outing, no extra stop is required.
  if(!best&&mandatoryOnly&&(mandatory.length||(input.intent.requiredRoles??desired).every(r=>covered(r,mandatoryOnly!.stops)))) {
    best=mandatoryOnly;
  }
  return {stops:best?.stops??[],rejected:[...rejected.values()],conflict:best?null:cap!==null&&baseline>cap?'Your protected stops already exceed the budget cap in estimates. Keep those stops or change the cap?':mandatory.some(c=>c.protection==='USER_KEPT')?'You asked me to keep '+mandatory.filter(c=>c.protection==='USER_KEPT').map(c=>c.place.display_name).join(' and ')+', but the new timing, travel or budget constraints leave too little room. I tried moving flexible times. Keep the new constraint or explicitly release a kept place?':mandatory.length?'I couldn’t connect your protected places and times inside these constraints. They have not been changed. Try a longer window or explicitly change one commitment.':'I couldn’t fit the requested experiences into this window with usable places and travel. Try a longer window or adjust one interest.'};
}
