import type { PlaceReference } from '../world/types';
export function SourceAttribution({places=[],provider}: {places?:PlaceReference[];provider?:'google'|'openstreetmap'}) {
  const google=provider==='google'||places.some(p=>p.provider==='google');
  const credits=[...new Map(places.flatMap(p=>p.provider_metadata.attributions??[]).map(a=>[a.uri,a])).values()];
  return <div className="data-credit">{google?<span className="google-attribution" translate="no">Google Maps</span>:<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>}{credits.filter(a=>/^https?:\/\//.test(a.uri)).map(a=><a key={a.uri} href={a.uri} target="_blank" rel="noreferrer"> · {a.display_name}</a>)}</div>;
}
