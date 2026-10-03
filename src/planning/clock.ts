export interface LocalClock { date:string; time:string; timeZone:string }
/** Shared by browser validation and server validation; never trust a caller-provided "now". */
export function localClock(timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone,now=new Date()):LocalClock {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const value=(type:string)=>parts.find(p=>p.type===type)!.value;
  let date=`${value('year')}-${value('month')}-${value('day')}`;
  let minutes=Number(value('hour'))*60+Number(value('minute'))+(Number(value('second'))>0?1:0);
  if(minutes===1440){const next=new Date(`${date}T12:00:00Z`);next.setUTCDate(next.getUTCDate()+1);date=next.toISOString().slice(0,10);minutes=0;}
  return {date,time:`${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`,timeZone};
}
/** Current UTC offset is supplied by Google; it is used for 'now', never to invent future DST rules. */
export function outingClock(timeZone:string|undefined,place?:PlaceReference|null,now=new Date()):LocalClock {
  const offset=place?.provider==='google'?place.provider_metadata.utc_offset_minutes:undefined;
  if(typeof offset!=='number'||!Number.isFinite(offset)||Math.abs(offset)>840)return localClock(timeZone,now);
  const rounded=Math.ceil(now.getTime()/60000)*60000;
  const local=new Date(rounded+offset*60000);
  return{date:local.toISOString().slice(0,10),time:local.toISOString().slice(11,16),timeZone:timeZone??Intl.DateTimeFormat().resolvedOptions().timeZone};
}
import type { PlaceReference } from '../world/types.ts';
