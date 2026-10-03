import type { PlanningDraft, PlanningRequest } from '../planning/types.ts';
import type { PlannerState } from '../planning/state.ts';
import { initialState, isPlanningDraft, restoreState } from '../planning/state.ts';
import { isGooglePlaceId } from './reference.ts';
import type { PlaceDetails } from './types.ts';
/** Durable user intent + Google IDs. Google names/addresses/hours are refreshed, not archived. */
export function durableDraft<T extends PlanningDraft|PlanningRequest>(input:T):T {
  const draft=structuredClone(input);
  if(draft.startingPlace?.provider==='google'){
    (draft as PlanningDraft).pendingStartingPlaceId=draft.startingPlace.provider_place_id;
    draft.startingLocation='';draft.startingPlace=null;
  }
  draft.existingStops=draft.existingStops.map(stop=>stop.place?.provider==='google'?{...stop,pendingPlaceId:stop.place.provider_place_id,name:'',place:null}:stop) as T['existingStops'];
  return draft;
}
export function serializeSession(state:PlannerState) {
  const hasGoogle=state.draft.startingPlace?.provider==='google'||state.draft.pendingStartingPlaceId||state.draft.existingStops.some(s=>s.place?.provider==='google'||s.pendingPlaceId);
  if(!hasGoogle)return JSON.stringify(state);
  return JSON.stringify({version:2,screen:'form',draft:durableDraft(state.draft)});
}
export async function hydrateSession(raw:string|null,getDetails:(id:string)=>Promise<PlaceDetails>):Promise<{state:PlannerState;warning:string}> {
  let saved:any;try{saved=JSON.parse(raw??'null');}catch{return{state:initialState(),warning:''};}
  if(saved?.version!==2)return{state:restoreState(raw),warning:''};
  if(!isPlanningDraft(saved.draft))return{state:initialState(),warning:''};
  const draft:PlanningDraft=structuredClone(saved.draft);
  const ids=[draft.pendingStartingPlaceId,...draft.existingStops.map(s=>s.pendingPlaceId)].filter(isGooglePlaceId);
  if(ids.length>24)return{state:{...initialState(),draft},warning:'Your saved choices need to be selected again before planning. Times and notes are still here.'};
  const refreshed=new Map<string,PlaceDetails>();let failed=false;
  for(let i=0;i<ids.length;i+=4)await Promise.all(ids.slice(i,i+4).map(async id=>{try{refreshed.set(id,await getDetails(id));}catch{failed=true;}}));
  const start=draft.pendingStartingPlaceId?refreshed.get(draft.pendingStartingPlaceId):null;
  if(start){draft.startingPlace=start.place;draft.startingLocation=start.place.display_name;delete draft.pendingStartingPlaceId;}
  draft.existingStops=draft.existingStops.map(s=>{const d=s.pendingPlaceId?refreshed.get(s.pendingPlaceId):null;if(!d)return s;const next={...s,place:d.place,name:d.place.display_name};delete next.pendingPlaceId;return next;});
  return{state:{version:1,screen:'form',draft,submission:null},warning:failed?'Some saved places couldn’t refresh. Your times and notes are still here. Select those places again before planning.':''};
}
