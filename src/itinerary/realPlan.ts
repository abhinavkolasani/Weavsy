import type { PlaceReference } from '../world/types.ts';
import type { ProductEstimate, ExperienceRole } from '../planner/types.ts';
import type { RouteEstimate } from '../routing/types.ts';
import { isPlaceReference } from '../world/reference.ts';
export interface OutingStop {
  id:string; userStopId:string|null; place:PlaceReference; role:ExperienceRole; category:string;
  arrival:string; departure:string; fixed:boolean; exactTime:boolean; exactEnd:boolean;
  arrivalDayOffset?:0|1; departureDayOffset?:0|1;
  duration:ProductEstimate; cost:ProductEstimate; travel:RouteEstimate; transitionMinutes:number;
  waitMinutes:number; reason:string; note:string|null; warnings:string[];
}
export interface RealItinerary {
  stops:OutingStop[]; start:string; finish:string;
  finishDayOffset?:0|1;
  costPerPersonCents:number; costRangeCents:{low:number;high:number}; travelMinutes:number;
  warnings:string[];
}
export type RealPlanResult = {status:'complete';primaryItinerary:RealItinerary;message:null} | {status:'no-plan'|'clarification';primaryItinerary:null;message:string};
/** Session contents are untrusted. Reject broken results rather than crashing the renderer. */
export function isRealPlanResult(value:unknown):value is RealPlanResult {
  if(!value||typeof value!=='object')return false;
  const v=value as Record<string,any>;
  if(v.status==='no-plan'||v.status==='clarification')return v.primaryItinerary===null&&typeof v.message==='string';
  if(v.status!=='complete'||v.message!==null||!v.primaryItinerary)return false;
  const p=v.primaryItinerary;
  const time=(s:unknown)=>typeof s==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(s);
  const num=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
  const day=(n:unknown)=>n===undefined||n===0||n===1;
  const estimate=(e:any)=>e&&['value','low','high'].every(k=>num(e[k]))&&['category-estimate','user'].includes(e.source)&&typeof e.note==='string';
  if(!day(p.finishDayOffset)||!Array.isArray(p.stops)||p.stops.some((s:any)=>!s||!day(s.arrivalDayOffset)||!day(s.departureDayOffset)))return false;
  return time(p.start)&&time(p.finish)&&num(p.costPerPersonCents)&&num(p.travelMinutes)&&num(p.costRangeCents?.low)&&num(p.costRangeCents?.high)&&Array.isArray(p.warnings)&&p.warnings.every((w:unknown)=>typeof w==='string')&&Array.isArray(p.stops)&&p.stops.length>0&&p.stops.every((s:any)=>s&&typeof s.id==='string'&&(s.userStopId===null||typeof s.userStopId==='string')&&isPlaceReference(s.place)&&time(s.arrival)&&time(s.departure)&&typeof s.fixed==='boolean'&&typeof s.exactTime==='boolean'&&typeof s.category==='string'&&typeof s.role==='string'&&typeof s.reason==='string'&&(s.note===null||typeof s.note==='string')&&estimate(s.cost)&&estimate(s.duration)&&s.travel&&num(s.travel.minutes)&&num(s.travel.distanceMetres)&&['driving','walking'].includes(s.travel.actualMode)&&num(s.transitionMinutes)&&num(s.waitMinutes)&&Array.isArray(s.warnings)&&s.warnings.every((w:unknown)=>typeof w==='string'));
}
