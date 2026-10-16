import type { PlaceReference, PlaceSearchType } from '../world/types.ts';
import type { ExperienceRole, PlaceQualification } from './types.ts';
/** Identity is necessary, but never sufficient evidence of a consumer experience. */
export function qualifyPlace(place:PlaceReference, expected?:PlaceSearchType, explicitlyChosen=false):PlaceQualification {
  const primary=place.primary_type?.split(':').pop()??null;
  const types=[primary,...place.additional_types.map(t=>t.split(':').pop())].filter((t):t is string=>!!t);
  const deny=/prison|detention|courthouse|government|police|fire_station|city_hall|embassy|corporate_office|business_center|office|hospital|medical|school|university|residential|apartment|housing|street_address|route|intersection|premise|subpremise/;
  const denied=types.find(t=>deny.test(t));
  const base={providerType:primary,category:'Unclassified',role:'casual-activity' as ExperienceRole,confidence:'low' as const};
  if(place.provider_metadata.business_status?.startsWith('CLOSED'))return {...base,accepted:false,reason:'CLOSED_BUSINESS',detail:'Provider reports the venue as closed.'};
  // Explicit pickups/appointments may use non-leisure entities, without recommending them as leisure.
  if(denied) return explicitlyChosen?{...base,category:'Your commitment',accepted:true,confidence:'medium',reason:null,detail:'An explicitly chosen non-leisure commitment; no consumer-experience claim.'}:{...base,accepted:false,reason:'NON_CONSUMER_DESTINATION',detail:'Provider type identifies a non-consumer destination: '+denied};
  let role:ExperienceRole='casual-activity',category='Visit',match:string|undefined;
  const informative=primary&&!['point_of_interest','establishment','food','store','unknown'].includes(primary);
  const pick=(pattern:RegExp)=>(informative?[primary]:types).find(t=>pattern.test(t));
  if((match=pick(/^(ice_cream_shop|ice_cream|bakery|dessert_shop|dessert_restaurant|donut_shop|cake_shop|confectionery|candy_store)$/))){role='dessert';category='Dessert';}
  else if((match=pick(/^library$/))){role='study';category='Library / study';}
  else if((match=pick(/^(cafe|coffee_shop|coffee_stand|tea_house)$/))){role='coffee';category='Coffee';}
  else if((match=pick(/restaurant$|^fast_food$|^diner$|^bistro$|^food_court$|^meal_takeaway$|^meal_delivery$|^deli$|^sandwich_shop$/))){role='meal';category=/fast_food|sandwich|pizza|meal_|food_court|diner/.test(match)?'Casual food':'Restaurant';}
  else if((match=pick(/^beach$/))){role='scenic-relax';category='Beach';}
  else if((match=pick(/^fishing_pier$/))){role='walk-explore';category='Waterfront / pier';}
  else if((match=pick(/^bowling_alley$/))){role='main-activity';category='Bowling';}
  else if((match=pick(/^movie_theater$|^cinema$/))){role='main-activity';category='Cinema';}
  else if((match=pick(/museum|aquarium|art_gallery/))){role='main-activity';category='Museum';}
  else if((match=pick(/^amusement_park$|^theme_park$/))){role='main-activity';category='Theme park';}
  else if((match=pick(/amusement_center|video_arcade|miniature_golf|go_karting|sports_complex|sports_activity_location|fitness_center|ice_skating|hiking_area/))){role='main-activity';category='Active activity';}
  else if((match=pick(/^bar$|^pub$|^wine_bar$|^cocktail_bar$|^brewpub$/))){role='drinks';category='Drinks';}
  else if((match=pick(/^shopping_mall$|^department_store$|^book_store$|^shop:/))){role='shopping-browse';category='Browse';}
  else if((match=pick(/^park$|^city_park$|^state_park$|^national_park$|^garden$|^botanical_garden$|^plaza$|^viewpoint$|^scenic_spot$|^observation_deck$/))){role='walk-explore';category='Walk / outdoors';}
  else if((match=pick(/concert_hall|performing_arts_theater|event_venue|historical_landmark|cultural_landmark|tourist_attraction/))){role='casual-activity';category='Visit';}
  if(!match) return {...base,accepted:false,reason:types.length?'LOW_PLACE_CONFIDENCE':'INSUFFICIENT_PLACE_DATA',detail:'No usable consumer-destination type. Generic map identity alone is not enough.'};
  const compatible:Record<PlaceSearchType,ExperienceRole[]>={food:['meal'],'casual-food':['meal'],cafe:['coffee'],dessert:['dessert'],beach:['scenic-relax'],park:['walk-explore'],museum:['main-activity'],bowling:['main-activity'],cinema:['main-activity'],activity:['main-activity'],shopping:['shopping-browse'],drinks:['drinks'],study:['study']};
  const exactCategory=expected&&({museum:'Museum',bowling:'Bowling',cinema:'Cinema'} as Partial<Record<PlaceSearchType,string>>)[expected];
  if(expected&&(!compatible[expected].includes(role)||(exactCategory&&category!==exactCategory)))return {providerType:primary,category,role,confidence:'medium',accepted:false,reason:'ROLE_MISMATCH',detail:'Actual venue category does not serve the requested '+expected+' experience.'};
  return {providerType:primary,category,role,confidence:primary===match?'high':'medium',accepted:true,reason:null,detail:primary===match?'Primary provider type supports this role.':'A specific secondary provider type supports this role.'};
}
export function roleFamily(role:ExperienceRole) {
  if(['coffee','dessert'].includes(role))return 'refreshment';
  if(['walk-explore','scenic-relax'].includes(role))return 'outdoors';
  return role;
}
