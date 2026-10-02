import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { STARTING_STATES } from '../planning/types';
import type { PlanningDraft, PlanningRequest, StartingState, ValidationErrors } from '../planning/types';
import { changeStartingState, newStop, removeExistingStop } from '../planning/draft';
import { validateRequest } from '../planning/validate';
import { Field, fieldAccessibility } from './Field';
import { ExistingStopEditor } from './ExistingStopEditor';
export function PlanningForm({ draft, onChange, onSubmit }: { draft: PlanningDraft; onChange: (draft: PlanningDraft) => void; onSubmit: (request: PlanningRequest) => void }) {
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [modeError, setModeError] = useState('');
  const errorRef = useRef<HTMLDivElement>(null);
  const set = <K extends keyof PlanningDraft>(key: K, value: PlanningDraft[K]) => { onChange({ ...draft, [key]: value }); setErrors(current => { const next = { ...current }; delete next[key]; return next; }); };
  const switchMode = (mode: StartingState) => { const next = changeStartingState(draft, mode); setModeError(next.error ?? ''); if (!next.error) { onChange(next.draft); setErrors({}); } };
  const submit = (event: FormEvent) => { event.preventDefault(); const result = validateRequest(draft); if (!result.ok) { setErrors(result.errors); requestAnimationFrame(() => errorRef.current?.focus()); return; } setErrors({}); onSubmit(result.request); };
  const errorKeys = Object.keys(errors);
  const canAdd = draft.startingState === 'partial-plan' || draft.startingState === 'almost-complete' || draft.existingStops.length === 0;
  return <><div className="page-heading"><p className="eyebrow">YOUR OUTING</p><h1>What do you have in mind?</h1><p>Start with what you know. Keep the pieces you’ve already decided.</p></div>
    <form onSubmit={submit} noValidate>
      {errorKeys.length > 0 && <div ref={errorRef} tabIndex={-1} className="error-summary" role="alert"><strong>Check {errorKeys.length === 1 ? 'this detail' : 'these details'} before continuing.</strong><ul>{errorKeys.map(key => <li key={key}><a href={`#${key}`} onClick={e => { e.preventDefault(); document.getElementById(key)?.focus(); }}>{errors[key]}</a></li>)}</ul></div>}
      <section className="panel" aria-labelledby="basics-title"><div className="section-heading"><span className="section-number">1</span><h2 id="basics-title">The basics</h2></div>
      <Field id="startingLocation" label="Starting location" error={errors.startingLocation}><input id="startingLocation" autoComplete="off" value={draft.startingLocation} onChange={e => set('startingLocation', e.target.value)} placeholder="An address, neighborhood or landmark" {...fieldAccessibility('startingLocation', errors.startingLocation)}/></Field>
      <div className="form-grid"><Field id="date" label="Date" error={errors.date}><input id="date" type="date" value={draft.date} onChange={e => set('date', e.target.value)} {...fieldAccessibility('date', errors.date)}/></Field>
      <Field id="budgetPerPerson" label="Budget per person (USD)" error={errors.budgetPerPerson}><input id="budgetPerPerson" type="number" min="0" step="0.01" inputMode="decimal" value={draft.budgetPerPerson} onChange={e => set('budgetPerPerson', e.target.value)} placeholder="50.00" {...fieldAccessibility('budgetPerPerson', errors.budgetPerPerson)}/></Field>
      <Field id="availableStartTime" label="Available start time" error={errors.availableStartTime}><input id="availableStartTime" type="time" value={draft.availableStartTime} onChange={e => set('availableStartTime', e.target.value)} {...fieldAccessibility('availableStartTime', errors.availableStartTime)}/></Field>
      <Field id="requiredEndTime" label="Required end time" error={errors.requiredEndTime} hint="Start and finish on the selected date."><input id="requiredEndTime" type="time" value={draft.requiredEndTime} onChange={e => set('requiredEndTime', e.target.value)} {...fieldAccessibility('requiredEndTime', errors.requiredEndTime, true)}/></Field>
      <Field id="groupSize" label="Group size" error={errors.groupSize}><input id="groupSize" type="number" min="1" step="1" inputMode="numeric" value={draft.groupSize} onChange={e => set('groupSize', e.target.value)} {...fieldAccessibility('groupSize', errors.groupSize)}/></Field>
      <Field id="transportation" label="Transportation" error={errors.transportation}><select id="transportation" value={draft.transportation} onChange={e => set('transportation', e.target.value as PlanningDraft['transportation'])} {...fieldAccessibility('transportation', errors.transportation)}><option value="">Choose a way to get around</option><option value="driving">Driving</option><option value="walking">Walking</option><option value="transit">Transit</option></select></Field></div>
      <Field id="vibeInterests" label="Vibe / interests" error={errors.vibeInterests}><input id="vibeInterests" value={draft.vibeInterests} onChange={e => set('vibeInterests', e.target.value)} placeholder="For example, relaxed, good food, a little outdoors" {...fieldAccessibility('vibeInterests', errors.vibeInterests)}/></Field></section>
      <section className="panel" aria-labelledby="existing-title"><div className="section-heading"><span className="section-number">2</span><h2 id="existing-title">What’s already planned?</h2></div>
      <fieldset className="starting-states" id="startingState" tabIndex={-1} aria-describedby={modeError ? 'mode-error' : undefined}><legend className="sr-only">How much of the plan already exists?</legend>{STARTING_STATES.map(state => <label key={state.value} className={`state-choice ${draft.startingState === state.value ? 'selected' : ''}`}><input type="radio" name="startingState" value={state.value} checked={draft.startingState === state.value} onChange={() => switchMode(state.value)}/><span><strong>{state.label}</strong><small>{state.hint}</small></span></label>)}</fieldset>
      {(modeError || errors.startingState) && <p className="field-error" id="mode-error" role="alert">{modeError || errors.startingState}</p>}
      {draft.startingState !== 'nothing-planned' && <div className="existing-section" id="existingStops" tabIndex={-1}><p className="section-note">Add what you already know. Leave unknown times or duration blank. Existing stops stay here when you switch starting states.</p>{errors.existingStops && <p className="field-error">{errors.existingStops}</p>}
      {draft.existingStops.map((stop, index) => <ExistingStopEditor key={stop.id} stop={stop} index={index} startingState={draft.startingState} errors={errors} onChange={updated => { set('existingStops', draft.existingStops.map(s => s.id === updated.id ? updated : s)); setErrors(current => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`stop.${updated.id}.`)))); }} onRemove={() => { onChange(removeExistingStop(draft, stop.id)); setModeError(''); setErrors({}); }}/>) }
      {canAdd && <button type="button" className="secondary add-stop" onClick={() => { set('existingStops', [...draft.existingStops, newStop(draft.startingState === 'anchor' || draft.startingState === 'reservation')]); }}>+ Add existing stop</button>}
      </div>}</section>
      <div className="submit-row"><div><strong>Your pieces stay yours.</strong><p>This version collects your request. It won’t generate an itinerary yet.</p></div><button className="primary" type="submit">Build My Plan <span aria-hidden="true">→</span></button></div>
    </form></>;
}
