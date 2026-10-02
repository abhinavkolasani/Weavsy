import type { Coordinates, PlaceDetails, PlaceReference, PlaceSearch, PlaceSearchType, SearchResult, WorldProvider, OsmType } from '../src/world/types.ts';
import { parsePlaceId, validCoordinates } from '../src/world/reference.ts';
import { normalizeOpeningHours } from '../src/world/openingHours.ts';
export class WorldError extends Error {
  status: number;
  constructor(message: string, status = 503) {super(message);this.status=status;}
}
type JsonRecord = Record<string, any>;
const LA = {latitude:34.0522,longitude:-118.2437};
const typeCodes: Record<string,OsmType> = {N:'node',W:'way',R:'relation'};
const categories: Record<PlaceSearchType,string[]> = {
  food:['osm.amenity.restaurant','osm.amenity.fast_food'], cafe:['osm.amenity.cafe'],
  dessert:['osm.amenity.ice_cream','osm.shop.bakery','osm.amenity.cafe'],
  bowling:['osm.leisure.bowling_alley'], activity:['osm.leisure.sports_centre','osm.leisure.fitness_centre','osm.tourism.museum'],
  shopping:['osm.shop.mall'],park:['osm.leisure.park'],
};
const text = (v: unknown): string | null => typeof v === 'string' && !!v.trim() ? v.trim() : null;
function address(properties: JsonRecord): string | null {
  return [...new Set([ [properties.housenumber,properties.street].filter(Boolean).join(' '), properties.city || properties.district || properties.locality || properties.county, properties.state, properties.postcode, properties.country ].filter(v=>typeof v==='string'&&v))].join(', ') || null;
}
export function normalizePhoton(feature: JsonRecord, fetchedAt: string): PlaceReference | null {
  const p=feature?.properties, coordinates=feature?.geometry?.coordinates;
  if (!p || !Array.isArray(coordinates)) return null;
  const type=typeCodes[p.osm_type], id=String(p.osm_id), name=text(p.name) || text(p.street);
  if (!type || !name || !parsePlaceId(`${type}/${id}`)) return null;
  const point={latitude:coordinates[1],longitude:coordinates[0]}; if (!validCoordinates(point)) return null;
  const primary=p.osm_key && p.osm_value ? `${p.osm_key}:${p.osm_value}` : null;
  return {provider:'openstreetmap',provider_place_id:`${type}/${id}`,display_name:name,formatted_address:address(p),...point,primary_type:primary,additional_types:primary?[primary]:[],fetched_at:fetchedAt,data_status:'community',provider_metadata:{osm_type:type,osm_id:id,lookup_source:'photon',geometry_kind:type==='node'?'point':'representative_point',details_status:'not_requested'}};
}
export function inferSearchType(query: string): PlaceSearchType | undefined {
  const category=query.trim().replace(/^(?:casual|sit-down|cheap|nearby)\s+/i,'');
  if (/^bowling(?: alley)?s?$/i.test(category)) return 'bowling';
  if (/^(?:desserts?|ice cream|baker(?:y|ies))$/i.test(category)) return 'dessert';
  if (/^(?:caf[eé]s?|coffee)$/i.test(category)) return 'cafe';
  if (/^(?:food|dinner|lunch|restaurants?)$/i.test(category)) return 'food';
  if (/^(?:parks?|viewpoints?)$/i.test(category)) return 'park';
  if (/^(?:shopping|malls?)$/i.test(category)) return 'shopping';
  if (/^(?:activity|activities|things to do|museums?|sports)$/i.test(category)) return 'activity';
  return undefined;
}
export function distanceMetres(a:Coordinates,b:Coordinates) { const r=Math.PI/180,dlat=(b.latitude-a.latitude)*r,dlon=(b.longitude-a.longitude)*r; const h=Math.sin(dlat/2)**2+Math.cos(a.latitude*r)*Math.cos(b.latitude*r)*Math.sin(dlon/2)**2;return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h)); }
export function createWorldProvider(options: {photonUrl?:string;overpassUrl?:string;fetcher?:typeof fetch;now?:()=>number;intervalMs?:number} = {}): WorldProvider & {resolveReferences(ids:string[],hints?:PlaceReference[]):Promise<Map<string,PlaceReference>>} {
  const fetcher=options.fetcher ?? fetch, now=options.now ?? Date.now;
  const photon=options.photonUrl ?? process.env.PHOTON_URL ?? 'https://photon.komoot.io';
  const overpass=options.overpassUrl ?? process.env.OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter';
  const cache=new Map<string,{expires:number;value:any}>(), references=new Map<string,PlaceReference>();
  const inflight=new Map<string,Promise<any>>();
  let nextPhoton=0, nextOverpass=0, pending=0, blockedUntil=0, dailyDetails=0, day=Math.floor(now()/86400000);
  const clone=<T>(v:T):T=>structuredClone(v);
  function remember(place:PlaceReference) {if(references.size>=500) references.delete(references.keys().next().value!);references.set(place.provider_place_id,clone(place));}
  function recentReference(id:string) {const place=references.get(id);return place&&now()-Date.parse(place.fetched_at)<15*60*1000?place:undefined;}
  async function json(url:string,kind:'photon'|'overpass'):Promise<any> {
    const saved=cache.get(url);if(saved&&saved.expires>now())return clone(saved.value);
    if(inflight.has(url)) return clone(await inflight.get(url)!);
    if(now()<blockedUntil) throw new WorldError('Place search is taking a break. Please try again in a minute.',429);
    if(pending>=4) throw new WorldError('Place search is busy. Please try again shortly.',429);
    const work=(async()=>{
      pending++;
      try {
        if(kind==='overpass') {const today=Math.floor(now()/86400000);if(today!==day){day=today;dailyDetails=0;}if(++dailyDetails>80)throw new WorldError('Place details have reached today’s prototype limit. Search still works; try details again tomorrow.',429);}
        const next=kind==='photon'?nextPhoton:nextOverpass, delay=Math.max(0,next-now());
        if(kind==='photon')nextPhoton=Math.max(now(),nextPhoton)+(options.intervalMs ?? 1000);else nextOverpass=Math.max(now(),nextOverpass)+(options.intervalMs ?? 3000);
        if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
        let response:Response;
        try {response=await fetcher(url,{signal:AbortSignal.timeout(kind==='photon'?12000:10000),headers:{'User-Agent':'OutingPlannerPrototype/0.1 (local founder prototype)','Accept':'application/json'}});}catch{throw new WorldError('Couldn’t reach place search. Your outing details are safe. Please try again.');}
        if(response.status===429||response.status===406){blockedUntil=now()+60000;throw new WorldError('Place search is busy. Please try again in a minute.',429);}
        if(!response.ok)throw new WorldError('Place information is unavailable right now. Please try again.');
        let result:any;try{result=await response.json();}catch{throw new WorldError('Place search returned an unreadable response. Please try again.');}
        if(cache.size>=150)cache.delete(cache.keys().next().value!);
        cache.set(url,{expires:now()+15*60*1000,value:clone(result)});return result;
      }finally{pending--;}
    })();inflight.set(url,work);try{return clone(await work);}finally{inflight.delete(url);}
  }
  function photonUrl(path:string,query?:string,bias?:Coordinates) {const url=new URL(path,photon);if(query)url.searchParams.set('q',query);url.searchParams.set('lang','en');url.searchParams.set('limit','8');if(bias){url.searchParams.set('lat',String(bias.latitude));url.searchParams.set('lon',String(bias.longitude));if(path==='/api/')url.searchParams.set('location_bias_scale','1');}return url;}
  async function photonPlaces(url:URL):Promise<PlaceReference[]> {const data=await json(url.href,'photon');if(!Array.isArray(data.features))throw new WorldError('Place search returned incomplete data. Please try again.');const places=data.features.map((f:any)=>normalizePhoton(f,new Date(now()).toISOString())).filter((p:PlaceReference|null):p is PlaceReference=>!!p);const unique=[...new Map<string,PlaceReference>(places.map((p:PlaceReference)=>[p.provider_place_id,p])).values()];unique.forEach(remember);return clone(unique);}
  async function autocomplete(query:string,bias?:Coordinates) {if(typeof query!=='string'||query.trim().length<2||query.length>200)throw new WorldError('Enter between 2 and 200 characters to search.',400);if(bias!==undefined&&!validCoordinates(bias))throw new WorldError('Choose a valid search location.',400);return photonPlaces(photonUrl('/api/',query.trim(),bias));}
  async function getPlaceDetails(placeId:string):Promise<PlaceDetails> {
    const parsed=parsePlaceId(placeId);if(!parsed)throw new WorldError('That place identifier is invalid. Search and select the place again.',400);
    const known=recentReference(placeId);
    try {
      const url=new URL(overpass);url.searchParams.set('data',`[out:json][timeout:8];${parsed.type}(${parsed.id});out center tags;`);
      const data=await json(url.href,'overpass');if(!Array.isArray(data.elements))throw new WorldError('Place details are incomplete. Please try again.');
      const element=data.elements.find((e:any)=>e.type===parsed.type&&String(e.id)===parsed.id);
      if(!element) {references.delete(placeId);throw new WorldError('This place is no longer available. Search for it again.',404);}
      const tags=element.tags??{};
      if(tags.disused==='yes'||tags.abandoned==='yes'||tags['disused:amenity']||tags['abandoned:amenity']||tags['disused:shop']||tags['abandoned:shop']){references.delete(placeId);throw new WorldError('This place is marked unavailable. Please choose another place.',410);}
      const point=known??{latitude:element.lat??element.center?.lat,longitude:element.lon??element.center?.lon};
      const name=text(tags['name:en'])||text(tags.name)||known?.display_name;
      if(!name||!validCoordinates(point))throw new WorldError('This place is missing a name or location. Please choose another result.',422);
      const typeKey=['amenity','leisure','tourism','shop','place','natural'].find(k=>tags[k]);
      const primary=typeKey?`${typeKey}:${tags[typeKey]}`:known?.primary_type??null;
      const place:PlaceReference={provider:'openstreetmap',provider_place_id:placeId,display_name:name,formatted_address:known?.formatted_address??address({housenumber:tags['addr:housenumber'],street:tags['addr:street'],city:tags['addr:city'],state:tags['addr:state'],postcode:tags['addr:postcode'],country:tags['addr:country']}),latitude:point.latitude,longitude:point.longitude,primary_type:primary,additional_types:['amenity','leisure','tourism','shop','sport','place'].filter(k=>tags[k]).map(k=>`${k}:${tags[k]}`),fetched_at:new Date(now()).toISOString(),data_status:'community',provider_metadata:{osm_type:parsed.type,osm_id:parsed.id,lookup_source:'overpass',geometry_kind:parsed.type==='node'?'point':'representative_point',details_status:'available'}};
      remember(place);
      const website=text(tags.website)||text(tags['contact:website']);
      return {place,opening_hours:normalizeOpeningHours(text(tags.opening_hours)??undefined),website:website&&/^https?:\/\//i.test(website)?website:null,business_status:'listed',estimated_cost_per_person:null,typical_duration_minutes:null,warnings:['Community map data may be incomplete. Confirm opening hours with the place before going.']};
    }catch(error){
      if(error instanceof WorldError&&[400,404,410,422].includes(error.status))throw error;
      if(!known)throw error;
      const place=clone(known);place.provider_metadata.details_status='unavailable';
      remember(place);
      return {place,opening_hours:null,website:null,business_status:'listed',estimated_cost_per_person:null,typical_duration_minutes:null,warnings:['The place was found, but extra details could not be loaded. Hours and prices are unknown.']};
    }
  }
  async function searchPlaces(search:PlaceSearch):Promise<SearchResult> {
    if(!search||typeof search.query!=='string'||search.query.trim().length<2||search.query.length>200)throw new WorldError('Enter a place name or category to search.',400);
    if(search.location!==undefined&&!validCoordinates(search.location))throw new WorldError('Choose a valid search location.',400);
    if(search.openAt!==undefined||search.pricePreference!==undefined)throw new WorldError('Open-at-time and price filters are not supported by this source yet.',400);
    const limit=search.limit??8, radius=search.radius??15000;
    if(!Number.isInteger(limit)||limit<1||limit>10||!Number.isFinite(radius)||radius<100||radius>50000)throw new WorldError('Use 1–10 results and a radius between 100 m and 50 km.',400);
    if(search.types&&(!Array.isArray(search.types)||search.types.length>3||search.types.some(t=>!Object.hasOwn(categories,t))))throw new WorldError('Choose a supported place category.',400);
    let query=search.query.trim(), context=search.location;
    const near=/^(.+?)\s+(?:near|in)\s+(.+)$/i.exec(query);
    let area=near?.[2];
    if(near)query=near[1];
    else {
      // A small category/area grammar, e.g. "casual dinner Cypress".
      // Named businesses with no category prefix remain literal name searches.
      const words=query.split(/\s+/);
      for(let i=words.length-1;i>=1;i--) {
        const prefix=words.slice(0,i).join(' ');
        if(inferSearchType(prefix)){query=prefix;area=words.slice(i).join(' ');break;}
      }
    }
    if(area){const locations=await autocomplete(area,context??LA);const location=locations.find(p=>p.primary_type?.startsWith('place:'))??locations[0];if(!location)return {places:[],context:null,warnings:['No matching search area was found. Select a location and try again.']};context={latitude:location.latitude,longitude:location.longitude};}
    const type=search.types?.[0]??inferSearchType(query);
    if(type) {
      const focus=context??LA,url=photonUrl('/reverse/',undefined,focus);url.searchParams.set('radius',String(radius/1000));url.searchParams.set('limit',String(limit));
      const requested=search.types?.length?search.types:[type];
      // Photon uses OR within one comma-separated filter and AND across repeated filters.
      url.searchParams.set('include',[...new Set(requested.flatMap(kind=>categories[kind]))].join(','));
      const places=(await photonPlaces(url)).filter(p=>distanceMetres(focus,p)<=radius).sort((a,b)=>distanceMetres(focus,a)-distanceMetres(focus,b)).slice(0,limit);
      return {places,context:focus,warnings:['Search uses community map categories. Prices, durations and live availability are unknown.']};
    }
    const places=(await autocomplete(query,context)).slice(0,limit);
    return {places,context:context??null,warnings:[]};
  }
  return {autocompleteLocation:autocomplete,autocompletePlace:autocomplete,searchPlaces,getPlaceDetails,
    getRouteEstimate:async()=>{throw new WorldError('Route estimates are not available yet.',501);},
    async resolveReferences(ids:string[],hints:PlaceReference[]=[]) {
      const result=new Map<string,PlaceReference>();
      for(const id of new Set(ids)) {
        if(!parsePlaceId(id))throw new WorldError('An outing place identifier is invalid. Select the place again.',400);
        let known=recentReference(id);
        // After a server restart, re-resolve saved selections from the live source.
        // Caller names/coordinates are search hints only; the returned ID must match.
        const hint=hints.find(place=>place.provider_place_id===id);
        if(!known&&hint&&!references.has(id)) {
          try {known=(await autocomplete(hint.display_name,hint)).find(place=>place.provider_place_id===id);}catch{/* Exact-ID details may still be available. */}
        }
        result.set(id,clone(known??(await getPlaceDetails(id)).place));
      }
      return result;
    },
  };
}
