import type { Coordinates } from '../src/world/types.ts';
import type { Transportation } from '../src/planning/types.ts';
import type { RouteEstimate, RouteMatrix, RoutingService } from '../src/routing/types.ts';
import { validCoordinates } from '../src/world/reference.ts';
import { WorldError } from './worldProvider.ts';
const point=(p:Coordinates)=>({location:{latLng:{latitude:p.latitude,longitude:p.longitude}}});
export function decodePolyline(encoded:string):number[][] {
  let i=0,lat=0,lng=0;const coords:number[][]=[];
  const part=()=>{let shift=0,value=0,b:number;do{if(i>=encoded.length||shift>30)throw new WorldError('The route line returned incomplete data.',503);b=encoded.charCodeAt(i++)-63;value|=(b&31)<<shift;shift+=5;}while(b>=32);return value&1?~(value>>1):value>>1;};
  while(i<encoded.length){lat+=part();lng+=part();coords.push([lng/1e5,lat/1e5]);}return coords;
}
/** Real driving/walking network durations, without a live traffic or transit scheduler. */
export function createGoogleRouting(options:{key?:string;fetcher?:typeof fetch}={}):RoutingService {
  const key=options.key??process.env.GOOGLE_MAPS_SERVER_KEY,fetcher=options.fetcher??fetch;
  function check(points:Coordinates[],mode:Transportation){if(!['driving','walking','transit'].includes(mode)||points.length<1||points.length>15||points.some(p=>!validCoordinates(p)))throw new WorldError('Travel requires valid selected locations.',400);if(mode==='transit')throw new WorldError('Transit scheduling is not connected yet. Choose driving for this version.',400);}
  const routeMode=(mode:Transportation)=>mode==='driving'?'DRIVE':'WALK';
  const estimate=(duration:unknown,distance:unknown,mode:Transportation):RouteEstimate|null=>{
    const seconds=typeof duration==='string'&&/^\d+(?:\.\d+)?s$/.test(duration)?Number(duration.slice(0,-1)):NaN;
    if(!Number.isFinite(seconds)||typeof distance!=='number'||!Number.isFinite(distance)||distance<0)return null;
    return {minutes:Math.ceil(seconds/60),distanceMetres:Math.round(distance),requestedMode:mode,actualMode:mode==='driving'?'driving':'walking',source:distance===0?'same-location':'google-routes'};
  };
  async function call(path:string,mask:string,body:unknown):Promise<any> {
    if(!key)throw new WorldError('Driving estimates are not configured yet. Your choices are safe.',503);
    let r:Response;try{r=await fetcher('https://routes.googleapis.com/'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':mask},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});}catch{throw new WorldError('Driving estimates couldn’t load. Your fixed choices are safe. Please try again.',503);}
    if(!r.ok)throw new WorldError(r.status===403?'Google Routes could not authenticate. Check the API setup and key restrictions.':'Driving estimates are unavailable right now. Please try again.',503);
    try{return await r.json();}catch{throw new WorldError('Driving estimates returned unreadable data. Please try again.',503);}
  }
  return {
    async getMatrix(points,mode):Promise<RouteMatrix> {
      check(points,mode);
      const legs:RouteMatrix['legs']=points.map((_,i)=>points.map((__,j)=>i===j?estimate('0s',0,mode):null));
      if(points.length===1)return{points,legs};
      const data=await call('distanceMatrix/v2:computeRouteMatrix','originIndex,destinationIndex,status,condition,duration,distanceMeters',{origins:points.map(p=>({waypoint:point(p)})),destinations:points.map(p=>({waypoint:point(p)})),travelMode:routeMode(mode),...(mode==='driving'?{routingPreference:'TRAFFIC_UNAWARE'}:{})});
      if(!Array.isArray(data))throw new WorldError('Driving estimates returned incomplete data.',503);
      const seen=new Set<string>();
      for(const d of data){const i=d.originIndex??0,j=d.destinationIndex??0;if(!Number.isInteger(i)||!Number.isInteger(j)||i<0||j<0||i>=points.length||j>=points.length)throw new WorldError('Driving estimates returned invalid endpoints.',503);seen.add(i+':'+j);if(d.condition==='ROUTE_EXISTS'&&!(d.status?.code))legs[i][j]=estimate(d.duration??(i===j?'0s':null),d.distanceMeters??(i===j?0:null),mode);}
      if(seen.size!==points.length**2)throw new WorldError('Driving estimates returned an incomplete matrix.',503);
      return {points,legs};
    },
    async getRouteEstimate(origin,destination,mode) {
      check([origin,destination],mode);
      if(origin.latitude===destination.latitude&&origin.longitude===destination.longitude)return estimate('0s',0,mode);
      const data=await call('directions/v2:computeRoutes','routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline',{origin:point(origin),destination:point(destination),travelMode:routeMode(mode),...(mode==='driving'?{routingPreference:'TRAFFIC_UNAWARE'}:{}),polylineQuality:'OVERVIEW',polylineEncoding:'ENCODED_POLYLINE'});
      const r=data.routes?.[0];if(!r)return null;const result=estimate(r.duration,r.distanceMeters,mode);
      if(result&&typeof r.polyline?.encodedPolyline==='string')result.geometry={type:'LineString',coordinates:decodePolyline(r.polyline.encodedPolyline)};
      return result;
    },
  };
}
