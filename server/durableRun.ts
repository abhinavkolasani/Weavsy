import { durableDraft } from '../src/world/durable.ts';
/** Founder metrics remain inspectable without creating a permanent copy of Google content. */
export function durableRun(run:any) {
  if(!run.request)return {...run,received:undefined};
  const diagnostics=run.diagnostics??{};
  const current=run.currentPlan;
  const ownCost=(cost:any)=>cost?.source==='provider-price-signal'?{source:cost.source,status:cost.status,note:'Refresh provider price signal; not archived.'}:cost;
  return {runId:run.runId,timestamp:run.timestamp,build:run.build,parentRunId:run.parentRunId,status:run.status,edit:run.edit?.kind==='details'?{kind:'details',request:durableDraft(run.edit.request)}:run.edit,
    currentPlan:current?{id:current.id,revision:current.revision,runId:current.runId,history:current.history,execution:current.execution??[],excludedPlaceIds:current.excludedPlaceIds,
      stops:current.result.primaryItinerary.stops.map((s:any)=>({placeId:s.id,role:s.role,protection:s.protection,arrival:s.arrival,departure:s.departure,arrivalDayOffset:s.arrivalDayOffset,departureDayOffset:s.departureDayOffset,exactTime:s.exactTime,exactEnd:s.exactEnd,cost:ownCost(s.cost),hoursStatus:s.hoursStatus,confidence:s.qualification?.confidence}))}:null,
    request:durableDraft(run.request),providerContent:'Refresh from provider; not stored on disk.',
    itinerary:run.result?.status==='complete'?{placeIds:run.result.primaryItinerary.stops.map((s:any)=>s.id),start:run.result.primaryItinerary.start,finish:run.result.primaryItinerary.finish,finishDayOffset:run.result.primaryItinerary.finishDayOffset,costPerPersonCents:run.result.primaryItinerary.costPerPersonCents,travelMinutes:run.result.primaryItinerary.travelMinutes,hasUnknownCosts:run.result.primaryItinerary.hasUnknownCosts}:null,
    diagnostics:{reasoning:diagnostics.reasoning??null,metrics:diagnostics.metrics??null,decisions:diagnostics.decisions??[],openWindows:diagnostics.openWindows??[],scores:diagnostics.scores??[],
      candidates:(diagnostics.candidates??[]).map((c:any)=>({placeId:c.id,role:c.role,confidence:c.qualification?.confidence,accepted:c.qualification?.accepted,protection:c.protection})),
      selected:(diagnostics.selected??[]).map((s:any)=>({placeId:s.candidate.id,userStopId:s.candidate.userStopId,fixed:s.candidate.fixed,protection:s.candidate.protection,arrival:s.arrival,departure:s.departure,cost:ownCost(s.candidate.cost),duration:s.candidate.duration,hoursStatus:s.candidate.hoursStatus})),
      quality:(diagnostics.quality??[]).map((q:any)=>({lens:q.lens,passed:q.passed,issueCount:q.issues?.length??0})),assumptions:diagnostics.assumptions??[],errorCodes:diagnostics.errorCodes??[],
      rejected:(diagnostics.rejected??[]).map((r:any)=>({placeId:r.placeId,code:r.code})),conflictCount:diagnostics.conflicts?.length??0}};
}
