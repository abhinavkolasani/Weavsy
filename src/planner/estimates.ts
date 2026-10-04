import type { CandidatePlace, ProductEstimate } from './types.ts';
import type { ExistingStop, PlanningRequest } from '../planning/types.ts';
import type { PlaceReference } from '../world/types.ts';
import { stopTiming } from '../planning/timeline.ts';
import { qualifyPlace } from './qualification.ts';
const estimate=(value:number,low:number,high:number,note:string):ProductEstimate=>({value,low,high,source:'category-estimate',status:'ESTIMATED_COST',note});
export function candidateFromPlace(place:PlaceReference,user?:ExistingStop,timingContext:Pick<PlanningRequest,'availableStartTime'>={availableStartTime:'00:00'}):CandidatePlace {
  const timing=user?stopTiming(timingContext,user):null;
  const qualification=qualifyPlace(place,undefined,!!user);
  const {role,category}=qualification;
  let cost=estimate(1500,0,3000,'Admission is unknown; $15 is a planning estimate, not a quoted price.'),duration=estimate(60,45,90,'General visit length estimate.'),tags=['relaxed'];
  switch(category) {
    case 'Casual food':cost=estimate(1500,1000,2200,'Category estimate for a casual meal; menu prices are not verified.');duration=estimate(45,30,60,'Typical casual meal.');break;
    case 'Restaurant':cost=estimate(2800,2000,4000,'Category estimate for a sit-down meal; menu prices are not verified.');duration=estimate(75,60,90,'Typical sit-down meal.');break;
    case 'Dessert':cost=estimate(800,500,1400,'Category estimate for dessert; prices are not verified.');duration=estimate(30,20,45,'Typical dessert stop.');break;
    case 'Coffee':cost=estimate(800,400,1400,'Category estimate for a drink and snack.');duration=estimate(35,25,50,'Typical coffee stop.');break;
    case 'Bowling':cost=estimate(2500,1800,4000,'Category estimate including possible shoe rental; rates are unverified.');duration=estimate(80,60,100,'Typical bowling visit.');tags=['fun','active'];break;
    case 'Cinema':cost=estimate(1800,1400,2600,'Ticket estimate; actual showtimes and prices need checking.');duration=estimate(130,100,160,'Film-length estimate, not a selected showtime.');tags=['fun','cinema'];break;
    case 'Active activity':cost=estimate(2000,1000,3500,'Activity estimate; check public access and rates.');duration=estimate(75,60,100,'Typical activity visit.');tags=['active'];break;
    case 'Museum':cost=estimate(1800,0,3000,'Admission estimate; actual tickets have not been checked.');duration=estimate(80,60,110,'Typical museum visit.');tags=['relaxed','culture'];break;
    case 'Beach':case 'Walk / outdoors':cost={...estimate(500,0,1500,'Admission is unknown and may be free. $5 is a planning reserve, not an entry fee.'),status:'UNKNOWN_COST',sharedCosts:[{label:'Parking / passes',status:'UNKNOWN_COST',amountCents:null}]};duration=category==='Beach'?estimate(45,30,75,'Time at the beach, with travel counted separately.'):estimate(50,35,75,'Easy walk with time to look around.');tags=['relaxed','outdoors','active',...(category==='Beach'?['beach']:[])];break;
    case 'Browse':cost={...estimate(0,0,0,'Browsing with no planned purchases. Admission and parking have not been verified.'),status:'UNKNOWN_COST',sharedCosts:[{label:'Parking',status:'UNKNOWN_COST',amountCents:null}]};duration=estimate(45,30,75,'Time to browse.');break;
    case 'Theme park':cost=estimate(13000,8000,20000,'Ticket estimate; actual prices have not been checked.');duration=estimate(240,180,360,'A short theme-park visit.');tags=['fun','active'];break;
    case 'Drinks':cost=estimate(1800,1000,3000,'Category estimate for drinks.');duration=estimate(60,40,90,'Typical drinks stop.');break;
    default:cost.status='UNKNOWN_COST';
  }
  const price=place.provider_metadata.price_signal;
  // Price levels/ranges are a signal, never a ticket quote or proof of free admission.
  if(price&&['meal','dessert','coffee','drinks'].includes(role)) {
    const bands:Record<string,[number,number,number]>={PRICE_LEVEL_INEXPENSIVE:[1500,1000,2000],PRICE_LEVEL_MODERATE:[2800,2000,4000],PRICE_LEVEL_EXPENSIVE:[5500,4000,8000],PRICE_LEVEL_VERY_EXPENSIVE:[10000,7000,15000]};
    const band=price.level?bands[price.level]:undefined;
    const low=price.low_cents??band?.[1],high=price.high_cents??band?.[2];
    if(low!==undefined&&high!==undefined&&high>=low&&high>0)cost={value:Math.round((low+high)/2),low,high,source:'provider-price-signal',status:'PROVIDER_PRICE_SIGNAL',note:'Estimate guided by Google’s price signal, not a verified menu total; extras may cost more.'};
  }
  if(user){const minutes=user.durationMinutes??(timing&&timing.start!==null&&timing.end!==null?timing.end-timing.start:null);if(minutes!==null)duration={value:minutes,low:minutes,high:minutes,source:'user',note:'Duration entered by you.'};}
  return {id:place.provider_place_id,place,category,role,cost,duration,vibeTags:tags,interestTags:tags,sourceConfidence:place.provider==='google'?'provider-identity':'community-identity',openingInformation:null,hoursChecked:false,estimateNotes:[cost.note,duration.note],userStopId:user?.id??null,fixed:user?.fixed??false,fixedStart:user?.fixed?timing!.start:null,fixedEnd:user?.fixed?timing!.end:null,preferredStart:timing?.start??null,note:user?.note??null,qualification,protection:user?.protection??(user?'USER_FIXED':'PLANNER_FLEXIBLE'),hoursStatus:'HOURS_UNKNOWN'};
}
