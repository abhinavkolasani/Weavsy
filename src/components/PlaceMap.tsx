import { useEffect, useRef, useState } from 'react';
import { placeUrl } from '../world/reference';
import type { PlaceReference } from '../world/types';
import type { Map as MapInstance } from 'maplibre-gl';
import type { Transportation } from '../planning/types';
import { getRouteLine } from '../routing/client';
import { GooglePlaceMap } from './GooglePlaceMap';
export interface PlaceMapProps {places:PlaceReference[];routes?:{type:'LineString';coordinates:number[][]}[];itinerary?:boolean;mode?:Transportation}
export function PlaceMap(props:PlaceMapProps) {return props.places.some(p=>p.provider==='google')?<GooglePlaceMap {...props}/>:<LegacyPlaceMap {...props}/>;}
function LegacyPlaceMap({places,routes=[],itinerary=false,mode='driving'}: PlaceMapProps) {
  places=itinerary?places:[...new Map(places.map(place=>[place.provider_place_id,place])).values()];
  const container=useRef<HTMLDivElement>(null),map=useRef<MapInstance|null>(null);
  const [visible,setVisible]=useState(false),[error,setError]=useState(''),[ready,setReady]=useState(false);
  const signature=places.map(p=>`${p.provider_place_id}:${p.latitude}:${p.longitude}`).join('|')+JSON.stringify(routes);
  useEffect(()=>{
    if(!visible||!container.current||!places.length)return;
    let cancelled=false;setError('');setReady(false);
    void Promise.all([import('maplibre-gl'),fetch('/api/world/config').then(r=>{if(!r.ok)throw new Error();return r.json();}),import('../world/mapSetup')]).then(([lib,config])=>{
      if(cancelled||!container.current)return;
      const first=places[0];
      const instance=new lib.Map({container:container.current,style:config.mapStyleUrl,center:[first.longitude,first.latitude],zoom:first.primary_type?.startsWith('place:')?11:14,attributionControl:false});
      map.current=instance;instance.addControl(new lib.AttributionControl({compact:false}));instance.addControl(new lib.NavigationControl({showCompass:false}),'top-right');
      instance.on('load',async()=>{if(cancelled)return;setReady(true);let lines=routes;if(itinerary&&!lines.length){const resolved=await Promise.allSettled(places.slice(1).map((p,i)=>getRouteLine(places[i],p,mode)));if(cancelled)return;lines=resolved.flatMap(r=>r.status==='fulfilled'&&r.value?.geometry?[r.value.geometry]:[]);if(resolved.some(r=>r.status==='rejected'))setError('Some route lines could not load. Your travel estimates are still included.');}if(lines.length){instance.addSource('outing-route',{type:'geojson',data:{type:'FeatureCollection',features:lines.map(geometry=>({type:'Feature',properties:{},geometry}))}});instance.addLayer({id:'outing-route',type:'line',source:'outing-route',paint:{'line-color':'#2847a4','line-width':4,'line-opacity':.75}});}});instance.on('error',()=>{if(!cancelled)setError('Some map information could not load. Your selected places are saved.');});
      const bounds=new lib.LngLatBounds();
      places.forEach((place,index)=>{const label=document.createElement('div');label.textContent=place.display_name;const element=document.createElement('div');element.className=`numbered-marker ${index===0?'origin-marker':''}`;element.textContent=index===0?'S':String(index);element.setAttribute('aria-label',`${index===0?'Starting point':`Stop ${index}`}: ${place.display_name}`);new lib.Marker({element}).setLngLat([place.longitude,place.latitude]).setPopup(new lib.Popup({offset:25}).setDOMContent(label)).addTo(instance);bounds.extend([place.longitude,place.latitude]);});
      if(places.length>1)instance.fitBounds(bounds,{padding:55,maxZoom:14,duration:0});
    }).catch(()=>{if(!cancelled)setError('The map could not load. You can still select places and save your outing.');});
    return()=>{cancelled=true;map.current?.remove();map.current=null;};
  },[visible,signature]);
  if(!places.length)return null;
  return <div className="place-map"><button type="button" className="text-button" aria-expanded={visible} onClick={()=>setVisible(v=>!v)}>{visible?'Hide map':'Show map'}</button>
    {visible&&<><div ref={container} className="map-canvas" role="region" aria-label="Map of selected places"/>{!ready&&!error&&<p className="hint" role="status">Loading map…</p>}{error&&<p className="hint" role="status">{error}</p>}<ul className="map-place-list">{places.map((p,i)=><li key={p.provider_place_id+':'+i}>{i===0?'Start':`Stop ${i}`} · <a href={placeUrl(p)} target="_blank" rel="noreferrer">{p.display_name}</a></li>)}</ul></>}
  </div>;
}
