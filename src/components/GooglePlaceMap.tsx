import { useEffect,useRef,useState } from 'react';
import type { PlaceMapProps } from './PlaceMap';
import { loadGoogleMap } from '../world/googleMapLoader';
import { getRouteLine } from '../routing/client';
import { placeUrl } from '../world/reference';
import { SourceAttribution } from './SourceAttribution';
export function GooglePlaceMap({places,routes=[],itinerary=false,mode='driving'}:PlaceMapProps) {
  const container=useRef<HTMLDivElement>(null);
  const [visible,setVisible]=useState(itinerary),[error,setError]=useState(''),[ready,setReady]=useState(false);
  const signature=places.map(p=>p.provider_place_id+':'+p.latitude+':'+p.longitude).join('|');
  useEffect(()=>{
    if(!visible||!container.current||!places.length)return;
    let cancelled=false;const markers:google.maps.marker.AdvancedMarkerElement[]=[],lines:google.maps.Polyline[]=[];
    setError('');setReady(false);
    const authError=()=>setError('The map key could not authenticate. Check its website restrictions.');
    window.addEventListener('outing-map-auth-error',authError);
    void (async()=>{
      const r=await fetch('/api/world/config');if(!r.ok)throw new Error('The map is unavailable.');
      const config=await r.json();await loadGoogleMap(config.browserKey);
      const [maps,markerLib]=await Promise.all([google.maps.importLibrary('maps') as Promise<google.maps.MapsLibrary>,google.maps.importLibrary('marker') as Promise<google.maps.MarkerLibrary>]);
      if(cancelled||!container.current)return;
      const map=new maps.Map(container.current,{center:{lat:places[0].latitude,lng:places[0].longitude},zoom:13,mapId:config.mapId??'DEMO_MAP_ID',mapTypeControl:false,streetViewControl:false,fullscreenControl:false,gestureHandling:'cooperative'});
      const bounds=new google.maps.LatLngBounds();
      places.forEach((p,i)=>{
        const element=document.createElement('div');element.className='numbered-marker '+(i===0?'origin-marker':'');element.textContent=i===0?'S':String(i);
        const marker=new markerLib.AdvancedMarkerElement({map,position:{lat:p.latitude,lng:p.longitude},title:(i===0?'Start':String(i))+': '+p.display_name});marker.append(element);markers.push(marker);
        const popup=new maps.InfoWindow();marker.addListener('click',()=>{const label=document.createElement('div');label.textContent=p.display_name;popup.setContent(label);popup.open({map,anchor:marker});});bounds.extend({lat:p.latitude,lng:p.longitude});
      });
      if(places.length>1)map.fitBounds(bounds,50);
      setReady(true);
      let geometry=routes;
      if(itinerary&&!geometry.length){
        const resolved=await Promise.allSettled(places.slice(1).map((p,i)=>getRouteLine(places[i],p,mode)));
        if(cancelled)return;
        geometry=resolved.flatMap(r=>r.status==='fulfilled'&&r.value?.geometry?[r.value.geometry]:[]);
        if(resolved.some(r=>r.status==='rejected'))setError('Some route lines could not load. Your travel estimates are still included.');
      }
      geometry.forEach(g=>lines.push(new maps.Polyline({map,path:g.coordinates.map(c=>({lat:c[1],lng:c[0]})),strokeColor:'#2847a4',strokeWeight:4,strokeOpacity:.8})));
    })().catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:'The map could not load.');});
    return()=>{cancelled=true;window.removeEventListener('outing-map-auth-error',authError);markers.forEach(m=>m.map=null);lines.forEach(l=>l.setMap(null));};
  },[visible,signature,itinerary,mode]);
  if(!places.length)return null;
  return <div className="place-map"><button type="button" className="text-button" aria-expanded={visible} onClick={()=>setVisible(v=>!v)}>{visible?'Hide map':'Show map'}</button>{visible&&<><div ref={container} className="map-canvas" role="region" aria-label="Map of selected places"/>{!ready&&!error&&<p className="hint" role="status">Loading map…</p>}{error&&<p className="hint" role="status">{error}</p>}<ul className="map-place-list">{places.map((p,i)=><li key={p.provider_place_id+':'+i}>{i===0?'Start':'Stop '+i} · <a href={placeUrl(p)} target="_blank" rel="noreferrer">{p.display_name}</a></li>)}</ul><SourceAttribution places={places}/></>}</div>;
}
