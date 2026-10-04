import type { PlanningRequest } from '../planning/types.ts';
import type { PlannerIntent, ExperienceRole } from './types.ts';
import type { PlaceSearchType } from '../world/types.ts';
export interface IntentNormalizer { normalize(request:PlanningRequest):PlannerIntent }
export function experienceIntent(text:string):{search:PlaceSearchType;role:ExperienceRole}|null {
  const t=text.toLowerCase();
  if(/beach|ocean|seaside/.test(t))return {search:'beach',role:'scenic-relax'};
  if(/ice cream|dessert|sweet/.test(t))return {search:'dessert',role:'dessert'};
  if(/coffee|caf[eé]/.test(t))return {search:'cafe',role:'coffee'};
  if(/bowling/.test(t))return {search:'bowling',role:'main-activity'};
  if(/movie|flick|cinema/.test(t))return {search:'cinema',role:'main-activity'};
  if(/museum|art/.test(t))return {search:'museum',role:'main-activity'};
  if(/dinner|food|meal|lunch|breakfast|brunch|eat/.test(t))return {search:'food',role:'meal'};
  if(/walk|outdoor|park|sunset|scenic/.test(t))return {search:'park',role:'walk-explore'};
  if(/shop|browse/.test(t))return {search:'shopping',role:'shopping-browse'};
  if(/drink|bar|cocktail/.test(t))return {search:'drinks',role:'drinks'};
  if(/active|sport|game|fun|play/.test(t))return {search:'activity',role:'main-activity'};
  return null;
}
/** Small replaceable language boundary. Unrecognized intent is surfaced, never fabricated. */
export const lightweightIntent:IntentNormalizer={normalize(request){
  const text=[request.vibeInterests,...(request.selectedInterests??[])].join(' ').toLowerCase();
  const active=/active|adventur|sport|hike|exercise/.test(text),relaxed=/chill|calm|lowkey|low.key|relax|hang|cute|date|walk/.test(text);
  const roles:ExperienceRole[]=[],searches:PlaceSearchType[]=[];
  const add=(role:ExperienceRole,search:PlaceSearchType)=>{if(!roles.includes(role))roles.push(role);if(!searches.includes(search))searches.push(search);};
  if(/food|dinner|lunch|eat|meal|breakfast|brunch/.test(text)||!(/coffee|caf[eé]|walk|outdoor|park|beach|museum|movie|flick/.test(text)))add('meal','food');
  if(/movie|flick|cinema/.test(text)&&Number(request.availableStartTime.slice(0,2))>=11)add('meal','food');
  if(/beach|ocean/.test(text))add('scenic-relax','beach');
  else if(/walk|outdoor|park|sunset|scenic|explore/.test(text)||relaxed)add('walk-explore','park');
  if(/movie|flick|cinema/.test(text))add('main-activity','cinema');
  else if(/museum|art/.test(text))add('main-activity','museum');
  else if(active)add('main-activity','activity');
  else if(/fun|bowl|play|game/.test(text)&&!relaxed)add('main-activity','bowling');
  if(/dessert|sweet|ice cream/.test(text))add('dessert','dessert');
  if(/coffee|caf[eé]/.test(text))add('coffee','cafe');
  if(/drink|cocktail|bar/.test(text))add('drinks','drinks');
  if(/shop|browse/.test(text))add('shopping-browse','shopping');
  if(roles.length===1){if(!relaxed&&!/coffee|caf[eé]|crawl/.test(text))add('dessert','dessert');else if(!roles.includes('walk-explore')&&!roles.includes('scenic-relax'))add('walk-explore','park');}
  if(!roles.length){add('meal','food');add('walk-explore','park');}
  const anchors=request.existingStops.filter(s=>s.entryKind==='activity').flatMap(s=>{const e=experienceIntent(s.experience??s.name);if(!e)return[];add(e.role,e.search);return[{id:s.id,experience:s.experience??s.name,...e}];});
  const cap=/(?:hard cap(?: of)?|no more than|maximum|max budget|do not (?:go over|exceed)|don['’]?t (?:go over|exceed))\s*\$?\s*(\d+(?:\.\d{1,2})?)/i.exec(text);
  const repeats:ExperienceRole[]=[];
  if(/coffee crawl|cafe crawl|caf[eé] crawl/.test(text))repeats.push('coffee');
  if(/food crawl|restaurant hop/.test(text))repeats.push('meal');
  if(/dessert crawl/.test(text))repeats.push('dessert');
  return {mood:active?'active':relaxed?'relaxed':'playful',interests:[...(active?['active']:[]),...(relaxed?['relaxed']:[]),...(/movie|flick/.test(text)?['cinema']:[]),...(/fun|bowl/.test(text)?['fun']:[]),...(/walk|outdoor|park|beach/.test(text)?['outdoors']:[])],desiredRoles:roles,searches,budgetPolicy:cap||request.budgetIsCap?'hard-cap':'target',hardCapCents:cap?Math.round(Number(cap[1])*100):request.budgetIsCap?request.budgetCapPerPersonCents??request.budgetPerPerson.amountCents:null,finishPolicy:request.finishIsHard||request.returnToStart?'hard':'target',experienceAnchors:anchors,repeatRoles:repeats,dinnerFirst:/dinner first|meal first|eat first/.test(text),lessDriving:/less driving|closer together/.test(text)};
}};
export function interestSuggestions(start:string):string[]{const hour=Number(start.slice(0,2));return hour<11?['Breakfast / brunch','Coffee','Outdoors','Walk around','Shopping','Museum','Relaxed']:hour<16?['Lunch','Coffee','Museum','Something active','Walk around','Shopping','Chill']:['Dinner','Beach','Dessert','Sunset','Walk around','Something active','Chill','Coffee','Movie','Drinks'];}
