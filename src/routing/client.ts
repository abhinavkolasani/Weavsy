import type { Coordinates } from '../world/types';
import type { Transportation } from '../planning/types';
import type { RouteEstimate } from './types';
export async function getRouteLine(origin:Coordinates,destination:Coordinates,mode:Transportation):Promise<RouteEstimate|null> {
  const response=await fetch('/api/world/route',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({origin,destination,mode})});
  if(!response.ok)throw new Error('The route line could not load. Your travel estimates are still included.');
  return response.json();
}
