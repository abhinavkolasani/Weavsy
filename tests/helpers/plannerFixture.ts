import { emptyDraft,newStop } from '../../src/planning/draft.ts';
import { normalizeGooglePlace } from '../../server/googleProvider.ts';
export function fixture() {
  const raw=(id:string,type:string)=>({id,displayName:{text:'TEST stored '+id},formattedAddress:'TEST private provider address',location:{latitude:33.82,longitude:-118.04},primaryType:type,types:[type],businessStatus:'OPERATIONAL',addressComponents:[{types:['country'],shortText:'US'}],regularOpeningHours:{periods:[{open:{day:0,hour:0}}]}});
  const places=[raw('TEST_SAVE_ORIGIN','locality'),raw('TEST_SAVE_FOOD','fast_food_restaurant'),raw('TEST_SAVE_DESSERT','ice_cream_shop'),raw('TEST_SAVE_OTHER','ice_cream_shop'),raw('TEST_SAVE_BOWLING','bowling_alley')];
  let calls=0,fail=false;
  const fetcher:typeof fetch=async(url,init)=>{calls++;if(fail)throw new Error('TEST provider outage');const body=init?.body?JSON.parse(init.body as string):null;
    if(String(url).includes('computeRouteMatrix'))return Response.json(body.origins.flatMap((_:any,i:number)=>body.destinations.map((__:any,j:number)=>({originIndex:i,destinationIndex:j,condition:'ROUTE_EXISTS',duration:i===j?'0s':'300s',distanceMeters:i===j?0:1500}))));
    if(String(url).includes('searchNearby'))return Response.json({places:places.filter(p=>body.includedPrimaryTypes.includes(p.primaryType))});
    const found=places.find(p=>String(url).includes('/places/'+p.id));return found?Response.json(found):Response.json({}, {status:404});
  };
  const origin=normalizeGooglePlace(places[0]).place,meal=normalizeGooglePlace(places[1]).place;
  const draft={...emptyDraft(),startingPlace:origin,startingLocation:origin.display_name,date:'2026-10-10',availableStartTime:'16:00',requiredEndTime:'23:00',budgetPerPerson:'40',groupSize:'5',transportation:'driving',vibeInterests:'dinner dessert activity',startingState:'reservation',existingStops:[{...newStop(true),name:meal.display_name,place:meal,startTime:'19:00',timingDetail:'end-time',endTime:'19:45',note:'Keep this exact dinner'}]};
  return {fetcher,draft,now:()=>new Date('2026-10-09T12:00:00Z'),get calls(){return calls;},set fail(v:boolean){fail=v;}};
}
export const apiRequest=(path:string,body?:any,key='')=>new Request('https://outing.test'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Plan-Key':key},...(body===undefined?{}:{body:JSON.stringify(body)})});

