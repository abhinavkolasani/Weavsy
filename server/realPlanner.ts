import type { WorldProvider, PlaceReference, PlaceSearchType } from '../src/world/types.ts';
import type { RoutingService } from '../src/routing/types.ts';
import type { PlanningRequest } from '../src/planning/types.ts';
import type { CandidatePlace, PlanningDiagnostics, ScheduledStop, ExperienceRole, PlannerInput } from '../src/planner/types.ts';
import type { RealPlanResult, OutingStop } from '../src/itinerary/realPlan.ts';
import { lightweightIntent } from '../src/planner/intent.ts';
import { candidateFromPlace } from '../src/planner/estimates.ts';
import { findWindows, fixedConflicts, fixedTime, isOpen, hasOpeningWindow, schedule, scoreCandidate, openingStatus } from '../src/planner/schedule.ts';
import { qualifyPlace, roleFamily } from '../src/planner/qualification.ts';
import { toMinutes } from '../src/planning/validate.ts';
import { isPlaceReference } from '../src/world/reference.ts';
import { outingClock } from '../src/planning/clock.ts';
import { outingWindow, stopTiming, timelineClock, timelineDay } from '../src/planning/timeline.ts';
import { distanceMetres, WorldError } from './worldProvider.ts';
import { suggestedStopCount } from '../src/planner/pacing.ts';
import type { ModelGateway } from './model/gateway.ts';
import type { CurrentPlan } from '../src/planning/currentPlan.ts';
import { proposalIdentityErrors } from './model/validateProposal.ts';
import { visitWarnings } from '../src/planner/visitWarnings.ts';
const clock=timelineClock;

export function finalConflicts(request:PlanningRequest,stops:ScheduledStop[]):string[] {
  const errors:string[]=[];let cursor=toMinutes(request.availableStartTime);
  const ids=new Set<string>();
  for(const stop of stops) {
    const c=stop.candidate;
    if(!isPlaceReference(c.place)||c.id!==c.place.provider_place_id||ids.has(c.id))errors.push('The outing contains an invalid or repeated place.');ids.add(c.id);
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
    if(user.entryKind==='activity')continue;
    if(!stop||stop.candidate.place.provider_place_id!==user.place?.provider_place_id)errors.push(`${user.name} was not preserved.`);
    if(stop&&user.fixed&&user.startTime&&stop.arrival!==timing.start)errors.push(`${user.name}'s fixed time was changed.`);
    if(stop&&user.fixed&&user.endTime&&stop.departure!==timing.end)errors.push(`${user.name}'s fixed end was changed.`);
    if(stop&&user.durationMinutes!==null&&stop.departure-stop.arrival!==user.durationMinutes)errors.push(`${user.name}'s duration was changed.`);
  }
  return [...new Set(errors)];
}
export function createRealPlanner(world:WorldProvider,routing:RoutingService,options:{clock?:()=>Date;model?:ModelGateway}={}) {
  return {async build(request:PlanningRequest,context:{retainedStops?:OutingStop[];excludedIds?:string[];surgical?:boolean;replacementRole?:ExperienceRole;currentPlan?:CurrentPlan|null}={}):Promise<{result:RealPlanResult;diagnostics:PlanningDiagnostics}> {
    const window=outingWindow(request);
    const input:PlannerInput={request:structuredClone(request),intent:lightweightIntent.normalize(request),start:window.start,desiredFinish:window.finish,...(context.surgical?{replacementRole:context.replacementRole}:{})};
    if(input.replacementRole){const search:Record<ExperienceRole,PlaceSearchType>={meal:'food','main-activity':'activity','casual-activity':'activity',coffee:'cafe',dessert:'dessert',drinks:'drinks','walk-explore':'park','shopping-browse':'shopping','scenic-relax':'beach','optional-extra':'activity',study:'study'};if(!input.intent.searches.includes(search[input.replacementRole]))input.intent.searches.push(search[input.replacementRole]);if(!input.intent.desiredRoles.includes(input.replacementRole))input.intent.desiredRoles.push(input.replacementRole);}
    const diagnostics:PlanningDiagnostics={normalizedInput:input,decisions:request.existingStops.map(s=>({stopId:s.id,placeId:s.place?.provider_place_id??null,fixed:s.fixed,startTime:s.startTime,endTime:s.endTime,durationMinutes:s.durationMinutes})),openWindows:[],candidates:[],rejected:[],scores:[],selected:[],routes:[],assumptions:[],warnings:[],conflicts:[]};
    const fail=(message:string,status:'no-plan'|'clarification'='no-plan',lens:NonNullable<PlanningDiagnostics['quality']>[number]['lens']='REAL_WORLD_ACCURACY')=>{diagnostics.conflicts.push(message);if(!diagnostics.quality?.some(q=>!q.passed))diagnostics.quality=[{lens,passed:false,issues:[message]}];return {result:{status,primaryItinerary:null,message} as RealPlanResult,diagnostics};};
    try {
      if(!request.startingPlace)return fail('Choose a real starting location before building your outing.');
      const unlocated=request.existingStops.find(s=>!s.place&&s.entryKind!=='activity');
      if(unlocated)return fail(`Where will “${unlocated.name}” happen? Select its venue so I can plan travel around it.`,'clarification');
      const unknownExperience=request.existingStops.find(s=>s.entryKind==='activity'&&!input.intent.experienceAnchors?.some(a=>a.id===s.id));
      if(unknownExperience)return fail(`What kind of experience is “${unknownExperience.name}”? Try beach, a walk, coffee, dinner, a museum, or an activity.`,'clarification','INTENT_FIDELITY');
      if(request.existingStops.some(s=>s.entryKind==='activity'&&s.fixed&&s.startTime))return fail('For an exact-time activity, select the booked venue so I can check travel and hours. The time has not been changed.','clarification');
      let existing=request.existingStops.filter(s=>s.place).map(s=>candidateFromPlace(s.place!,s,request));
      for(const stop of context.retainedStops??[]) {
        if(existing.some(c=>c.id===stop.id)||context.excludedIds?.includes(stop.id))continue;
        const c=candidateFromPlace(stop.place);c.userStopId='retained:'+stop.id;
        c.protection=stop.protection??'PLANNER_FLEXIBLE';c.fixed=['USER_FIXED','USER_KEPT','USER_PLACE'].includes(c.protection);
        c.preferredStart=toMinutes(stop.arrival)+(stop.arrivalDayOffset??0)*1440;
        // Keeping a generated place does not freeze its inferred time/duration.
        if(stop.exactTime){c.fixedStart=c.preferredStart;c.fixed=true;}if(stop.exactEnd)c.fixedEnd=toMinutes(stop.departure)+(stop.departureDayOffset??0)*1440;
        existing.push(c);
      }
      const mayRecompose=(c:CandidatePlace)=>!context.surgical&&['PLANNER_FLEXIBLE','EXPERIENCE_ANCHOR'].includes(c.protection??'')&&c.userStopId?.startsWith('retained:');
      existing=existing.filter(c=>{if(mayRecompose(c)&&c.qualification&&!c.qualification.accepted){diagnostics.rejected.push({placeId:c.id,code:c.qualification.reason??'LOW_PLACE_CONFIDENCE',detail:c.qualification.detail});return false;}return true;});
      for(const c of existing)if(c.qualification&&!c.qualification.accepted)return fail(`${c.place.display_name} can’t be used as an outing stop: ${c.qualification.detail} Your choice has not been replaced.`,'clarification','EXPERIENCE_SUPPLY');
      if(new Set(existing.map(c=>c.id)).size!==existing.length)return fail('Two existing stops refer to the same place. Combine them or choose separate places before planning.');
      diagnostics.openWindows=findWindows(input,existing);
      const early=fixedConflicts(input,existing);if(early.length)return fail(early.join(' '));
      let pool=[...existing];
      const centers=[request.startingPlace,...existing.filter(c=>['USER_FIXED','USER_KEPT','USER_PLACE'].includes(c.protection??'')).slice(0,1).filter(c=>distanceMetres(request.startingPlace!,c.place)>3000).map(c=>c.place)];
      const searches=[...input.intent.searches];
      if(searches.includes('food')&&request.budgetPerPerson.amountCents<6000)searches.splice(searches.indexOf('food')+1,0,'casual-food');
      if(input.intent.mood==='active'&&!searches.includes('bowling'))searches.push('bowling');
      // Lower-cost outdoor alternatives retain uncertainty about admission and parking.
      if(!searches.includes('park')&&(input.intent.mood==='active'||request.budgetPerPerson.amountCents<3000))searches.push('park');
      // Longer outings need a broader mix, not repeated meals or the same activity twice.
      const pacing=suggestedStopCount(input.desiredFinish-input.start);
      const studyOnly=input.intent.desiredRoles.length===1&&input.intent.desiredRoles[0]==='study';
      if(!studyOnly&&pacing>=3&&!searches.includes('beach')&&!searches.includes('park'))searches.push('park');
      if(!studyOnly&&pacing>=3&&!searches.includes('dessert')&&!searches.includes('cafe'))searches.push('dessert');
      if(!studyOnly&&pacing>=5&&!searches.includes('shopping'))searches.push('shopping');
      // Find the protected experience first, then search food/ending near its real implementation.
      if(searches.includes('beach')&&!existing.some(c=>c.category==='Beach')) {
        const found=await world.searchPlaces({query:'beaches',types:['beach'],location:request.startingPlace,radius:request.transportation==='driving'?40000:2500,limit:5});
        diagnostics.rejected.push(...(found.rejected??[]));
        for(const p of found.places){const q=qualifyPlace(p,'beach');if(!q.accepted){diagnostics.rejected.push({placeId:p.provider_place_id,code:q.reason!,detail:q.detail});continue;}if(!context.excludedIds?.includes(p.provider_place_id)){const c=candidateFromPlace(p);pool.push(c);}}
        const beach=pool.find(c=>c.category==='Beach');if(beach&&distanceMetres(request.startingPlace,beach.place)>3000)centers.push(beach.place);
      }
      const jobs=centers.slice(0,2).flatMap(center=>searches.filter(t=>t!=='beach').map(type=>({center,type})));
      for(let batch=0;batch<jobs.length;batch+=4) {
        const chunk=jobs.slice(batch,batch+4);
        const foundBatch=await Promise.all(chunk.map(async({center,type})=>({type,found:await world.searchPlaces({query:type,location:center,radius:request.transportation==='driving'?12000:2500,types:[type],limit:6})})));
        for(const {found} of foundBatch)diagnostics.rejected.push(...(found.rejected??[]));
        for(const {type,found} of foundBatch)for(const place of found.places) {
          if(!isPlaceReference(place)){diagnostics.rejected.push({placeId:'unknown',code:'MISSING_REQUIRED_REALITY_DATA',detail:'Missing identity or coordinates.'});continue;}
          if(pool.some(c=>c.id===place.provider_place_id))continue;
          if(pool.some(c=>c.place.display_name.toLowerCase()===place.display_name.toLowerCase()&&distanceMetres(c.place,place)<100)){diagnostics.rejected.push({placeId:place.provider_place_id,code:'DUPLICATE_PLACE',detail:'Nearby same-name record.'});continue;}
          if(context.excludedIds?.includes(place.provider_place_id)){diagnostics.rejected.push({placeId:place.provider_place_id,code:'USER_REJECTED',detail:'You asked for a different place.'});continue;}
          const qualification=qualifyPlace(place,type);
          if(!qualification.accepted){diagnostics.rejected.push({placeId:place.provider_place_id,code:qualification.reason!,detail:qualification.detail});continue;}
          const c=candidateFromPlace(place);c.qualification=qualification;
          if(place.provider==='google'&&place.primary_type==='snack_bar'){diagnostics.rejected.push({placeId:c.id,code:'PUBLIC_ACCESS_UNKNOWN',detail:'Snack counters may be inside restricted facilities; no public access confirmation is connected.'});continue;}
          if(type==='park'&&input.intent.desiredRoles.includes('main-activity')&&request.budgetPerPerson.amountCents<3000){c.role='main-activity';c.category='Outdoor activity';c.estimateNotes.push('An outdoor walk is the lower-cost active option.');}
          pool.push(c);
        }
      }
      // Google searches already return hours. Check the full candidate universe before bounding the matrix.
      if(request.startingPlace.provider==='google'&&world.getPlaceDetailsMany){
        const supplied=await world.getPlaceDetailsMany(pool.map(c=>c.id));
        pool=pool.filter(c=>{const outcome=supplied.get(c.id);if(outcome?.ok){c.place=outcome.details.place;c.openingInformation=outcome.details.opening_hours;c.hoursChecked=true;if(outcome.details.business_status!=='listed'&&!c.userStopId){diagnostics.rejected.push({placeId:c.id,code:'CLOSED_BUSINESS',detail:'Provider reports a closed business.'});return false;}}
          if(!c.userStopId&&!hasOpeningWindow(c,request.date,input.start,input.desiredFinish+15)){diagnostics.rejected.push({placeId:c.id,code:'CLOSED',detail:'No full visit fits the available opening window.'});return false;}return true;});
      }
      // Keep all user choices and preserve a cheaper alternative for each role before building the route matrix.
      const ordered=pool.filter(c=>!c.userStopId&&(!input.replacementRole||c.role===input.replacementRole)).sort((a,b)=>scoreCandidate(input,b).total-scoreCandidate(input,a).total||distanceMetres(request.startingPlace!,a.place)-distanceMetres(request.startingPlace!,b.place));
      // Reserve a candidate for every role and its cheaper alternative before extra choices.
      // This keeps a small route matrix without letting restaurants crowd out longer-outing breaks.
      const diverse:CandidatePlace[]=[];
      for(const role of new Set(ordered.map(c=>c.role)))diverse.push(ordered.find(c=>c.role===role)!);
      for(const role of new Set(ordered.map(c=>c.role))){const cheap=ordered.filter(c=>c.role===role).reduce((a,b)=>a.cost.value<=b.cost.value?a:b);if(!diverse.some(c=>c.id===cheap.id))diverse.push(cheap);}
      const automatic=request.startingPlace.provider==='google'?[...diverse,...ordered.filter(c=>!diverse.some(d=>d.id===c.id))]:ordered;
      pool=[...pool.filter(c=>c.userStopId),...automatic.slice(0,Math.max(0,(request.startingPlace.provider==='google'?13:22)-existing.length))];
      // Short outings can use the low end of a category duration; explicit user durations remain exact.
      if((input.desiredFinish-input.start<=120&&input.intent.desiredRoles.length>=2)||(input.desiredFinish-input.start<=210&&input.intent.desiredRoles.length>=3))for(const c of pool)if(c.duration.source!=='user')c.duration={...c.duration,value:c.duration.low};
      diagnostics.candidates=pool;
      if(!pool.length)return fail('No usable real places were returned near your starting point. Try a nearby address or a broader interest.','no-plan','EXPERIENCE_SUPPLY');
      if(input.replacementRole&&!pool.some(c=>!c.userStopId&&c.role===input.replacementRole))return fail('I couldn’t find another usable place for that stop. Your current plan is still here. Try another change or a wider time window.','no-plan','EXPERIENCE_SUPPLY');
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
          else if(outcome?.ok){if(c.userStopId&&!mayRecompose(c))return fail(c.place.display_name+' is temporarily unavailable. Your choice has not been replaced.');excluded.add(c.id);diagnostics.rejected.push({placeId:c.id,code:'INACTIVE',detail:'Temporarily closed.'});}
          else if(outcome&&[404,410,422].includes(outcome.status)){
            if(c.userStopId&&!mayRecompose(c))return fail(`${c.place.display_name} is unavailable. Your choice has not been replaced.`);
            excluded.add(c.id);diagnostics.rejected.push({placeId:c.id,code:'INACTIVE',detail:outcome.message});
          }else {
            c.place={...c.place,provider_metadata:{...c.place.provider_metadata,details_status:'unavailable'}};
            // For an evening, avoid automatically choosing a sit-down venue when its details service failed.
            // Fresh real map identities still permit other provisional stops with visible uncertainty.
            if(!c.userStopId&&c.category==='Restaurant'&&input.start>=17*60){excluded.add(c.id);diagnostics.rejected.push({placeId:c.id,code:'MISSING_REQUIRED_REALITY_DATA',detail:'Evening restaurant hours could not be checked.'});}
          }
        }
      }
      for(const c of pool.filter(c=>c.userStopId)) {
        if(excluded.has(c.id))continue;
        const at=fixedTime(c);
        if(at!==null&&!isOpen(c,request.date,at,c.fixedEnd??at+c.duration.value))return fail(`${c.place.display_name} is closed during your fixed visit according to its listed hours. Its place and time have not been changed. Confirm the hours or explicitly change that commitment.`);
        if(!hasOpeningWindow(c,request.date,input.start,input.desiredFinish+(input.intent.finishPolicy==='hard'?0:15))){if(mayRecompose(c)){excluded.add(c.id);diagnostics.rejected.push({placeId:c.id,code:'INSUFFICIENT_TIME',detail:'The flexible stop no longer fits the changed window.'});continue;}return fail(`${c.place.display_name} cannot fit its visit into this outing window. Your protected choice is still here. Give it more time or explicitly release/change the place.`);}
      }
      if(options.clock){const now=outingClock(request.timeZone,request.startingPlace,options.clock());if(request.date<now.date)return fail('This date has already passed. Choose today or a future date.');if(request.date===now.date)input.start=Math.max(input.start,toMinutes(now.time));diagnostics.openWindows=findWindows(input,existing);const elapsedConflicts=fixedConflicts(input,existing);if(elapsedConflicts.length)return fail(elapsedConflicts.join(' '));}
      diagnostics.routes=matrix.legs.flatMap((row,i)=>row.flatMap((estimate,j)=>i!==j?[{from:i===0?request.startingPlace!.provider_place_id:pool[i-1].id,to:j===0?request.startingPlace!.provider_place_id:pool[j-1].id,estimate}]:[]));
      diagnostics.scores=pool.map(c=>({placeId:c.id,...scoreCandidate(input,c)}));
      let proposedSequence:string[]|undefined;
      if(options.model){
        const available=pool.filter(c=>!excluded.has(c.id)),indices=[0,...available.map(c=>pool.indexOf(c)+1)];
        const subset={points:indices.map(i=>matrix.points[i]),legs:indices.map(i=>indices.map(j=>matrix.legs[i][j]))};
        const outcome=await options.model.propose({input,candidates:available,matrix:subset,currentPlan:context.currentPlan,task:context.surgical?'swap':context.currentPlan?.execution?.length?'repair':context.currentPlan?'modify':'create'});
        diagnostics.reasoning=outcome.metrics;
        if(outcome.proposal){const errors=proposalIdentityErrors(outcome.proposal,available);if(errors.length){outcome.metrics.status='rejected';outcome.metrics.validationErrors=errors;}else proposedSequence=outcome.proposal.stops.map(s=>s.place_id);}
      }
      let selected:ScheduledStop[]=[];
      // Only finalists need extra detail calls. Recheck after hours/status refresh, then resequence.
      for(let attempt=0;attempt<4;attempt++) {
        if(options.clock){const now=outingClock(request.timeZone,request.startingPlace,options.clock());if(request.date<now.date)return fail('This date has already passed. Choose today or a future date.');if(request.date===now.date)input.start=Math.max(input.start,toMinutes(now.time));diagnostics.openWindows=findWindows(input,existing);}
        const available=pool.filter(c=>!excluded.has(c.id));
        const indices=[0,...available.map(c=>pool.indexOf(c)+1)];
        const subset={points:indices.map(i=>matrix.points[i]),legs:indices.map(i=>indices.map(j=>matrix.legs[i][j]))};
        let result=schedule(input,available,subset,proposedSequence);
        if(proposedSequence&&(result.conflict||result.stops.length!==proposedSequence.length)){
          diagnostics.reasoning!.status='rejected';diagnostics.reasoning!.validationErrors=['REALITY_CONFLICT'];proposedSequence=undefined;result=schedule(input,available,subset);
        }
        diagnostics.rejected.push(...result.rejected);
        if(result.conflict&&context.retainedStops?.length&&!context.surgical) {
          const flexible=available.map(c=>c.protection==='PLANNER_FLEXIBLE'?{...c,userStopId:null}:c);
          result=schedule(input,flexible,subset);diagnostics.rejected.push(...result.rejected);
        }
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
      if(options.clock){const now=outingClock(request.timeZone,request.startingPlace,options.clock());if(request.date===now.date&&toMinutes(now.time)>input.start){input.start=toMinutes(now.time);const available=pool.filter(c=>!excluded.has(c.id));const indices=[0,...available.map(c=>pool.indexOf(c)+1)];const refreshed=schedule(input,available,{points:indices.map(i=>matrix.points[i]),legs:indices.map(i=>indices.map(j=>matrix.legs[i][j]))},proposedSequence);if(refreshed.conflict)return fail(refreshed.conflict);if(refreshed.stops.some(s=>!s.candidate.hoursChecked))return fail('Time moved forward while checking places. Please build again to refresh the outing.');selected=refreshed.stops;diagnostics.openWindows=findWindows(input,existing);}}
      const final=finalConflicts(request,selected);if(final.length){if(diagnostics.reasoning&&proposedSequence){diagnostics.reasoning.status='rejected';diagnostics.reasoning.validationErrors=['FINAL_REALITY_CONFLICT'];}return fail(final.join(' '));}
      const costEstimate=selected.reduce((sum,s)=>sum+s.candidate.cost.value,0);
      const end=selected.at(-1)!.departure;
      const returnTravel=request.returnToStart?matrix.legs[pool.findIndex(c=>c.id===selected.at(-1)!.candidate.id)+1]?.[0]:undefined;
      const finish=end+(returnTravel?.minutes??0)+(returnTravel?.distanceMetres?10:0);
      const quality=[
        {lens:'EXPERIENCE_SUPPLY' as const,issues:selected.flatMap(s=>s.candidate.qualification&&!s.candidate.qualification.accepted?[s.candidate.qualification.detail]:[])},
        {lens:'EXPERIENCE_COMPOSITION' as const,issues:proposedSequence?[]:selected.flatMap((s,i)=>!s.candidate.userStopId&&!(input.intent.repeatRoles??[]).includes(s.candidate.role)&&selected.slice(0,i).some(p=>roleFamily(p.candidate.role)===roleFamily(s.candidate.role))?['An automatic stop repeats an experience unnecessarily.']:[])},
        {lens:'INTENT_FIDELITY' as const,issues:[...(input.intent.experienceAnchors??[]).filter(a=>!selected.some(s=>s.candidate.role===a.role&&qualifyPlace(s.candidate.place,a.search).accepted)).map(a=>'The '+a.experience+' experience is missing.'),...(context.retainedStops??[]).filter(s=>['USER_KEPT','USER_FIXED','USER_PLACE'].includes(s.protection??'')&&!selected.some(p=>p.candidate.id===s.id)).map(()=> 'A protected place was not preserved.')]},
        {lens:'REAL_WORLD_ACCURACY' as const,issues:[...(input.intent.finishPolicy==='hard'&&finish>input.desiredFinish?['The required finish would be missed.']:[]),...(input.intent.hardCapCents!==null&&costEstimate>input.intent.hardCapCents?['The hard budget cap would be exceeded.']:[])]}
      ].map(q=>({...q,passed:!q.issues.length}));diagnostics.quality=quality;
      if(quality.some(q=>!q.passed))return fail(quality.flatMap(q=>q.issues).join(' '));
      if(proposedSequence&&diagnostics.reasoning)diagnostics.reasoning.status='accepted';
      const warnings=new Set<string>(diagnostics.warnings);
      warnings.add('Costs use category estimates or Google price signals, not verified menu or ticket prices. Parking, passes and other shared costs may be extra.');
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
        const c=s.candidate;
        if(c.protection==='PLANNER_FLEXIBLE'&&input.intent.experienceAnchors?.some(a=>a.role===c.role&&qualifyPlace(c.place,a.search).accepted))c.protection='EXPERIENCE_ANCHOR';
        c.hoursStatus=openingStatus(c,request.date,s.arrival,s.departure);
        const notes=visitWarnings(c.category,c.hoursStatus);
        const reason=c.protection==='USER_KEPT'?'You kept this place. The rest of the outing works around it.':c.userStopId&&!c.userStopId.startsWith('retained:')?'You chose this place. The rest of the outing works around it.':c.role==='meal'?'A meal stop close to the rest of your outing.':c.role==='main-activity'?input.intent.mood==='active'?'An active stop that fits your available time.':'One main activity to give the outing a little momentum.':c.role==='walk-explore'?'An easy outdoor pause with no planned purchase.':c.role==='dessert'?index===selected.length-1?'A short, relaxed ending after the main part of your outing.':'A short sweet break that fits between your other plans.':'A relaxed stop that complements your other plans.';
        return {id:c.id,userStopId:c.userStopId?.startsWith('retained:')?null:c.userStopId,place:c.place,role:c.role,category:c.category,arrival:clock(s.arrival),departure:clock(s.departure),arrivalDayOffset:timelineDay(s.arrival),departureDayOffset:timelineDay(s.departure),fixed:c.fixed,exactTime:c.fixedStart!==null,exactEnd:c.fixedEnd!==null,duration:{...c.duration,value:s.departure-s.arrival},cost:c.cost,travel:s.travel,transitionMinutes:s.bufferMinutes,waitMinutes:s.waitMinutes,reason,note:c.note,warnings:notes,protection:c.protection,qualification:c.qualification,hoursStatus:c.hoursStatus};
      });
      diagnostics.selected=selected;diagnostics.warnings=[...warnings];diagnostics.assumptions=[...new Set(selected.flatMap(s=>s.candidate.estimateNotes)),'Origin/stop coordinates may represent the center of a mapped area.',input.intent.finishPolicy==='hard'?'The required finish is enforced, including a return journey when requested.':'The desired finish is a target with a 15-minute allowance; fixed commitments remain exact.'];
      return {result:{status:'complete',message:null,primaryItinerary:{stops,start:clock(input.start),finish:clock(finish),finishDayOffset:timelineDay(finish),costPerPersonCents:cost,costRangeCents:{low:selected.reduce((s,c)=>s+c.candidate.cost.low,0),high:selected.reduce((s,c)=>s+c.candidate.cost.high,0)},travelMinutes:stops.reduce((s,c)=>s+c.travel.minutes,0)+(returnTravel?.minutes??0),...(returnTravel?{returnTravel}:{}),hasUnknownCosts:stops.some(s=>s.cost.status==='UNKNOWN_COST'||s.cost.sharedCosts?.some(c=>c.amountCents===null)),sharedCosts:stops.flatMap(s=>s.cost.sharedCosts??[]),warnings:[...warnings]}},diagnostics};
    }catch(error) {return fail(error instanceof Error?error.message:'Real places or travel could not load. Your choices are safe. Please try again.');}
  }};
}
