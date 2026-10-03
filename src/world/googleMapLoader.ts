let loading:Promise<void>|null=null;
type MapWindow=Window&{__outingGoogleReady?:()=>void;gm_authFailure?:()=>void};
export async function loadGoogleMap(key:string) {
  if(!key)throw new Error('The map is not configured yet. Your places and plan are still available.');
  if(loading)return loading;
  loading=new Promise<void>((resolve,reject)=>{
    const host=window as MapWindow;
    const script=document.createElement('script');
    const timeout=setTimeout(()=>{script.remove();loading=null;reject(new Error('The map took too long to load. Please try again.'));},12000);
    host.__outingGoogleReady=()=>{clearTimeout(timeout);delete host.__outingGoogleReady;resolve();};
    host.gm_authFailure=()=>{clearTimeout(timeout);loading=null;window.dispatchEvent(new Event('outing-map-auth-error'));reject(new Error('The map key could not authenticate. Check its website restrictions.'));};
    const url=new URL('https://maps.googleapis.com/maps/api/js');url.searchParams.set('key',key);url.searchParams.set('callback','__outingGoogleReady');url.searchParams.set('loading','async');url.searchParams.set('v','weekly');url.searchParams.set('language','en');url.searchParams.set('region','US');
    script.src=url.href;script.async=true;script.onerror=()=>{clearTimeout(timeout);loading=null;script.remove();reject(new Error('The map could not load. Your places and plan are still available.'));};
    document.head.append(script);
  });
  return loading;
}
