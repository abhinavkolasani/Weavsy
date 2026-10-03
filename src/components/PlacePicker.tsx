import { useEffect, useRef, useState } from 'react';
import { searchSuggestions,worldClient } from '../world/client';
import { isPlaceReference } from '../world/reference';
import type { Coordinates, PlaceReference, PlaceSuggestion } from '../world/types';
import { SourceAttribution } from './SourceAttribution';
import { fieldAccessibility } from './Field';
export function PlacePicker({id,value,place,onChange,bias,error,placeholder}: {
  id:string;value:string;place?:PlaceReference|null;onChange:(text:string,place:PlaceReference|null)=>void;
  bias?:Coordinates;error?:string;placeholder?:string;
}) {
  const [results,setResults]=useState<PlaceSuggestion[]>([]),[loading,setLoading]=useState(false),[message,setMessage]=useState(''),[open,setOpen]=useState(false),[focused,setFocused]=useState(false),[active,setActive]=useState(-1),[retry,setRetry]=useState(0);
  const sessionToken=useRef(crypto.randomUUID());
  const generation=useRef(0),selectionAbort=useRef(false);
  const latestOnChange=useRef(onChange);
  latestOnChange.current=onChange;
  useEffect(()=>{
    const token=++generation.current;selectionAbort.current=false;
    if(place||value.trim().length<2||!focused){setResults([]);setLoading(false);setMessage('');return;}
    const controller=new AbortController();
    const timer=setTimeout(async()=>{
      setLoading(true);setMessage('');setOpen(true);
      try {const found=await searchSuggestions(value.trim(),bias,controller.signal,sessionToken.current);if(token===generation.current){setResults(found.slice(0,5));setActive(-1);setMessage(found.length?'':'No matches found. Try a city, full address or another place name.');}}
      catch(e){if(!controller.signal.aborted&&token===generation.current){setResults([]);setMessage(e instanceof Error?e.message:'Search is unavailable. Please try again.');}}
      finally{if(token===generation.current)setLoading(false);}
    },350);
    return()=>{clearTimeout(timer);controller.abort();};
  },[value,place,focused,bias?.latitude,bias?.longitude,retry]);
  useEffect(()=>()=>{generation.current++;selectionAbort.current=true;},[]);
  async function select(candidate:PlaceSuggestion) {
    const token=++generation.current;setLoading(true);setMessage('');setResults([]);
    const selectedSession=sessionToken.current;sessionToken.current=crypto.randomUUID();
    try {
      const resolved=candidate.provider==='google'?(await worldClient.getPlaceDetails(candidate.provider_place_id,selectedSession)).place: candidate;
      if(token!==generation.current||selectionAbort.current)return;
      if(!isPlaceReference(resolved))throw new Error('This place could not be confirmed. Please select another result.');
      latestOnChange.current(resolved.display_name,resolved);setOpen(false);setFocused(false);
    }catch(e){if(token===generation.current){setMessage(e instanceof Error?e.message:'Could not select this place. Try again.');setOpen(true);}}
    finally{if(token===generation.current)setLoading(false);}
  }
  const inputChanged=(next:string)=>{generation.current++;onChange(next,null);setOpen(true);setFocused(true);setResults([]);setMessage('');setActive(-1);};
  const selectedText=place?(id==='startingLocation'?place.formatted_address??place.display_name:[place.display_name,place.formatted_address].filter(Boolean).join(' · ')):value;
  return <div className="place-picker">
    <input id={id} role="combobox" aria-autocomplete="list" aria-expanded={open&&!place} aria-controls={`${id}-suggestions`} aria-activedescendant={active>=0?`${id}-option-${active}`:undefined} autoComplete="off" value={selectedText} placeholder={placeholder??'Search a US place or address'} {...fieldAccessibility(id,error)} onChange={e=>inputChanged(e.target.value)} onFocus={()=>{setFocused(true);if(!place)setOpen(true);}}
      onKeyDown={e=>{if(e.key==='Escape'){setOpen(false);setActive(-1);}if(e.key==='ArrowDown'){e.preventDefault();setOpen(true);setActive(a=>Math.min(a+1,results.length-1));}if(e.key==='ArrowUp'){e.preventDefault();setActive(a=>Math.max(a-1,0));}if(e.key==='Enter'&&open&&!place){e.preventDefault();if(active>=0&&results[active])void select(results[active]);else setRetry(r=>r+1);}}}/>
    {!place&&open&&<div className="place-suggestions"><p role="status" className="hint">{loading?'Finding real places…':message||'Select a result to confirm the location.'}</p>
      <ul id={`${id}-suggestions`} role="listbox" aria-label="Place suggestions">{results.map((candidate,index)=><li key={candidate.provider_place_id} id={`${id}-option-${index}`} role="option" aria-selected={active===index}><button type="button" disabled={loading} onMouseDown={e=>e.preventDefault()} onClick={()=>void select(candidate)}><strong>{candidate.display_name}</strong><span>{candidate.formatted_address??'Address not supplied'} · {candidate.primary_type?.split(':').pop()?.replaceAll('_',' ')??'place'}</span></button></li>)}</ul>
      {!!message&&<button type="button" className="text-button" onClick={()=>setRetry(r=>r+1)}>Try search again</button>}
      <SourceAttribution provider="google"/>
    </div>}
    {place&&<SourceAttribution places={[place]}/>}
    {!place&&value.trim().length>=2&&!open&&<p className="hint">Choose a search result to confirm this location.</p>}
  </div>;
}
