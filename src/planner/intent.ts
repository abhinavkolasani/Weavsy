import type { PlanningRequest } from '../planning/types.ts';
import type { PlannerIntent, ExperienceRole } from './types.ts';
import type { PlaceSearchType } from '../world/types.ts';
export interface IntentNormalizer { normalize(request:PlanningRequest):PlannerIntent }
/** Replaceable interpretation boundary: small, explicit mappings, no model/network dependency. */
export const lightweightIntent:IntentNormalizer = {normalize(request) {
  const text=request.vibeInterests.toLowerCase();
  const active=/active|adventur|sport|hike|exercise/.test(text);
  const relaxed=/chill|lowkey|low.key|relax|hang|cute|date|walk/.test(text);
  const movies=/flick|movie|cinema/.test(text);
  const fun=/fun|bowl|play|game/.test(text);
  const dessert=/dessert|sweet|ice cream/.test(text);
  const coffee=/coffee|caf[eé]/.test(text);
  const walk=/walk|outdoor|park|scenic/.test(text);
  const roles:ExperienceRole[]=[];const searches:PlaceSearchType[]=[];
  const add=(role:ExperienceRole,search:PlaceSearchType)=>{roles.push(role);searches.push(search);};
  const start=Number(request.availableStartTime.slice(0,2));
  const food=/food|dinner|lunch|eat|meal/.test(text)||(!coffee && !walk && !movies);
  if(food)add('meal','food');
  if(movies)add('main-activity','cinema');
  else if(active)add('main-activity','activity');
  else if(fun&&!relaxed)add('main-activity','bowling');
  else if(walk||relaxed||roles.length===0)add('walk-explore','park');
  else if(roles.length===1)add('dessert','dessert');
  if(coffee)add('coffee','cafe');
  if(dessert&&!roles.includes('dessert'))add('dessert','dessert');
  if(roles.length===1 && !food && start>=11 && /fun|flick|active/.test(text)) {roles.unshift('meal');searches.unshift('food');}
  const cap=/(?:hard cap(?: of)?|no more than|maximum|max budget)\s*\$?\s*(\d+(?:\.\d{1,2})?)/i.exec(text);
  return {mood:active?'active':relaxed?'relaxed':'playful',interests:[...(active?['active']:[]),...(relaxed?['relaxed']:[]),...(movies?['cinema']:[]),...(fun?['fun']:[]),...(walk?['outdoors']:[])],desiredRoles:[...new Set(roles)].slice(0,3),searches:[...new Set(searches)].slice(0,3),budgetPolicy:cap?'hard-cap':'target',hardCapCents:cap?Math.round(Number(cap[1])*100):null,finishPolicy:'target'};
}};
