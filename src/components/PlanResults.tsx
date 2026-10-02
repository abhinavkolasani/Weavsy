import type { PlanRun } from '../itinerary/plan';
const time = (m: number) => `${Math.floor(m / 60) % 12 || 12}:${String(m % 60).padStart(2, '0')} ${m >= 720 ? 'PM' : 'AM'}`;
const money = (c: number) => `$${(c / 100).toFixed(2)}`;
export function PlanResults({ run, onEdit }: {
    run: PlanRun;
    onEdit: () => void;
}) {
    const statuses = run.catalogDataStatuses ?? [...new Set(run.stops.flatMap(s => s.dataStatus ? [s.dataStatus] : s.name.startsWith('TEST_') ? ['synthetic'] : []))];
    const hasSynthetic = statuses.includes('synthetic');
    return <>
    <div className="page-heading"><p className="eyebrow">YOUR OUTING · {hasSynthetic ? statuses.length > 1 ? 'MIXED CATALOG' : 'SYNTHETIC TEST CATALOG' : 'CONTROLLED CATALOG'}</p><h1>{run.status === 'complete' ? 'Your plan is ready.' : 'These pieces don’t fit yet.'}</h1><p>{run.status === 'complete' ? 'One plan, with your existing decisions preserved.' : 'Your fixed decisions are intact. Edit the constraints to resolve these conflicts.'}</p></div>
    <p className="storage-notice">{hasSynthetic && 'This outing includes fictional TEST places and is for testing only. '}Travel and costs are estimates; verify them before execution.</p>
    {run.conflicts.length > 0 && <section className="panel" role="alert"><h2>What needs attention</h2><ul>{run.conflicts.map((c, i) => <li key={i}>{c}</li>)}</ul></section>}
    {run.status === 'complete' && <section className="panel"><h2>Your itinerary</h2><p>Outing starts {run.request.availableStartTime} · Required end {run.request.requiredEndTime}</p><p>{money(run.totalCostCents)} known estimated cost per person · {run.stops.reduce((sum, s) => sum + s.travelMinutes, 0)} min estimated travel · Finish {time(run.finish)} · {run.request.groupSize} people</p>{run.unknownCostStops.length > 0 && <p role="status"><strong>Budget not confirmed:</strong> {run.unknownCostStops.length} user stop(s) have unknown costs. The displayed total excludes those costs.</p>}<ol className="received-stops">{run.stops.map(s => <li key={s.stopId}><p>{s.travelMinutes} min estimated travel + {s.bufferMinutes} min arrival buffer</p><div className="received-stop-heading"><h3>{time(s.start)} — {s.name}</h3><span className="status-badge">{s.fixed ? 'Fixed' : 'Flexible'} · {s.source === 'user' ? 'Your choice' : 'Planner added'}</span></div><p>{s.category.replaceAll('_', ' ')} · {s.dataStatus ?? 'User details unverified'} · {s.duration} min · Ends {time(s.start + s.duration)} · {s.costCents === null ? 'Cost unknown' : money(s.costCents) + ' / person'}</p><p>{s.reason}</p>{s.note && <p className="hint">{s.note}</p>}</li>)}</ol></section>}
    <section className="panel"><h2>Assumptions to check</h2><ul>{run.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul></section>
    <details className="debug-panel"><summary>Founder / debug: run {run.runId}</summary><p>Persisted raw run. Structured constraints and decision diagnostics; no hidden model reasoning.</p><p>Open windows: {run.openWindows.map(w => `${time(w.start)}–${time(w.end)}`).join(', ')}</p><pre>{JSON.stringify(run, null, 2)}</pre><a href={`/api/runs/${run.runId}`} target="_blank" rel="noreferrer">Open stored run JSON</a></details>
    <div className="results-actions"><button className="secondary" onClick={onEdit}>← Edit and rebuild</button></div></>;
}
