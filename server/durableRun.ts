import { durableDraft } from '../src/world/durable.ts';
/** Founder metrics remain inspectable without creating a permanent copy of Google content. */
export function durableRun(run:any) {
  if(!run.request)return {...run,received:undefined};
  const diagnostics=run.diagnostics??{};
  return {runId:run.runId,timestamp:run.timestamp,build:run.build,parentRunId:run.parentRunId,status:run.status,
    request:durableDraft(run.request),providerContent:'Refresh from provider; not stored on disk.',
    diagnostics:{decisions:diagnostics.decisions??[],openWindows:diagnostics.openWindows??[],scores:diagnostics.scores??[],
      selected:(diagnostics.selected??[]).map((s:any)=>({placeId:s.candidate.id,userStopId:s.candidate.userStopId,fixed:s.candidate.fixed,arrival:s.arrival,departure:s.departure,cost:s.candidate.cost,duration:s.candidate.duration})),
      rejected:(diagnostics.rejected??[]).map((r:any)=>({placeId:r.placeId,code:r.code})),conflictCount:diagnostics.conflicts?.length??0}};
}
