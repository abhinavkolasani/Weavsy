import type { Transportation } from '../planning/types.ts';
export interface TravelProvider { estimateMinutes(from:string|null,to:string|null,mode:Transportation):number; description:string }
/** Fictional zone distances only. Replace this adapter with routes/maps without changing composition. */
export const testTravelProvider:TravelProvider={
 description:'Fictional TEST-zone travel matrix; unknown user locations use a conservative mode estimate. No live routes or traffic.',
 estimateMinutes(from,to,mode){const fallback=mode==='driving'?15:mode==='walking'?25:30;if(!from||!to)return fallback;if(from===to)return 0;return fallback+ (mode==='driving'?10:20);}
};
