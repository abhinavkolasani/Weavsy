import type { ExistingStopDraft, StartingState, ValidationErrors } from '../planning/types';
import { Field, fieldAccessibility } from './Field';
export function ExistingStopEditor({ stop, index, startingState, errors, onChange, onRemove }: {
  stop: ExistingStopDraft; index: number; startingState: StartingState; errors: ValidationErrors;
  onChange: (stop: ExistingStopDraft) => void; onRemove: () => void;
}) {
  const requiredFixed = index === 0 && (startingState === 'anchor' || startingState === 'reservation');
  const reservation = index === 0 && startingState === 'reservation';
  const prefix = `stop.${stop.id}.`;
  const set = <K extends keyof ExistingStopDraft>(key: K, value: ExistingStopDraft[K]) => onChange({ ...stop, [key]: value });
  return <fieldset className="stop-editor"><legend>Existing stop {index + 1}</legend><div className="stop-toolbar"><span className={`status-badge ${stop.fixed ? 'fixed' : ''}`}>{stop.fixed ? 'Fixed — keep this stop' : 'Flexible'}</span><button type="button" className="text-button remove" aria-label={`Remove existing stop ${index + 1}`} onClick={onRemove}>Remove</button></div>
    <Field id={prefix + 'name'} label="Place or activity name" error={errors[prefix + 'name']}><input id={prefix + 'name'} value={stop.name} onChange={e => set('name', e.target.value)} placeholder="For example, dinner at a place you chose" {...fieldAccessibility(prefix + 'name', errors[prefix + 'name'])}/></Field>
    <div className="fixed-choice"><label><input type="checkbox" checked={stop.fixed} disabled={requiredFixed} onChange={e => set('fixed', e.target.checked)}/> Keep this stop fixed</label><p className="hint">{requiredFixed ? 'This is your anchor or reservation, so the place is fixed. Known times stay fixed too.' : 'Fixed keeps the place and any known timing. Flexible leaves room for changes later.'}</p></div>
    <div className="form-grid"><Field id={prefix + 'startTime'} label={reservation ? 'Fixed start time' : 'Start time (optional)'} error={errors[prefix + 'startTime']}><input id={prefix + 'startTime'} type="time" value={stop.startTime} onChange={e => set('startTime', e.target.value)} {...fieldAccessibility(prefix + 'startTime', errors[prefix + 'startTime'])}/></Field>
    <Field id={prefix + 'timingDetail'} label="Do you know when it finishes?"><select id={prefix + 'timingDetail'} value={stop.timingDetail} onChange={e => set('timingDetail', e.target.value as ExistingStopDraft['timingDetail'])}><option value="unknown">Not sure yet</option><option value="end-time">I know the end time</option><option value="duration">I know the duration</option></select></Field></div>
    {stop.timingDetail === 'end-time' && <Field id={prefix + 'endTime'} label="End time" error={errors[prefix + 'endTime']}><input id={prefix + 'endTime'} type="time" value={stop.endTime} onChange={e => set('endTime', e.target.value)} {...fieldAccessibility(prefix + 'endTime', errors[prefix + 'endTime'])}/></Field>}
    {stop.timingDetail === 'duration' && <Field id={prefix + 'durationMinutes'} label="Duration (minutes)" error={errors[prefix + 'durationMinutes']}><input id={prefix + 'durationMinutes'} type="number" min="1" step="1" inputMode="numeric" value={stop.durationMinutes} onChange={e => set('durationMinutes', e.target.value)} {...fieldAccessibility(prefix + 'durationMinutes', errors[prefix + 'durationMinutes'])}/></Field>}
    <Field id={prefix + 'note'} label="Note (optional)"><textarea id={prefix + 'note'} rows={2} value={stop.note} onChange={e => set('note', e.target.value)} placeholder="Anything about this stop you want to keep in mind"/></Field>
  </fieldset>;
}
