import type { WorldProvider, PlaceReference, PlaceSearchType } from '../src/world/types.ts';
import type { RoutingService } from '../src/routing/types.ts';
import type { PlanningRequest } from '../src/planning/types.ts';
import type { CandidatePlace, PlanningDiagnostics, ScheduledStop } from '../src/planner/types.ts';
import type { RealPlanResult, OutingStop } from '../src/itinerary/realPlan.ts';
import { lightweightIntent } from '../src/planner/intent.ts';
import { candidateFromPlace } from '../src/planner/estimates.ts';
import { findWindows, fixedConflicts, fixedTime, isOpen, hasOpeningWindow, schedule, scoreCandidate } from '../src/planner/schedule.ts';
import { toMinutes } from '../src/planning/validate.ts';
import { isPlaceReference } from '../src/world/reference.ts';
import { outingClock } from '../src/planning/clock.ts';
import { outingWindow, stopTiming, timelineClock, timelineDay } from '../src/planning/timeline.ts';
import { distanceMetres, WorldError } from './worldProvider.ts';
const clock=timelineClock;

export function finalConflicts(request:PlanningRequest,stops:ScheduledStop[]):string[] {
  const errors:string[]=[];let cursor=toMinutes(request.availableStartTime);
  const ids=new Set<string>();
  for(const stop of stops) {
    const c=stop.candidate;
    if(!isPlaceReference(c.place)||ids.has(c.id))errors.push('The outing contains an invalid or repeated place.');ids.add(c.id);
    if(!Number.isFinite(stop.travel.minutes)||stop.travel.minutes<0||!Number.isFinite(c.cost.value)||c.cost.value<0||(request.transportation==='driving'&&stop.travel.actualMode!=='driving'))errors.push('A cost or travel estimate is invalid.');
    if(stop.arrival<cursor+stop.travel.minutes+stop.bufferMinutes||stop.departure<=stop.arrival||stop.departure>toMinutes(request.availableStartTime)+1440)errors.push('The outing has conflicting travel or visit times.');
    if(fixedTime(c)!==null&&stop.arrival!==fixedTime(c))errors.push('A fixed arrival was changed.');
    if(c.fixedEnd!==null&&stop.departure!==c.fixedEnd)errors.push('A fixed ending was changed.');
    if(!isOpen(c,request.date,stop.arrival,stop.departure))errors.push('Known opening hours conflict with a visit.');
    cursor=stop.departure;
  }
  for(const user of request.existingStops) {
    const timing=stopTiming(request,user);
    const stop=stops.find(s=>s.candidate.userStopId===user.id);
    if(!stop||stop.candidate.place.provider_place_id!==user.place?.provider_place_id)errors.push(`${user.name} was not preserved.`);
    if(stop&&user.fixed&&user.startTime&&stop.arrival!==timing.start)errors.push(`${user.name}'s fixed time was changed.`);
    if(stop&&user.fixed&&user.endTime&&stop.departure!==timing.end)errors.push(`${user.name}'s fixed end was changed.`);
    if(stop&&user.durationMinutes!==null&&stop.departure-stop.arrival!==user.durationMinutes)errors.push(`${user.name}'s duration was changed.`);
  }
  return [...new Set(errors)];
}
export function createRealPlanner(world:WorldProvider,routing:RoutingService,options:{clock?:()=>Date}={}) {
  return {async build(request:PlanningRequest):Promise<{result:RealPlanResult;diagnostics:PlanningDiagnostics}> {
    const window=outingWindow(request);
    const input={request:structuredClone(request),intent:lightweightIntent.normalize(request),start:window.start,desiredFinish:window.finish};
    const diagnostics:PlanningDiagnostics={normalizedInput:input,decisions:request.existingStops.map(s=>({stopId:s.id,placeId:s.place?.provider_place_id??null,fixed:s.fixed,startTime:s.startTime,endTime:s.endTime,durationMinutes:s.durationMinutes})),openWindows:[],candidates:[],rejected:[],scores:[],selected:[],routes:[],assumptions:[],warnings:[],conflicts:[]};
    const fail=(message:string,status:'no-plan'|'clarification'='no-plan')=>{diagnostics.conflicts.push(message);return {result:{status,primaryItinerary:null,message} as RealPlanResult,diagnostics};};
    try {
      if(!request.startingPlace)return fail('Choose a real starting location before building your outing.');
      const unlocated=request.existingStops.find(s=>!s.place);
      if(unlocated)return fail(`Where will “${unlocated.name}” happen? Select its venue so I can plan travel around it.`,'clarification');
      const existing=request.existingStops.map(s=>candidateFromPlace(s.place!,s,request));
      if(new Set(existing.map(c=>c.id)).size!==existing.length)return fail('Two existing stops refer to the same place. Combine them or choose separate places before planning.');
      diagnostics.openWindows=findWindows(input,existing);
      const early=fixedConflicts(input,existing);if(early.length)return fail(early.join(' '));
      let pool=[...existing];
      const centers=[request.startingPlace,...existing.slice(0,1).filter(c=>distanceMetres(request.startingPlace!,c.place)>3000).map(c=>c.place)];
      const searches=[...input.intent.searches];
      if(searches.includes('food')&&request.budgetPerPerson.amountCents<6000)searches.splice(searches.indexOf('food')+1,0,'casual-food');
      if(input.intent.mood==='active'&&!searches.includes('bowling'))searches.push('bowling');
      // Free outdoor alternatives keep a lower budget useful without inventing businesses.
      if(!searches.includes('park')&&(input.intent.mood==='active'||request.budgetPerPerson.amountCents<3000))searches.push('park');
      const jobs=centers.flatMap(center=>searches.map(type=>({center,type})));
      for(let batch=0;batch<jobs.length;batch+=4) {
        const chunk=jobs.slice(batch,batch+4);
        const foundBatch=await Promise.all(chunk.map(async({center,type})=>({type,found:await world.searchPlaces({query:type,location:center,radius:request.transportation==='driving'?12000:2500,types:[type],limit:6})})));
        for(const {type,found} of foundBatch)for(const place of found.places) {
          if(!isPlaceReference(place)){diagnostics.rejected.push({placeId:'unknown',code:'MISSING_REQUIRED_REALITY_DATA',detail:'Missing identity or coordinates.'});continue;}
          if(pool.some(c=>c.id===place.provider_place_id))continue;
          if(pool.some(c=>c.place.display_name.toLowerCase()===place.display_name.toLowerCase()&&distanceMetres(c.place,place)<100)){diagnostics.rejected.push({placeId:place.provider_place_id,code:'DUPLICATE_PLACE',detail:'Nearby same-name record.'});continue;}
          const c=candidateFromPlace(place);
          if(place.provider==='google'&&place.primary_type==='snack_bar'){diagnostics.rejected.push({placeId:c.id,code:'PUBLIC_ACCESS_UNKNOWN',detail:'Snack counters may be inside restricted facilities; no public access confirmation is connected.'});continue;}
          if(type==='park'&&input.intent.desiredRoles.includes('main-activity')&&(input.intent.mood==='active'||request.budgetPerPerson.amountCents<3000)){c.role='main-activity';c.category='Outdoor activity';c.estimateNotes.push('An outdoor walk is the lower-cost active option.');}
          if(type==='dessert'&&c.role==='coffee')c.role='dessert';
          pool.push(c);
        }
      }
      // Google searches already return hours. Check the full candidate universe before bounding the matrix.
      if(request.startingPlace.provider==='google'&&world.getPlaceDetailsMany){
        const supplied=await world.getPlaceDetailsMany(pool.map(c=>c.id));
        pool=pool.filter(c=>{const outcome=supplied.get(c.id);if(outcome?.ok){c.place=outcome.details.place;c.openingInformation=outcome.details.opening_hours;c.hoursChecked=true;if(outcome.details.business_status!=='listed'&&!c.userStopId)return false;}
          if(!c.userStopId&&!hasOpeningWindow(c,request.date,input.start,input.desiredFinish+15)){diagnostics.rejected.push({placeId:c.id,code:'CLOSED',detail:'No full visit fits the available opening window.'});return false;}return true;});
      }
      // Keep all user choices and preserve a cheaper alternative for each role before building the route matrix.
      const ordered=pool.filter(c=>!c.userStopId).sort((a,b)=>scoreCandidate(input,b).total-scoreCandidate(input,a).total||distanceMetres(request.startingPlace!,a.place)-distanceMetres(request.startingPlace!,b.place));
      const roleCounts=new Map<string,number>();
      const automatic=request.startingPlace.provider==='google'?ordered.filter(c=>{const count=roleCounts.get(c.role)??0;roleCounts.set(c.role,count+1);const cheapest=ordered.filter(p=>p.role===c.role).reduce((a,b)=>a.cost.value<=b.cost.value?a:b);return count<3||c.id===cheapest.id;}):ordered;
      pool=[...existing,...automatic.slice(0,Math.max(0,(request.startingPlace.provider==='google'?13:22)-existing.length))];
      diagnostics.candidates=pool;
      if(!pool.length)return fail('No usable real places were returned near your starting point. Try a nearby address or a broader interest.');
      const [matrix,detailResult]=await Promise.all([
        routing.getMatrix([request.startingPlace,...pool.map(c=>c.place)],request.transportation),
        world.getPlaceDetailsMany?world.getPlaceDetailsMany(pool.map(c=>c.id)).then(data=>({data,error:null})).catch(error=>({data:null,error:error instanceof Error?error.message:'Place details unavailable'})):Promise.resolve({data:null,error:null}),
      ]);
      const excluded=new Set<string>();
      if(world.getPlaceDetailsMany) {
        if(detailResult.error)diagnostics.warnings.push('Extra place details could not load. Confirm opening hours before going.');
        for(const c of pool) {
          const outcome=detailResult.data?.get(c.id);c.hoursChecked=true;
          if(outcome?.ok&&outcome.details.business_status==='listed'){c.place=outcome.details.place;c.openingInformation=outcome.details.opening_hours;}
          else if(outcome?.ok){if(c.userStopId)return fail(c.place.display_name+' is temporarily unavailable. Your choice has not been replaced.');excluded.add(c.id);diagnostics.rejected.push({placeId:c.id,code:'INACTIVE',detail:'Temporarily closed.'});}
          else if(outcome&&[404,410,422].includes(outcome.status)){
            if(c.userStopId)return fail(`${c.place.display_name} is unavailable. Your choice has not been replaced.`);
            excluded.add(c.id);diagnostics.rejected.push({placeId:c.id,code:'INACTIVE',detail:outcome.message});
          }else {
            c.place={...c.place,provider_metadata:{...c.place.provider_metadata,details_status:'unavailable'}};
            // For an evening, avoid automatically choosing a sit-down venue when its details service failed.
            // Fresh real map identities still permit other provisional stops with visible uncertainty.
            if(!c.userStopId&&c.category==='Restaurant'&&input.start>=17*60){excluded.add(c.id);diagnostics.rejected.push({placeId:c.id,code:'MISSING_REQUIRED_REALITY_DATA',detail:'Evening restaurant hours could not be checked.'});}
          }
        }
      }
      if(options.clock){const now=outingClock(request.timeZone,request.startingPlace,options.clock());if(request.date<now.date)return fail('This date has already passed. Choose today or a future date.');if(request.date===now.date)input.start=Math.max(input.start,toMinutes(now.time));diagnostics.openWindows=findWindows(input,existing);const elapsedConflicts=fixedConflicts(input,existing);if(elapsedConflicts.length)return fail(elapsedConflicts.join(' '));}
      diagnostics.routes=matrix.legs.flatMap((row,i)=>row.flatMap((estimate,j)=>i!==j?[{from:i===0?request.startingPlace!.provider_place_id:pool[i-1].id,to:j===0?request.startingPlace!.provider_place_id:pool[j-1].id,estimate}]:[]));
      diagnostics.scores=pool.map(c=>({placeId:c.id,...scoreCandidate(input,c)}));
      let selected:ScheduledStop[]=[];
      // Only finalists need extra detail calls. Recheck after hours/status refresh, then resequence.
      for(let attempt=0;attempt<4;attempt++) {
        if(options.clock){const now=outingClock(request.timeZone,request.startingPlace,options.clock());if(request.date<now.date)return fail('This date has already passed. Choose today or a future date.');if(request.date===now.date)input.start=Math.max(input.start,toMinutes(now.time));diagnostics.openWindows=findWindows(input,existing);}
        const available=pool.filter(c=>!excluded.has(c.id));
        const indices=[0,...available.map(c=>pool.indexOf(c)+1)];
        const subset={points:indices.map(i=>matrix.points[i]),legs:indices.map(i=>indices.map(j=>matrix.legs[i][j]))};
        const result=schedule(input,available,subset);diagnostics.rejected.push(...result.rejected);
        if(result.conflict)return fail(result.conflict);
        let changed=false;
        for(const stop of result.stops) {
          const c=stop.candidate;if(c.hoursChecked)continue;
          try {
            const details=await world.getPlaceDetails(c.id);c.hoursChecked=true;c.openingInformation=details.opening_hours;c.place=details.place;
            if(details.business_status==='unavailable')throw new WorldError('This place is unavailable.',410);
            if(!isOpen(c,request.date,stop.arrival,stop.departure)) {
              diagnostics.rejected.push({placeId:c.id,code:'CLOSED',detail:'Refreshed hours conflict with the scheduled visit.'});
              if(c.userStopId&&fixedTime(c)!==null)return fail(`${c.place.display_name}'s listed hours conflict with your fixed time. Confirm its hours or change that commitment; its time has not been moved.`);
              changed=true;
            }
          }catch(error) {
            if(error instanceof WorldError&&[404,410,422].includes(error.status)) {
              diagnostics.rejected.push({placeId:c.id,code:'INACTIVE',detail:error.message});
              if(c.userStopId)return fail(`${c.place.display_name} is unavailable in the place source. Your choice has not been replaced. Please confirm or change it.`);
              excluded.add(c.id);changed=true;
            } else {c.hoursChecked=true;diagnostics.warnings.push(`Extra details for ${c.place.display_name} could not load. Its hours need confirmation.`);}
          }
        }
        if(changed)continue;
        selected=result.stops;break;
      }
      if(!selected.length)return fail('The available places’ hours could not support a complete outing. Try a different window or interest.');
      if(options.clock){const now=outingClock(request.timeZone,request.startingPlace,options.clock());if(request.date===now.date&&toMinutes(now.time)>input.start){input.start=toMinutes(now.time);const available=pool.filter(c=>!excluded.has(c.id));const indices=[0,...available.map(c=>pool.indexOf(c)+1)];const refreshed=schedule(input,available,{points:indices.map(i=>matrix.points[i]),legs:indices.map(i=>indices.map(j=>matrix.legs[i][j]))});if(refreshed.conflict)return fail(refreshed.conflict);if(refreshed.stops.some(s=>!s.candidate.hoursChecked))return fail('Time moved forward while checking places. Please build again to refresh the outing.');selected=refreshed.stops;diagnostics.openWindows=findWindows(input,existing);}}
      const final=finalConflicts(request,selected);if(final.length)return fail(final.join(' '));
      const warnings=new Set<string>(diagnostics.warnings);
      warnings.add('Costs and visit lengths are category estimates, not verified prices. Confirm hours, availability and any entry or parking fees before going.');
      warnings.add('Travel uses mapped roads or footpaths without live traffic. Each journey includes a separate transition allowance.');
      if(request.transportation==='transit')warnings.add('This plan uses short walking connections only. Bus and train schedules are not connected.');
      if(request.groupSize>=6)warnings.add(`For ${request.groupSize} people, check seating or activity capacity before heading out.`);
      const cost=selected.reduce((s,c)=>s+c.candidate.cost.value,0);
      if(cost>request.budgetPerPerson.amountCents)warnings.add(`The estimated total is about $${Math.round(cost/100)} per person, above your $${request.budgetPerPerson.amountCents/100} target.`);
      if(selected.at(-1)!.departure>input.desiredFinish)warnings.add('Your fixed choices or travel extend a little past your preferred wrap-up. Fixed times have been preserved.');
      if(input.intent.budgetPolicy==='hard-cap')warnings.add('Your stated cap was applied to estimates. Actual prices are unverified, so confirm them before spending.');
      const missingRoles=input.intent.desiredRoles.filter(role=>!selected.some(s=>s.candidate.role===role));
      if(missingRoles.length)warnings.add('The available time or place hours limited the outing. It includes your existing choices; some requested activities could not fit.');
      const stops:OutingStop[]=selected.map((s,index)=>{
        const c=s.candidate;const notes:string[]=[];
        if(!c.openingInformation?.weekly)notes.push('Opening hours need confirmation.');
        if(c.category==='Cinema')notes.push('Choose an actual showtime before going; this is a visit allowance.');
        if(c.category==='Active activity')notes.push('Check public access, sessions and equipment requirements.');
        const reason=c.userStopId?'You chose this place. The rest of the outing works around it.':c.role==='meal'?'A meal stop close to the rest of your outing.':c.role==='main-activity'?input.intent.mood==='active'?'An active stop that fits your available time.':'One main activity to give the outing a little momentum.':c.role==='walk-explore'?'An easy outdoor pause with no planned purchase.':c.role==='dessert'?index===selected.length-1?'A short, relaxed ending after the main part of your outing.':'A short sweet break that fits between your other plans.':'A relaxed stop that complements your other plans.';
        return {id:c.id,userStopId:c.userStopId,place:c.place,role:c.role,category:c.category,arrival:clock(s.arrival),departure:clock(s.departure),arrivalDayOffset:timelineDay(s.arrival),departureDayOffset:timelineDay(s.departure),fixed:c.fixed,exactTime:c.fixedStart!==null,exactEnd:c.fixedEnd!==null,duration:{...c.duration,value:s.departure-s.arrival},cost:c.cost,travel:s.travel,transitionMinutes:s.bufferMinutes,waitMinutes:s.waitMinutes,reason,note:c.note,warnings:notes};
      });
      diagnostics.selected=selected;diagnostics.warnings=[...warnings];diagnostics.assumptions=[...new Set(selected.flatMap(s=>s.candidate.estimateNotes)),'Origin/stop coordinates may represent the center of a mapped area.','The desired finish is a target with a 15-minute allowance; fixed commitments remain exact.'];
      return {result:{status:'complete',message:null,primaryItinerary:{stops,start:clock(input.start),finish:clock(selected.at(-1)!.departure),finishDayOffset:timelineDay(selected.at(-1)!.departure),costPerPersonCents:cost,costRangeCents:{low:selected.reduce((s,c)=>s+c.candidate.cost.low,0),high:selected.reduce((s,c)=>s+c.candidate.cost.high,0)},travelMinutes:stops.reduce((s,c)=>s+c.travel.minutes,0),warnings:[...warnings]}},diagnostics};
    }catch(error) {return fail(error instanceof Error?error.message:'Real places or travel could not load. Your choices are safe. Please try again.');}
  }};
}
