import type { Coordinates, OpeningHours, PlaceDetails, PlaceReference, PlaceSearch, PlaceSearchType, PlaceSuggestion, WorldProvider } from '../src/world/types.ts';
import { WEEKDAYS } from '../src/world/types.ts';
import { isGooglePlaceId, validCoordinates } from '../src/world/reference.ts';
import { WorldError, distanceMetres, inferSearchType } from './worldProvider.ts';

export const IDENTITY_FIELDS='id,displayName,formattedAddress,location,primaryType,primaryTypeDisplayName,types,businessStatus,addressComponents,googleMapsUri,attributions,utcOffsetMinutes';
// Hours already require Enterprise. Price signals use that same field tier; no reviews/photos/Atmosphere.
export const PLANNING_FIELDS=IDENTITY_FIELDS+',regularOpeningHours,currentOpeningHours,priceLevel,priceRange';
const GOOGLE_TYPES:Record<PlaceSearchType,string[]>={
  food:['restaurant'], 'casual-food':['fast_food_restaurant','sandwich_shop','pizza_restaurant'],
  cafe:['cafe','coffee_shop'], dessert:['ice_cream_shop','bakery','dessert_shop'],
  bowling:['bowling_alley'], cinema:['movie_theater'],
  activity:['bowling_alley','museum','sports_complex'], shopping:['shopping_mall'], park:['park'],
  beach:['beach'],museum:['museum'],drinks:['bar'],study:['library'],
};
type Raw = Record<string,any>;
const time=(n:number)=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
const dateKey=(d:Raw)=>d&&Number.isInteger(d.year)&&Number.isInteger(d.month)&&Number.isInteger(d.day)?String(d.year)+'-'+String(d.month).padStart(2,'0')+'-'+String(d.day).padStart(2,'0'):null;
const shift=(date:string,days:number)=>new Date(Date.parse(date+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);
const minutes=(point:Raw)=>point&&Number.isInteger(point.hour)&&point.hour>=0&&point.hour<=23&&Number.isInteger(point.minute??0)&&(point.minute??0)>=0&&(point.minute??0)<60?point.hour*60+(point.minute??0):null;
function normalizePriceSignal(raw:Raw):PlaceReference['provider_metadata']['price_signal'] {
  const cents=(money:Raw)=>money&&money.currencyCode==='USD'&&Number.isFinite(Number(money.units??0))&&Number(money.units??0)>=0?Math.round(Number(money.units??0)*100+Number(money.nanos??0)/1e7):undefined;
  const low=cents(raw.priceRange?.startPrice),high=cents(raw.priceRange?.endPrice);
  return raw.priceLevel||low!==undefined||high!==undefined?{...(typeof raw.priceLevel==='string'?{level:raw.priceLevel}:{}),...(low!==undefined||high!==undefined?{currency:'USD',low_cents:low,high_cents:high}:{})}:undefined;
}
/** Split overnight periods so the scheduler can test full visits without guessing hours. */
export function normalizeGoogleHours(raw:Raw,fetchedAt:string):OpeningHours|null {
  const regular=raw.regularOpeningHours;
  let weekly:OpeningHours['weekly']=null;
  if(Array.isArray(regular?.periods)) {
    weekly=Object.fromEntries(WEEKDAYS.map(day=>[day,[] as {opens:string;closes:string}[]])) as NonNullable<OpeningHours['weekly']>;
    for(const p of regular.periods) {
      if(p.open?.day===0&&p.open.hour===0&&!p.close){WEEKDAYS.forEach(day=>weekly![day]=[{opens:'00:00',closes:'24:00'}]);break;}
      const start=minutes(p.open),end=minutes(p.close);
      if(start===null||end===null||!Number.isInteger(p.open.day)||!Number.isInteger(p.close.day)){weekly=null;break;}
      const from=p.open.day*1440+start;
      let to=p.close.day*1440+end;if(to<=from)to+=7*1440;
      if(to-from>7*1440){weekly=null;break;}
      for(let cursor=from;cursor<to;){const next=Math.min(to,(Math.floor(cursor/1440)+1)*1440);const day=WEEKDAYS[(Math.floor(cursor/1440)%7+6)%7];weekly[day].push({opens:time(cursor%1440),closes:time(next-cursor+cursor%1440)});cursor=next;}
    }
  }
  const current=raw.currentOpeningHours;let dated:OpeningHours['dated'];
  if(Array.isArray(current?.periods)&&Number.isFinite(raw.utcOffsetMinutes)) {
    const today=new Date(Date.parse(fetchedAt)+raw.utcOffsetMinutes*60000).toISOString().slice(0,10);
    dated=Object.fromEntries(Array.from({length:7},(_,i)=>[shift(today,i),[]]));
    if(current.periods.some((p:Raw)=>p.open?.day===0&&p.open.hour===0&&!p.close))Object.keys(dated).forEach(d=>dated![d]=[{opens:'00:00',closes:'24:00'}]);
    else for(const p of current.periods) {
      const begin=dateKey(p.open?.date),finish=dateKey(p.close?.date),a=minutes(p.open),b=minutes(p.close);
      if(!begin||!finish||a===null||b===null){dated=undefined;break;}
      for(let d=begin,n=0;d<=finish&&n<8;d=shift(d,1),n++){if(dated[d])dated[d].push({opens:time(d===begin?a:0),closes:time(d===finish?b:1440)});}
    }
  }
  if(!weekly&&!dated)return null;
  return {source_expression:(regular?.weekdayDescriptions??current?.weekdayDescriptions??[]).filter((s:unknown)=>typeof s==='string').join('; '),weekly,...(dated?{dated}:{})};
}
export function normalizeGooglePlace(raw:Raw,fetchedAt=new Date().toISOString()):PlaceDetails {
  if(!isGooglePlaceId(raw.id))throw new WorldError('The place returned an invalid identifier. Select another result.',422);
  const country=raw.addressComponents?.find((c:Raw)=>c.types?.includes('country'))?.shortText;
  if(country!=='US')throw new WorldError('This version supports places in the United States. Choose a US location.',422);
  const name=raw.displayName?.text??raw.formattedAddress;
  if(typeof name!=='string'||!name.trim()||!validCoordinates(raw.location))throw new WorldError('The place is missing its name or location. Choose another result.',422);
  const place:PlaceReference={
    provider:'google',provider_place_id:raw.id,display_name:name,formatted_address:typeof raw.formattedAddress==='string'?raw.formattedAddress:null,
    latitude:raw.location.latitude,longitude:raw.location.longitude,primary_type:typeof raw.primaryType==='string'?raw.primaryType:null,
    additional_types:Array.isArray(raw.types)?raw.types.filter((s:unknown)=>typeof s==='string'):[],fetched_at:fetchedAt,data_status:'provider',
    provider_metadata:{lookup_source:'google-places-new',geometry_kind:'point',details_status:'available',country_code:'US',business_status:raw.businessStatus,
      maps_uri:typeof raw.googleMapsUri==='string'?raw.googleMapsUri:undefined,utc_offset_minutes:raw.utcOffsetMinutes,
      primary_type_label:typeof raw.primaryTypeDisplayName?.text==='string'?raw.primaryTypeDisplayName.text:undefined,
      price_signal:normalizePriceSignal(raw),
      attributions:(raw.attributions??[]).filter((a:Raw)=>typeof a.provider==='string'&&typeof a.providerUri==='string').map((a:Raw)=>({display_name:a.provider,uri:a.providerUri}))},
  };
  const hours=normalizeGoogleHours(raw,fetchedAt);
  return {place,opening_hours:hours,website:null,business_status:raw.businessStatus?.startsWith('CLOSED')?'unavailable':'listed',estimated_cost_per_person:null,typical_duration_minutes:null,warnings:hours?[]:['Hours weren’t available here — worth checking before you go.']};
}
/** Request-scoped world access. Provider content is not retained in a permanent catalog. */
export function createGoogleWorldProvider(options:{key?:string;fetcher?:typeof fetch;now?:()=>Date}={}):WorldProvider&{resolveReferences(ids:string[],hints?:PlaceReference[]):Promise<Map<string,PlaceReference>>} {
  const key=options.key??process.env.GOOGLE_MAPS_SERVER_KEY,fetcher=options.fetcher??fetch,now=options.now??(()=>new Date());
  const details=new Map<string,PlaceDetails>(),inflight=new Map<string,Promise<PlaceDetails>>();
  async function call(path:string,mask:string,body?:Raw):Promise<Raw> {
    if(!key)throw new WorldError('Place search is not configured yet. Your outing details are safe.',503);
    let response:Response;
    try{response=await fetcher('https://places.googleapis.com/v1/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':mask},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(8000)});}catch{throw new WorldError('Couldn’t reach place search. Your choices are safe. Please try again.',503);}
    const data=await response.json().catch(()=>null);
    if(!response.ok){if(response.status===404)throw new WorldError('This place is no longer available. Your choice has not been replaced.',404);if(response.status===429)throw new WorldError('Place search is busy. Please try again shortly.',429);if(response.status===403||response.status===401)throw new WorldError('Google place search could not authenticate. Check the API setup and key restrictions.',503);throw new WorldError('Place information is unavailable right now. Please try again.',503);}
    if(!data||typeof data!=='object')throw new WorldError('Place search returned incomplete data. Please try again.',503);
    return data;
  }
  const queryCheck=(query:string)=>{if(typeof query!=='string'||query.trim().length<2||query.length>200)throw new WorldError('Enter between 2 and 200 characters to search.',400);};
  const tokenCheck=(token?:string)=>{if(token!==undefined&&(typeof token!=='string'||!/^[A-Za-z0-9_-]{1,36}$/.test(token)))throw new WorldError('Restart this place search and try again.',400);};
  async function autocomplete(query:string,bias?:Coordinates,sessionToken?:string):Promise<PlaceSuggestion[]> {
    queryCheck(query);tokenCheck(sessionToken);
    if(bias!==undefined&&!validCoordinates(bias))throw new WorldError('Choose a valid search location.',400);
    const data=await call('places:autocomplete','suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat,suggestions.placePrediction.text.text',{input:query.trim(),includedRegionCodes:['us'],languageCode:'en',...(sessionToken?{sessionToken}:{}),...(bias?{locationBias:{circle:{center:{latitude:bias.latitude,longitude:bias.longitude},radius:30000}}}:{})});
    if(!Array.isArray(data.suggestions)&&data.suggestions!==undefined)throw new WorldError('Place search returned incomplete suggestions.',503);
    return (data.suggestions??[]).flatMap((s:Raw)=>{const p=s.placePrediction;if(!p||!isGooglePlaceId(p.placeId))return[];const name=p.structuredFormat?.mainText?.text??p.text?.text;if(typeof name!=='string')return[];return[{provider:'google' as const,provider_place_id:p.placeId,display_name:name,formatted_address:p.structuredFormat?.secondaryText?.text??null}];}).slice(0,5);
  }
  async function getPlaceDetails(id:string,sessionToken?:string):Promise<PlaceDetails> {
    if(!isGooglePlaceId(id))throw new WorldError('Select this place again from Google search. Existing times and notes stay yours.',400);
    tokenCheck(sessionToken);
    if(!sessionToken&&details.has(id))return structuredClone(details.get(id)!);
    if(!sessionToken&&inflight.has(id))return structuredClone(await inflight.get(id)!);
    // Google can resolve an old/address ID to its current canonical ID. Only
    // trust this direct details response; never substitute a text-search match.
    const work=call('places/'+encodeURIComponent(id)+(sessionToken?'?sessionToken='+encodeURIComponent(sessionToken):''),sessionToken?IDENTITY_FIELDS:PLANNING_FIELDS).then(raw=>{const normalized=normalizeGooglePlace(raw,now().toISOString());details.set(id,normalized);details.set(normalized.place.provider_place_id,normalized);return normalized;});
    inflight.set(id,work);try{return structuredClone(await work);}finally{inflight.delete(id);}
  }
  async function searchPlaces(search:PlaceSearch) {
    queryCheck(search?.query);
    if(search.location!==undefined&&!validCoordinates(search.location))throw new WorldError('Choose a valid search location.',400);
    const limit=search.limit??8,radius=search.radius??15000;
    if(!Number.isInteger(limit)||limit<1||limit>10||!Number.isFinite(radius)||radius<100||radius>50000)throw new WorldError('Use 1–10 results and a radius between 100 m and 50 km.',400);
    if(search.types?.some(t=>!GOOGLE_TYPES[t]))throw new WorldError('Choose a supported place category.',400);
    if(search.openAt!==undefined||search.pricePreference!==undefined)throw new WorldError('Date-specific hours and price preferences are applied by planning, not by this search.',400);
    const type=search.types?.[0]??inferSearchType(search.query);
    let raw:Raw;
    const center=search.location??{latitude:34.0522,longitude:-118.2437};
    if(type&&search.location)raw=await call('places:searchNearby',PLANNING_FIELDS.split(',').map(f=>'places.'+f).join(','),{includedPrimaryTypes:[...new Set((search.types??[type]).flatMap(t=>GOOGLE_TYPES[t]))],maxResultCount:limit,rankPreference:'DISTANCE',locationRestriction:{circle:{center:{latitude:center.latitude,longitude:center.longitude},radius}},languageCode:'en'});
    else raw=await call('places:searchText',PLANNING_FIELDS.split(',').map(f=>'places.'+f).join(','),{textQuery:search.query,languageCode:'en',regionCode:'us',pageSize:limit,...(type?{includedType:GOOGLE_TYPES[type][0],strictTypeFiltering:true}:{}),includePureServiceAreaBusinesses:false,locationBias:{circle:{center:{latitude:center.latitude,longitude:center.longitude},radius}}});
    const places:PlaceReference[]=[];
    for(const p of raw.places??[])try{const d=normalizeGooglePlace(p,now().toISOString());if(type&&search.location&&distanceMetres(center,d.place)>radius)continue;details.set(d.place.provider_place_id,d);places.push(d.place);}catch(e){if(!(e instanceof WorldError&&[410,422].includes(e.status)))throw e;}
    return {places:[...new Map(places.map(p=>[p.provider_place_id,p])).values()].slice(0,limit),context:search.location??null,warnings:[]};
  }
  return {autocompleteLocation:autocomplete,autocompletePlace:autocomplete,searchPlaces,getPlaceDetails,
    async getPlaceDetailsMany(ids){const result=new Map<string,{ok:true;details:PlaceDetails}|{ok:false;status:number;message:string}>();for(let i=0;i<ids.length;i+=4)await Promise.all(ids.slice(i,i+4).map(async id=>{try{result.set(id,{ok:true,details:await getPlaceDetails(id)});}catch(e){result.set(id,{ok:false,status:e instanceof WorldError?e.status:503,message:e instanceof Error?e.message:'Place details unavailable'});}}));return result;},
    async resolveReferences(ids){const result=new Map<string,PlaceReference>();await Promise.all([...new Set(ids)].map(async id=>result.set(id,(await getPlaceDetails(id)).place)));return result;},
    async getRouteEstimate(){throw new WorldError('Travel is provided through the routing service.',501);},
  };
}
