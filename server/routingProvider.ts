import type { Coordinates } from '../src/world/types.ts';
import type { Transportation } from '../src/planning/types.ts';
import type { RouteEstimate, RouteMatrix, RoutingService } from '../src/routing/types.ts';
import { validCoordinates } from '../src/world/reference.ts';
import { WorldError } from './worldProvider.ts';

/** Separate car/foot servers actually use different road graphs; the URL profile alone doesn't. */
export function createRoutingService(options: {fetcher?:typeof fetch; intervalMs?:number; carUrl?:string; footUrl?:string} = {}): RoutingService {
  const fetcher = options.fetcher ?? fetch;
  const car = options.carUrl ?? process.env.OSRM_CAR_URL ?? 'https://routing.openstreetmap.de/routed-car';
  const foot = options.footUrl ?? process.env.OSRM_FOOT_URL ?? 'https://routing.openstreetmap.de/routed-foot';
  const cache = new Map<string, {at:number; data:any}>();
  const inflight = new Map<string, Promise<any>>();
  let next = 0;
  async function request(url:string) {
    const saved=cache.get(url); if(saved && Date.now()-saved.at<15*60_000)return structuredClone(saved.data);
    if(inflight.has(url))return structuredClone(await inflight.get(url));
    const work=(async()=>{
      const delay=Math.max(0,next-Date.now()); next=Math.max(next,Date.now())+(options.intervalMs??1100);
      if(delay)await new Promise(r=>setTimeout(r,delay));
      try {
        const response=await fetcher(url,{signal:AbortSignal.timeout(7000),headers:{'User-Agent':'OutingPlannerPrototype/0.1 (local founder prototype)','Accept':'application/json'}});
        if(!response.ok)throw new Error();
        const data=await response.json();
        if(data.code!=='Ok')throw new Error();
        if(cache.size>=100)cache.delete(cache.keys().next().value!);
        cache.set(url,{at:Date.now(),data:structuredClone(data)});return data;
      }catch{throw new WorldError('Travel estimates couldn’t load. Your fixed choices are safe. Please try again.',503);}
    })();inflight.set(url,work);try{return structuredClone(await work);}finally{inflight.delete(url);}
  }
  const base=(mode:Transportation)=>mode==='driving'?car:foot;
  const coordinates=(points:Coordinates[])=>points.map(p=>`${p.longitude},${p.latitude}`).join(';');
  function check(points:Coordinates[],mode:Transportation) {
    if(!['driving','walking','transit'].includes(mode)||points.length<1||points.length>25||points.some(p=>!validCoordinates(p)))throw new WorldError('Travel requires valid selected locations.',400);
  }
  function estimate(seconds:unknown, metres:unknown, mode:Transportation):RouteEstimate|null {
    if(typeof seconds!=='number'||typeof metres!=='number'||seconds<0||metres<0||!Number.isFinite(seconds)||!Number.isFinite(metres))return null;
    // No global timetable feed is configured. Transit outings can only use genuine short walking legs.
    // Longer journeys fail rather than inventing a bus/train arrival.
    if(mode==='transit'&&(metres>1500||seconds>1200))return null;
    return {minutes:Math.ceil(seconds/60),distanceMetres:Math.round(metres),requestedMode:mode,actualMode:mode==='driving'?'driving':'walking',source:metres===0?'same-location':'osrm-road-network'};
  }
  return {
    async getMatrix(points,mode):Promise<RouteMatrix> {
      check(points,mode);
      if(points.length===1)return {points,legs:[[estimate(0,0,mode)]]};
      const url=`${base(mode)}/table/v1/driving/${coordinates(points)}?annotations=duration,distance&generate_hints=false`;
      const data=await request(url);
      if(!Array.isArray(data.durations)||!Array.isArray(data.distances)||data.durations.length!==points.length||data.distances.length!==points.length||data.durations.some((row:any)=>!Array.isArray(row)||row.length!==points.length)||data.distances.some((row:any)=>!Array.isArray(row)||row.length!==points.length))throw new WorldError('Travel estimates returned incomplete data. Please try again.');
      const maxSnap=mode==='driving'?1200:400;
      const snapped=(i:number)=>data.sources?.[i]?.distance>maxSnap || data.destinations?.[i]?.distance>maxSnap;
      return {points,legs:points.map((_,i)=>points.map((__,j)=>i===j?estimate(0,0,mode):snapped(i)||snapped(j)?null:estimate(data.durations[i][j],data.distances[i][j],mode)))};
    },
    async getRouteEstimate(origin,destination,mode) {
      check([origin,destination],mode);
      if(origin.latitude===destination.latitude&&origin.longitude===destination.longitude)return estimate(0,0,mode);
      const data=await request(`${base(mode)}/route/v1/driving/${coordinates([origin,destination])}?geometries=geojson&overview=simplified&steps=false&generate_hints=false`);
      const route=data.routes?.[0];if(!route)return null;
      if(data.waypoints?.some((p:any)=>p.distance>(mode==='driving'?1200:400)))return null;
      const result=estimate(route.duration,route.distance,mode);
      if(result&&route.geometry?.type==='LineString')result.geometry=route.geometry;
      return result;
    },
  };
}
