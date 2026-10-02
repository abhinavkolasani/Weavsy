import { useEffect, useRef, useState } from 'react';
import { PlanningForm } from './components/PlanningForm';
import { RequestSummary } from './components/RequestSummary';
import { createFounderMetadata } from './founder/metadata';
import { PlanResults } from './components/PlanResults';
import type { PlanRun } from './itinerary/plan';
import { initialState, restoreState, SESSION_KEY } from './planning/state';
import type { PlannerState } from './planning/state';
import type { PlanningRequest } from './planning/types';
function loadSession() { try { return restoreState(sessionStorage.getItem(SESSION_KEY)); } catch { return initialState(); } }
export function App() {
  const [state, setState] = useState<PlannerState>(loadSession);
  const [run, setRun] = useState<PlanRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const headingRef = useRef<HTMLElement>(null);
  const previousScreen = useRef(state.screen);
  useEffect(() => { try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(state)); setStorageUnavailable(false); } catch { setStorageUnavailable(true); } }, [state]);
  useEffect(() => { if (previousScreen.current !== state.screen) { headingRef.current?.focus(); window.scrollTo(0, 0); previousScreen.current = state.screen; } }, [state.screen]);
  async function submit(request: PlanningRequest) {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/plans', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({draft:state.draft,parentRunId:run?.runId}) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not build the plan');
      setRun(result); sessionStorage.setItem('outing-last-run',result.runId);
      setState(current => ({ ...current, screen:'results', submission:{request,result:{status:'not-generated',primaryItinerary:null},metadata:createFounderMetadata()} }));
    } catch(e) { setError(e instanceof Error ? e.message : 'Could not build the plan. Your draft is saved.'); } finally {setBusy(false);}
  }
  useEffect(()=>{const id=sessionStorage.getItem('outing-last-run');if(id)fetch('/api/runs/'+id).then(r=>r.ok?r.json():null).then(r=>{if(r)setRun(r);}).catch(()=>{});},[]);
  return <div className="app"><header className="app-header"><strong>Outing planner</strong><span className="version">V0.1 · Guest prototype</span></header><main ref={headingRef} tabIndex={-1}>
    {storageUnavailable && <p className="storage-notice" role="status">This browser can’t save the current tab’s draft. You can still plan, but refreshing will clear your input.</p>}
    {error && <p role="alert" className="storage-notice">{error}</p>}
    {busy && <p role="status">Building and saving your plan…</p>}
    {state.screen === 'results' && run ? <PlanResults run={run} onEdit={() => setState(current => ({...current,screen:'form'}))}/> : state.screen === 'results' && state.submission ? <RequestSummary submission={state.submission} onEdit={() => setState(current => ({ ...current, screen: 'form' }))}/> : <PlanningForm draft={state.draft} onChange={draft => setState(current => ({ ...current, draft }))} onSubmit={submit}/>}
    <footer className="app-footer"><span>No account needed.</span><span>Draft kept in this browser tab only.</span></footer>
  </main></div>;
}
