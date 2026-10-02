import { useEffect, useRef, useState } from 'react';
import { PlanningForm } from './components/PlanningForm';
import { RequestSummary } from './components/RequestSummary';
import { createFounderMetadata } from './founder/metadata';
import { createResultShell } from './planning/engine';
import { initialState, restoreState, SESSION_KEY } from './planning/state';
import type { PlannerState } from './planning/state';
import type { PlanningRequest } from './planning/types';
function loadSession() { try { return restoreState(sessionStorage.getItem(SESSION_KEY)); } catch { return initialState(); } }
export function App() {
  const [state, setState] = useState<PlannerState>(loadSession);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const headingRef = useRef<HTMLElement>(null);
  const previousScreen = useRef(state.screen);
  useEffect(() => { try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(state)); setStorageUnavailable(false); } catch { setStorageUnavailable(true); } }, [state]);
  useEffect(() => { if (previousScreen.current !== state.screen) { headingRef.current?.focus(); window.scrollTo(0, 0); previousScreen.current = state.screen; } }, [state.screen]);
  function submit(request: PlanningRequest) {
    setState(current => ({ ...current, screen: 'results', submission: { request, result: createResultShell(), metadata: createFounderMetadata() } }));
  }
  return <div className="app"><header className="app-header"><strong>Outing planner</strong><span className="version">V0.1 · Guest prototype</span></header><main ref={headingRef} tabIndex={-1}>
    {storageUnavailable && <p className="storage-notice" role="status">This browser can’t save the current tab’s draft. You can still plan, but refreshing will clear your input.</p>}
    {state.screen === 'results' && state.submission ? <RequestSummary submission={state.submission} onEdit={() => setState(current => ({ ...current, screen: 'form' }))}/> : <PlanningForm draft={state.draft} onChange={draft => setState(current => ({ ...current, draft }))} onSubmit={submit}/>}
    <footer className="app-footer"><span>No account needed.</span><span>Draft kept in this browser tab only.</span></footer>
  </main></div>;
}
