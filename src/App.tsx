import { useEffect, useRef, useState } from 'react';
import { PlanningForm } from './components/PlanningForm';
import { RequestSummary } from './components/RequestSummary';
import { ItineraryResults } from './components/ItineraryResults';
import { RunInspector } from './founder/RunInspector';
import { isRealPlanResult } from './itinerary/realPlan';
import { createFounderMetadata } from './founder/metadata';
import { PlaceLab } from './founder/PlaceLab';
import { initialState, restoreState, SESSION_KEY } from './planning/state';
import type { PlannerState } from './planning/state';
import type { PlanningRequest } from './planning/types';
import { hydrateSession,serializeSession } from './world/durable';
import { worldClient } from './world/client';
import { PolicyPage } from './components/PolicyPage';
import { isCurrentPlan, requestToDraft } from './planning/currentPlan';
import type { PlanEdit } from './planning/currentPlan';
import type { LiveAction } from './planning/live';
function loadSession() { try {
    return restoreState(sessionStorage.getItem(SESSION_KEY));
}
catch {
    return initialState();
} }
export function App() {
    const [state, setState] = useState<PlannerState>(loadSession);
    const [run, setRun] = useState<{runId:string} | null>(null);
    const [planKey,setPlanKey]=useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [storageUnavailable, setStorageUnavailable] = useState(false);
    const [loaded,setLoaded]=useState(false);
    const headingRef = useRef<HTMLElement>(null);
    const previousScreen = useRef(state.screen);
    useEffect(()=>{let cancelled=false;let raw:string|null=null;try{raw=sessionStorage.getItem(SESSION_KEY);}catch{setStorageUnavailable(true);}const link=new URLSearchParams(window.location.hash.slice(1));const id=link.get('plan'),key=link.get('key');if(id&&key){setPlanKey(key);void fetch('/api/plans/'+encodeURIComponent(id),{headers:{'X-Plan-Key':key}}).then(async response=>{const data=await response.json();if(!response.ok||!isCurrentPlan(data.currentPlan))throw new Error(data.error??'Your saved plan could not load. Keep this link and try again.');if(cancelled)return;const plan=data.currentPlan;setState({version:1,screen:'results',draft:requestToDraft(plan.request),currentPlan:plan,submission:{request:plan.request,result:plan.result,metadata:{...createFounderMetadata(),batch:3,plannerStatus:'built',requestId:plan.runId}}});setRun({runId:plan.runId});}).catch(e=>{if(!cancelled)setError(e.message);}).finally(()=>{if(!cancelled)setLoaded(true);});return()=>{cancelled=true;};}void hydrateSession(raw,id=>worldClient.getPlaceDetails(id)).then(restored=>{if(!cancelled){setState(restored.state);if(restored.warning)setError(restored.warning);setLoaded(true);}});return()=>{cancelled=true;};},[]);
    useEffect(() => { if(!loaded)return;try {
        sessionStorage.setItem(SESSION_KEY, serializeSession(state));
        setStorageUnavailable(false);
    }
    catch {
        setStorageUnavailable(true);
    } }, [state,loaded]);
    useEffect(() => { if (previousScreen.current !== state.screen) {
        headingRef.current?.focus();
        window.scrollTo(0, 0);
        previousScreen.current = state.screen;
    } }, [state.screen]);
    async function submit(request: PlanningRequest) {
        if(state.currentPlan){await editPlan({kind:'details',request});return;}
        if (busy)
            return;
        setBusy(true);
        setError('');
        try {
            const response = await fetch('/api/plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft: state.draft, parentRunId: run?.runId }) });
            const result = await response.json();
            if (!response.ok)
                throw new Error((result.error || 'Could not save your outing'));
            if (!isRealPlanResult(result.result)) throw new Error('The plan response was incomplete. Your outing details are still here.');
            setRun(result);
            if(result.planKey&&isCurrentPlan(result.currentPlan)){setPlanKey(result.planKey);window.history.replaceState(null,'','#'+new URLSearchParams({plan:result.currentPlan.id,key:result.planKey}));}
            try { sessionStorage.setItem('outing-last-run', result.runId); } catch { setStorageUnavailable(true); }
            setState(current => ({ ...current, screen: 'results',draft:requestToDraft(result.request??request),currentPlan:isCurrentPlan(result.currentPlan)?result.currentPlan:null, submission: { request:result.request ?? request, result:result.result, metadata: {...createFounderMetadata(),batch:3,plannerStatus:'built',requestId:result.runId} } }));
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'Could not build the plan. Your draft is saved.');
        }
        finally {
            setBusy(false);
        }
    }
    async function editPlan(edit:PlanEdit){
      if(busy||!state.currentPlan)return;setBusy(true);setError('');
      try{
        const response=await fetch('/api/plans/edit',{method:'POST',headers:{'Content-Type':'application/json','X-Plan-Key':planKey},body:JSON.stringify({planId:state.currentPlan.id,revision:state.currentPlan.revision,edit})});
        const data=await response.json();if(!response.ok)throw new Error(data.error??'This change could not be applied.');
        if(data.conflict){setError(data.conflict+' Your current plan is still shown below.');setState(s=>({...s,screen:'results'}));return;}
        if(!isCurrentPlan(data.currentPlan))throw new Error('The updated plan was incomplete. Your current plan is still here.');
        const plan=data.currentPlan;setRun({runId:data.runId});
        setState(s=>({...s,screen:'results',currentPlan:plan,draft:requestToDraft(plan.request),submission:{request:plan.request,result:plan.result,metadata:{...createFounderMetadata(),batch:3,plannerStatus:'built',requestId:data.runId}}}));
      }catch(e){setError(e instanceof Error?e.message:'The change could not load. Your current plan is still here.');}finally{setBusy(false);}
    }
    async function updateOuting(action:LiveAction){
      if(busy||!state.currentPlan)return;setBusy(true);setError('');
      try{
        const response=await fetch('/api/plans/live',{method:'POST',headers:{'Content-Type':'application/json','X-Plan-Key':planKey},body:JSON.stringify({planId:state.currentPlan.id,revision:state.currentPlan.revision,action})});
        const data=await response.json();if(!response.ok)throw new Error(data.error??'The update could not be applied.');
        if(!isCurrentPlan(data.currentPlan))throw new Error('The update could not be read. Your current plan is still here.');
        const plan=data.currentPlan;setRun({runId:plan.runId});setState(s=>({...s,screen:'results',currentPlan:plan,draft:requestToDraft(plan.request),submission:{request:plan.request,result:plan.result,metadata:{...createFounderMetadata(),batch:3,plannerStatus:'built',requestId:plan.runId}}}));if(data.conflict)setError(data.conflict);
      }catch(e){setError(e instanceof Error?e.message:'The update could not load. Your current plan is still here.');}finally{setBusy(false);}
    }
    useEffect(() => { let id: string | null = null; try { id = sessionStorage.getItem('outing-last-run'); } catch { setStorageUnavailable(true); } if (id) setRun({runId:id}); }, []);
    return <div className="app"><header className="app-header"><strong>Outing planner</strong><span className="version">Plan your time together</span></header><main ref={headingRef} tabIndex={-1}>
    {storageUnavailable && <p className="storage-notice" role="status">This browser can’t save the current tab’s draft. You can still plan, but refreshing will clear your input.</p>}
    {error && <p role="alert" className="storage-notice">{error}</p>}
    {busy && <div role="status" className="planning-progress"><strong>{state.currentPlan?'Updating your outing…':'Building your outing…'}</strong><ol className="progress-steps"><li>Finding places that fit</li><li>Checking timing and travel</li><li>Putting the plan together</li></ol></div>}
    {['/terms','/privacy'].includes(window.location.pathname)?<PolicyPage privacy={window.location.pathname==='/privacy'}/>:!loaded?<p role="status" className="hint">Loading your outing…</p>:window.location.pathname.startsWith('/founder/runs') ? <RunInspector/> : window.location.pathname.startsWith('/founder') ? <PlaceLab initialOrigin={state.draft.startingPlace}/> : state.screen === 'results' && state.submission ? (state.submission.result.status==='not-generated'?<RequestSummary submission={state.submission} onEdit={() => {setError('');setState(current => ({ ...current, screen: 'form' }));}}/>:<ItineraryResults submission={state.submission} busy={busy} onPlanEdit={editPlan} onLiveAction={updateOuting} currentPlan={state.currentPlan} savedLink={planKey?window.location.href:undefined} onEdit={() => {setError('');setState(current => ({ ...current, screen: 'form' }));}}/>) : <PlanningForm draft={state.draft} busy={busy} onChange={draft => setState(current => ({ ...current, draft }))} onSubmit={submit}/>}
  </main><footer className="policy-links"><a href="/terms" target="_blank" rel="noreferrer">Terms</a><a href="/privacy" target="_blank" rel="noreferrer">Privacy</a></footer></div>;
}
