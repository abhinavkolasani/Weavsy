import type { CandidatePlace, ExperienceRole, ProductEstimate } from './types.ts';
import type { ExistingStop, PlanningRequest } from '../planning/types.ts';
import type { PlaceReference } from '../world/types.ts';
import { stopTiming } from '../planning/timeline.ts';
const estimate=(value:number,low:number,high:number,note:string):ProductEstimate=>({value,low,high,source:'category-estimate',note});
export function candidateFromPlace(place:PlaceReference, user?:ExistingStop, timingContext:Pick<PlanningRequest,'availableStartTime'>={availableStartTime:'00:00'}):CandidatePlace {
  const timing=user?stopTiming(timingContext,user):null;
  let type=place.primary_type??'unknown';
  if(place.provider==='google'&&['diner','bistro','food_court','snack_bar','meal_delivery','meal_takeaway'].includes(type))type='fast_food';
  if(type==='movie_theater')type='cinema';
  if(type==='amusement_park')type='theme_park';
  if(type==='coffee_shop')type='cafe';
  if(place.provider==='google'&&(place.additional_types.includes('fast_food_restaurant')||/sandwich_shop|pizza_restaurant/.test(type)))type='fast_food';
  let role:ExperienceRole='casual-activity', category='Visit',cost=estimate(1500,0,3000,'General visit allowance; admission is unknown.'),duration=estimate(60,45,90,'General visit duration.');
  let tags=['relaxed'];
  if(/restaurant|fast_food/.test(type)) {role='meal';category=/fast_food/.test(type)?'Casual food':'Restaurant';cost=/fast_food/.test(type)?estimate(1500,1000,2200,'Casual meal allowance; menu prices are not verified.'):estimate(2800,2000,4000,'Restaurant meal allowance; menu prices are not verified.');duration=/fast_food/.test(type)?estimate(45,30,60,'Typical casual meal.'):estimate(75,60,90,'Typical sit-down meal.');}
  else if(/ice_cream|bakery|dessert_shop/.test(type)) {role='dessert';category='Dessert';cost=estimate(800,500,1400,'Dessert allowance; prices are not verified.');duration=estimate(30,20,45,'Typical dessert stop.');}
  else if(/cafe/.test(type)) {role='coffee';category='Café';cost=estimate(800,400,1400,'Drink and snack allowance; prices are not verified.');duration=estimate(35,25,50,'Typical coffee stop.');}
  else if(/bowling/.test(type)) {role='main-activity';category='Bowling';cost=estimate(2500,1800,4000,'Bowling allowance including possible rental; rates are not verified.');duration=estimate(80,60,100,'Typical bowling visit.');tags=['fun','active'];}
  else if(/cinema/.test(type)) {role='main-activity';category='Cinema';cost=estimate(1800,1400,2600,'Ticket allowance; showtimes and prices need confirmation.');duration=estimate(130,100,160,'Typical film plus arrival time; no actual showtime was selected.');tags=['fun','cinema'];}
  else if(/sports|fitness/.test(type)) {role='main-activity';category='Active activity';cost=estimate(2000,1000,3500,'Activity allowance; public access and rates need confirmation.');duration=estimate(75,60,100,'Typical active visit.');tags=['active'];}
  else if(/museum/.test(type)) {role='main-activity';category='Museum';cost=estimate(1800,0,3000,'Museum admission allowance; tickets are not verified.');duration=estimate(80,60,110,'Typical museum visit.');tags=['relaxed','culture'];}
  else if(/park|garden|viewpoint/.test(type)&&type!=='theme_park') {role='walk-explore';category='Walk / outdoors';cost=estimate(0,0,1000,'No planned purchase; entry or parking fees may apply.');duration=estimate(50,35,75,'Easy walk and time to look around.');tags=['relaxed','outdoors','active'];}
  else if(/mall|shop:/.test(type)) {role='shopping-browse';category='Browse';cost=estimate(0,0,0,'Browsing only; purchases excluded.');duration=estimate(45,30,75,'Time to browse.');}
  else if(/theme_park/.test(type)) {role='main-activity';category='Theme park';cost=estimate(13000,8000,20000,'Theme-park allowance; ticket prices are not verified.');duration=estimate(240,180,360,'A short theme-park visit.');tags=['fun','active'];}
  else if(/bar|pub/.test(type)) {role='drinks';category='Drinks';cost=estimate(1800,1000,3000,'Drink allowance; prices are not verified.');duration=estimate(60,40,90,'Typical drinks stop.');}
  if(user) {
    const minutes=user.durationMinutes??(timing&&timing.start!==null&&timing.end!==null?timing.end-timing.start:null);
    if(minutes!==null)duration={value:minutes,low:minutes,high:minutes,source:'user',note:'Duration entered by you.'};
  }
  return {id:place.provider_place_id,place,category,role,cost,duration,vibeTags:tags,interestTags:tags,sourceConfidence:place.provider==='google'?'provider-identity':'community-identity',openingInformation:null,hoursChecked:false,estimateNotes:[cost.note,duration.note],userStopId:user?.id??null,fixed:user?.fixed??false,fixedStart:user?.fixed?timing!.start:null,fixedEnd:user?.fixed?timing!.end:null,preferredStart:timing?.start??null,note:user?.note??null};
}
