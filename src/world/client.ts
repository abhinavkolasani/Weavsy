import type { Coordinates, PlaceDetails, PlaceSuggestion, SearchResult, WorldProvider } from './types';
async function request<T>(path: string, input: unknown, signal?: AbortSignal): Promise<T> {
  let response:Response;
  try {response=await fetch('/api/world/' + path, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal});}
  catch (error) {if(signal?.aborted)throw error;throw new Error('Couldn’t reach place search. Please try again.');}
  let result;
  try {result=await response.json();}catch{throw new Error('Place search is unavailable right now. Please try again.');}
  if (!response.ok) throw new Error(result.error || 'Place search is unavailable. Please try again.');
  return result;
}
export const worldClient: WorldProvider = {
  autocompleteLocation: (query,bias,sessionToken) => request<PlaceSuggestion[]>('autocomplete',{query,bias,sessionToken}),
  autocompletePlace: (query,bias,sessionToken) => request<PlaceSuggestion[]>('autocomplete',{query,bias,sessionToken}),
  searchPlaces: search => request<SearchResult>('search',search),
  getPlaceDetails: (placeId,sessionToken) => request<PlaceDetails>('details',{placeId,sessionToken}),
  getRouteEstimate: async () => {throw new Error('Route estimates are not available yet.');},
};
export const searchSuggestions = (query: string, bias: Coordinates | undefined, signal: AbortSignal,sessionToken?:string) => request<PlaceSuggestion[]>('autocomplete',{query,bias,sessionToken},signal);
