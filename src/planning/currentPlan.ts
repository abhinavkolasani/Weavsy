import type { PlanningRequest } from './types.ts';
import type { RealPlanResult, OutingStop } from '../itinerary/realPlan.ts';
import { isRealPlanResult } from '../itinerary/realPlan.ts';
import { outingWindow, timelineClock, addDays } from './timeline.ts';
import { parseTypedTime } from './displayTime.ts';
import type { ExperienceRole } from '../planner/types.ts';
export interface PlanSignal { at:string;type:'shown'|'considered'|'selected'|'kept'|'changed'|'rejected'|'restored'|'adjusted'|'conflict';placeId?:string;request?:string;runId?:string }
export interface ExecutionEvent { at:string;type:'completed'|'skipped'|'unavailable'|'late';placeId?:string;minutes?:number }
export interface CurrentPlan { version:1;id:string;revision:number;runId:string;request:PlanningRequest;result:Extract<RealPlanResult,{status:'complete'}>;history:PlanSignal[];excludedPlaceIds:string[];execution?:ExecutionEvent[];liveAttention?:'constraint-conflict' }
export type PlanEdit={kind:'keep'|'release'|'change';placeId:string}|{kind:'adjust';text:string}|{kind:'details';request:PlanningRequest};
export function makeCurrentPlan(runId:string,request:PlanningRequest,result:Extract<RealPlanResult,{status:'complete'}>):CurrentPlan {return {version:1,id:crypto.randomUUID(),revision:1,runId,request:structuredClone(request),result:structuredClone(result),history:result.primaryItinerary.stops.map(s=>({at:new Date().toISOString(),type:'shown',placeId:s.id,runId})),excludedPlaceIds:[]};}
export function isCurrentPlan(v:any):v is CurrentPlan{return !!v&&v.version===1&&typeof v.id==='string'&&Number.isInteger(v.revision)&&v.revision>0&&typeof v.runId==='string'&&!!v.request&&isRealPlanResult(v.result)&&v.result.status==='complete'&&Array.isArray(v.history)&&v.history.length<=500&&v.history.every((h:any)=>h&&typeof h.at==='string'&&typeof h.type==='string')&&Array.isArray(v.excludedPlaceIds)&&v.excludedPlaceIds.length<=100&&v.excludedPlaceIds.every((x:any)=>typeof x==='string')&&(v.execution===undefined||Array.isArray(v.execution)&&v.execution.every((e:any)=>e&&typeof e.at==='string'&&['completed','skipped','unavailable','late'].includes(e.type)&&(e.type==='late'?Number.isInteger(e.minutes)&&e.minutes>=0&&e.minutes<=240:typeof e.placeId==='string')))&&v.result.primaryItinerary.stops.length<=20;}
export function protection(stop:OutingStop) {return stop.protection??(stop.fixed?'USER_FIXED':stop.userStopId?'USER_PLACE':'PLANNER_FLEXIBLE');}
export function canChange(stop:OutingStop) {return protection(stop)==='PLANNER_FLEXIBLE'||protection(stop)==='EXPERIENCE_ANCHOR';}
export function executionFinished(plan:CurrentPlan,id:string) {return (plan.execution??[]).some(e=>e.placeId===id&&['completed','skipped','unavailable'].includes(e.type));}
export function keepDecision(plan:CurrentPlan,id:string,release=false):CurrentPlan {
  const next=structuredClone(plan),stop=next.result.primaryItinerary.stops.find(s=>s.id===id);
  if(!stop)throw new Error('This stop is no longer in the current plan.');
  if(executionFinished(plan,id))throw new Error('Completed or skipped history cannot be rewritten.');
  if(release&&protection(stop)!=='USER_KEPT')throw new Error('Only a place you kept here can be released here.');
  if(!release&&!canChange(stop)&&protection(stop)!=='USER_KEPT')return next;
  stop.protection=release?'PLANNER_FLEXIBLE':'USER_KEPT';stop.fixed=!release;
  next.revision++;next.history.push({at:new Date().toISOString(),type:release?'restored':'kept',placeId:id});return next;
}
export function requestToDraft(request:PlanningRequest) {return {...request,budgetPerPerson:String(request.budgetPerPerson.amountCents/100),groupSize:String(request.groupSize),existingStops:request.existingStops.map(s=>({...s,startTime:s.startTime??'',endTime:s.endTime??'',durationMinutes:s.durationMinutes===null?'':String(s.durationMinutes),note:s.note??'',timingDetail:s.endTime!==null?'end-time' as const:s.durationMinutes!==null?'duration' as const:'unknown' as const}))};}
export function prepareEdit(plan:CurrentPlan,edit:PlanEdit):{request:PlanningRequest;retainedStops:OutingStop[];excludedIds:string[];surgical:boolean;replacementRole?:ExperienceRole;history:PlanSignal[]} {
  let request=structuredClone(plan.request);let retainedStops=structuredClone(plan.result.primaryItinerary.stops);
  const excludedIds=[...plan.excludedPlaceIds];const history=[...plan.history];let surgical=false;let replacementRole:ExperienceRole|undefined;
  const change=(stop:OutingStop)=>{if(executionFinished(plan,stop.id))throw new Error('Completed or skipped history cannot be rewritten.');if(!canChange(stop))throw new Error('You asked to preserve '+stop.place.display_name+'. Release Keep this or explicitly change its commitment before replacing it.');retainedStops=retainedStops.filter(s=>s.id!==stop.id);excludedIds.push(stop.id);replacementRole=stop.role;history.push({at:new Date().toISOString(),type:'changed',placeId:stop.id});};
  if(edit.kind==='change'){const stop=retainedStops.find(s=>s.id===edit.placeId);if(!stop)throw new Error('That stop is no longer in this plan.');change(stop);surgical=true;}
  else if(edit.kind==='details')request=structuredClone(edit.request);
  else if(edit.kind==='adjust'){
    const text=edit.text.trim().toLowerCase();if(!text||text.length>300)throw new Error('Describe one small change in 300 characters or fewer.');
    let understood=false;
    const keep=/keep (?:the )?(beach|dessert|dinner|coffee|activity|walk)/.exec(text);
    if(keep){const roles:Record<string,string[]>={beach:['scenic-relax'],dessert:['dessert'],dinner:['meal'],coffee:['coffee'],activity:['main-activity'],walk:['walk-explore','scenic-relax']};const stop=retainedStops.find(s=>!executionFinished(plan,s.id)&&roles[keep[1]].includes(s.role));if(!stop)throw new Error('There isn’t a '+keep[1]+' stop in the current plan to keep.');
      if(/keep (?:the )?\w+ experience/.test(text)){
        if(!canChange(stop)&&protection(stop)!=='USER_KEPT')throw new Error('The specific place is already a protected commitment. Explicitly change that commitment in Edit details first.');
        stop.protection='EXPERIENCE_ANCHOR';stop.fixed=false;
        if(!request.existingStops.some(s=>s.entryKind==='activity'&&s.name.toLowerCase()===keep[1]))request.existingStops.push({id:crypto.randomUUID(),name:keep[1],experience:keep[1],entryKind:'activity',place:null,source:'user',commitmentKind:'experience-anchor',protection:'EXPERIENCE_ANCHOR',fixed:false,startTime:null,endTime:null,durationMinutes:null,note:null,constraints:{preservePlace:false,preserveStartTime:false,preserveEndTime:false,preserveDuration:false}});
      }else{stop.protection='USER_KEPT';stop.fixed=true;}
      history.push({at:new Date().toISOString(),type:'kept',placeId:stop.id});understood=true;}
    if(/different beach|another beach/.test(text)){const stop=retainedStops.find(s=>s.role==='scenic-relax');if(!stop)throw new Error('There isn’t a beach in the current plan.');change(stop);surgical=true;understood=true;}
    if(/different dessert|another dessert/.test(text)){const stop=retainedStops.find(s=>s.role==='dessert');if(!stop)throw new Error('There isn’t a dessert stop to change yet.');change(stop);surgical=true;understood=true;}
    if(/dinner first|meal first|eat first/.test(text)){request.vibeInterests+=' dinner first';understood=true;}
    if(/less driving|closer together/.test(text)){request.vibeInterests+=' less driving';retainedStops=retainedStops.filter(s=>!canChange(s));understood=true;}
    if(/more active|something (?:more )?active/.test(text)){request.vibeInterests+=' something active';request.selectedInterests=[...(request.selectedInterests??[]),'Something active'];const stop=retainedStops.find(s=>!executionFinished(plan,s.id)&&canChange(s)&&['main-activity','casual-activity','walk-explore'].includes(s.role));if(stop)change(stop);understood=true;}
    if(/cheaper|less expensive/.test(text)){request.budgetPerPerson.amountCents=Math.round(request.budgetPerPerson.amountCents*.8);retainedStops=retainedStops.filter(s=>!canChange(s));understood=true;}
    const statedTime=/(?:until|by|at|finish(?: at)?|home by)\s*(\d{1,2}(?::\d{2})?)\s*(am|pm)/i.exec(text);
    if(statedTime){const finish=parseTypedTime(statedTime[1],statedTime[2].toUpperCase() as 'AM'|'PM');if(!finish)throw new Error('Enter a finish time like 10:30 PM.');request.requiredEndTime=finish;request.finishIsHard=true;request.returnToStart=/home by|back by/.test(text);understood=true;}
    else if(/stay out later|finish later|out later/.test(text)){const finish=Math.min(outingWindow(request).finish+60,outingWindow(request).start+1439);request.requiredEndTime=timelineClock(finish);understood=true;}
    else if(/finish earlier|earlier finish/.test(text)){const finish=outingWindow(request).finish-60;if(finish<=outingWindow(request).start)throw new Error('An hour earlier would leave no outing time. Choose a finish time in Edit details.');request.requiredEndTime=timelineClock(finish);request.finishIsHard=true;understood=true;}
    if(/(?:do not|don['’]?t) (?:go over|exceed)|hard cap|no more than/.test(text)){request.vibeInterests=request.vibeInterests.replace(/(?:hard cap(?: of)?|no more than|maximum|max budget|do not (?:go over|exceed)|don['’]?t (?:go over|exceed))\s*\$?\s*\d+(?:\.\d{1,2})?/gi,'')+' '+edit.text;understood=true;}
    if(!understood)throw new Error('Try “Dinner first”, “Different dessert”, “Less driving”, “More active”, “Make it cheaper”, “Stay out later”, or a finish time like “Home by 10:30 PM”.');
    history.push({at:new Date().toISOString(),type:'adjusted',request:edit.text});
  }
  request.endDayOffset=outingWindow(request).endDayOffset;request.endDate=addDays(request.date,request.endDayOffset);
  return {request,retainedStops,excludedIds:[...new Set(excludedIds)].slice(-100),surgical,...(surgical?{replacementRole}:{}),history};
}
