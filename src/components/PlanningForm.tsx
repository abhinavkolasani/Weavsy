import { DateInput } from './DateInput';
import { TimeInput } from './TimeInput';
import { useEffect, useRef, useState } from 'react';
import { outingClock } from '../planning/clock';
import type { FormEvent } from 'react';
import { STARTING_STATES } from '../planning/types';
import type { PlanningDraft, PlanningRequest, StartingState, ValidationErrors } from '../planning/types';
import { changeStartingState, newStop, removeExistingStop } from '../planning/draft';
import { validateRequest, validDate, validTime } from '../planning/validate';
import { outingWindow, addDays, preserveStopDays } from '../planning/timeline';
import { Field, fieldAccessibility } from './Field';
import { ExistingStopEditor } from './ExistingStopEditor';
import { PlacePicker } from './PlacePicker';
import { PlaceMap } from './PlaceMap';
import { interestSuggestions } from '../planner/intent';
export function PlanningForm({ draft, onChange, onSubmit, busy=false }: { draft: PlanningDraft; onChange: (draft: PlanningDraft) => void; onSubmit: (request: PlanningRequest) => void; busy?:boolean }) {
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [modeError, setModeError] = useState('');
  const [clock,setClock]=useState(()=>outingClock(draft.timeZone,draft.startingPlace));
  useEffect(()=>{setClock(outingClock(draft.timeZone,draft.startingPlace));const timer=setInterval(()=>setClock(outingClock(draft.timeZone,draft.startingPlace)),30000);return()=>clearInterval(timer);},[draft.timeZone,draft.startingPlace?.provider_place_id,draft.startingPlace?.provider_metadata.utc_offset_minutes]);
  const errorRef = useRef<HTMLDivElement>(null);
  const set = <K extends keyof PlanningDraft>(key: K, value: PlanningDraft[K]) => { onChange({ ...(key==='availableStartTime'?preserveStopDays(draft):draft), [key]: value }); setErrors(current => { const next = { ...current }; delete next[key]; return next; }); };
  const switchMode = (mode: StartingState) => { const next = changeStartingState(draft, mode); setModeError(next.error ?? ''); if (!next.error) { onChange(next.draft); setErrors({}); } };
  const submit = (event: FormEvent) => { event.preventDefault(); const now=outingClock(draft.timeZone,draft.startingPlace);setClock(now);const result = validateRequest(draft, {requirePlaceSelections:true,notBefore:now}); if (!result.ok) { setErrors(result.errors); requestAnimationFrame(() => errorRef.current?.focus()); return; } setErrors({}); onSubmit(result.request); };
  useEffect(()=>{if(draft.date===clock.date&&validTime(draft.availableStartTime)&&draft.availableStartTime<clock.time)onChange({...preserveStopDays(draft),availableStartTime:clock.time});},[clock.date,clock.time,draft.date]);
  const overnight=validTime(draft.availableStartTime)&&validTime(draft.requiredEndTime)&&outingWindow(draft).endDayOffset===1;
  const finishHint=overnight&&validDate(draft.date)?`Ends the next day, ${new Intl.DateTimeFormat('en-US',{weekday:'short',month:'short',day:'numeric'}).format(new Date(addDays(draft.date,1)+'T12:00:00'))}.`:undefined;
  const errorKeys = Object.keys(errors);
  const canAdd = draft.startingState === 'partial-plan' || draft.startingState === 'almost-complete' || draft.existingStops.length === 0;
  return <><div className="page-heading"><p className="eyebrow">YOUR OUTING</p><h1>What do you have in mind?</h1><p>Start with what you know. Keep the pieces you’ve already decided.</p></div>
    <form onSubmit={submit} noValidate>
      {errorKeys.length > 0 && <div ref={errorRef} tabIndex={-1} className="error-summary" role="alert"><strong>Check {errorKeys.length === 1 ? 'this detail' : 'these details'} before continuing.</strong><ul>{errorKeys.map(key => <li key={key}><a href={`#${key}`} onClick={e => { e.preventDefault(); document.getElementById(key)?.focus(); }}>{errors[key]}</a></li>)}</ul></div>}
      <section className="panel" aria-labelledby="basics-title"><div className="section-heading"><span className="section-number">1</span><h2 id="basics-title">The basics</h2></div>
      <Field id="startingLocation" label="Where are you starting from?" hintAbove error={errors.startingLocation} hint="Use where you’ll leave from or where everyone is meeting."><PlacePicker id="startingLocation" value={draft.startingLocation} place={draft.startingPlace} onChange={(text,place)=>{onChange({...draft,startingLocation:text,startingPlace:place,pendingStartingPlaceId:undefined});setErrors(current=>{const next={...current};delete next.startingLocation;return next;});}} error={errors.startingLocation} placeholder="City, address or place in the US"/></Field>
      <div className="form-grid"><Field id="date" label="Date" error={errors.date}><DateInput id="date" value={draft.date} minimum={clock.date} error={errors.date} onChange={value=>set('date',value)}/></Field>
      <Field id="budgetPerPerson" label="Budget per person (USD)" error={errors.budgetPerPerson}><input id="budgetPerPerson" type="text" inputMode="decimal" value={draft.budgetPerPerson} onChange={e => set('budgetPerPerson', e.target.value)} placeholder="40" {...fieldAccessibility('budgetPerPerson', errors.budgetPerPerson)}/></Field>
      <Field id="availableStartTime" label="Start around" error={errors.availableStartTime}><TimeInput id="availableStartTime" minimum={draft.date===clock.date?clock.time:undefined} value={draft.availableStartTime} onChange={value => set('availableStartTime', value)} invalid={!!errors.availableStartTime}/></Field>
      <Field id="requiredEndTime" label="Wrap up around" hint={finishHint} error={errors.requiredEndTime}><TimeInput id="requiredEndTime" value={draft.requiredEndTime} onChange={value => set('requiredEndTime', value)} invalid={!!errors.requiredEndTime}/></Field>
      <Field id="groupSize" label="Group size" error={errors.groupSize}><input id="groupSize" type="number" min="1" step="1" inputMode="numeric" value={draft.groupSize} onChange={e => set('groupSize', e.target.value)} {...fieldAccessibility('groupSize', errors.groupSize)}/></Field>
      <Field id="transportation" label="Transportation" error={errors.transportation}><select id="transportation" value={draft.transportation} onChange={e => set('transportation', e.target.value as PlanningDraft['transportation'])} {...fieldAccessibility('transportation', errors.transportation)}><option value="">Choose a way to get around</option><option value="driving">Driving</option><option value="walking">Walking</option><option value="transit">Transit</option></select></Field></div>
      <div className="constraint-options"><label className="constraint-toggle"><input type="checkbox" checked={draft.budgetIsCap??false} onChange={e=>set('budgetIsCap',e.target.checked)}/>This budget is a firm cap per person</label><label className="constraint-toggle"><input type="checkbox" checked={draft.finishIsHard??false} onChange={e=>set('finishIsHard',e.target.checked)}/>This finish time is firm</label><label className="constraint-toggle"><input type="checkbox" checked={draft.returnToStart??false} onChange={e=>set('returnToStart',e.target.checked)}/>Be back at my starting point by the finish time</label></div>
      <h2>What sounds good?</h2><p className="hint">Pick anything that fits, or let me put something together.</p><div className="interest-chips" aria-label="Suggested interests">{interestSuggestions(draft.availableStartTime).map(tag=><button type="button" key={tag} aria-pressed={draft.selectedInterests?.includes(tag)??false} onClick={()=>set('selectedInterests',draft.selectedInterests?.includes(tag)?draft.selectedInterests.filter(t=>t!==tag):[...(draft.selectedInterests??[]),tag])}>{tag}</button>)}</div>
      <Field id="vibeInterests" label="Anything else? (optional)" error={errors.vibeInterests}><input id="vibeInterests" value={draft.vibeInterests} onChange={e => set('vibeInterests', e.target.value)} placeholder="For example, something lowkey or dinner first" {...fieldAccessibility('vibeInterests', errors.vibeInterests)}/></Field></section>
      <section className="panel" aria-labelledby="existing-title"><div className="section-heading"><span className="section-number">2</span><h2 id="existing-title">What’s already planned?</h2></div>
      <fieldset className="starting-states" id="startingState" tabIndex={-1} aria-describedby={modeError ? 'mode-error' : undefined}><legend className="sr-only">How much of the plan already exists?</legend>{STARTING_STATES.map(state => <label key={state.value} className={`state-choice ${draft.startingState === state.value ? 'selected' : ''}`}><input type="radio" name="startingState" value={state.value} checked={draft.startingState === state.value} onChange={() => switchMode(state.value)}/><span><strong>{state.label}</strong><small>{state.hint}</small></span></label>)}</fieldset>
      {(modeError || errors.startingState) && <p className="field-error" id="mode-error" role="alert">{modeError || errors.startingState}</p>}
      {draft.startingState !== 'nothing-planned' && <div className="existing-section" id="existingStops" tabIndex={-1}><p className="section-note">Add what you already know. Leave unknown times or duration blank. Existing stops stay here when you switch starting states.</p>{errors.existingStops && <p className="field-error">{errors.existingStops}</p>}
      {draft.existingStops.map((stop, index) => <ExistingStopEditor key={stop.id} stop={stop} index={index} startingState={draft.startingState} timingContext={draft} bias={draft.startingPlace??undefined} errors={errors} onChange={updated => { set('existingStops', draft.existingStops.map(s => s.id === updated.id ? updated : s)); setErrors(current => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`stop.${updated.id}.`)))); }} onRemove={() => { onChange(removeExistingStop(draft, stop.id)); setModeError(''); setErrors({}); }}/>) }
      {canAdd && <button type="button" className="secondary add-stop" onClick={() => { set('existingStops', [...draft.existingStops, newStop(draft.startingState === 'anchor' || draft.startingState === 'reservation')]); }}>+ Add existing stop</button>}
      </div>}</section>
      {draft.startingPlace&&<section className="panel"><h2>Plan map</h2><PlaceMap places={[draft.startingPlace,...draft.existingStops.flatMap(stop=>stop.place?[stop.place]:[])]}/></section>}
      <div className="submit-row"><div><strong>Your pieces stay yours.</strong><p>Build one plan around your fixed decisions and available time.</p></div><button className="primary" type="submit" disabled={busy}>{busy?'Building your outing…':'Build My Plan'} <span aria-hidden="true">→</span></button></div>
    </form></>;
}
