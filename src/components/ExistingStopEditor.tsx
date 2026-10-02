import { TimeInput } from './TimeInput';
import type { ExistingStopDraft, StartingState, ValidationErrors } from '../planning/types';
import { Field, fieldAccessibility } from './Field';
import { PlacePicker } from './PlacePicker';
import type { Coordinates } from '../world/types';
export function ExistingStopEditor({ stop, index, startingState, errors, onChange, onRemove, bias }: {
  stop: ExistingStopDraft; index: number; startingState: StartingState; errors: ValidationErrors;
  onChange: (stop: ExistingStopDraft) => void; onRemove: () => void;
  bias?: Coordinates;
}) {
  const requiredFixed = index === 0 && (startingState === 'anchor' || startingState === 'reservation');
  const reservation = index === 0 && startingState === 'reservation';
  const prefix = `stop.${stop.id}.`;
  const set = <K extends keyof ExistingStopDraft>(key: K, value: ExistingStopDraft[K]) => onChange({ ...stop, [key]: value });
  return <fieldset className="stop-editor"><legend>Existing stop {index + 1}</legend><div className="stop-toolbar"><span className={`status-badge ${stop.fixed ? 'fixed' : ''}`}>{stop.fixed ? 'Fixed — keep this stop' : 'Flexible'}</span><button type="button" className="text-button remove" aria-label={`Remove existing stop ${index + 1}`} onClick={onRemove}>Remove</button></div>
    <Field id={prefix+'entryKind'} label="What kind of stop?"><select id={prefix+'entryKind'} value={stop.entryKind??'place'} onChange={e=>onChange({...stop,entryKind:e.target.value as 'place'|'activity',place:null})}><option value="place">A specific place</option><option value="activity">An activity without a specific venue</option></select></Field>
    <Field id={prefix + 'name'} label="Place or activity name" error={errors[prefix + 'name']}>{stop.entryKind==='activity'?<input id={prefix+'name'} value={stop.name} onChange={e=>onChange({...stop,name:e.target.value,place:null})} placeholder="For example, a walk together" {...fieldAccessibility(prefix+'name',errors[prefix+'name'])}/>:<PlacePicker id={prefix+'name'} value={stop.name} place={stop.place} bias={bias} onChange={(name,place)=>onChange({...stop,name,place,entryKind:'place'})} error={errors[prefix+'name']} placeholder="Search the exact place you’ve chosen"/>}</Field>
    <div className="fixed-choice"><label><input type="checkbox" checked={stop.fixed} disabled={requiredFixed} onChange={e => set('fixed', e.target.checked)}/> Keep this stop fixed</label><p className="hint">{requiredFixed ? 'This is your anchor or reservation, so the place is fixed. Known times stay fixed too.' : 'Fixed keeps the place and any known timing. Flexible leaves room for changes later.'}</p></div>
    <div className="form-grid"><Field id={prefix + 'startTime'} label={reservation ? 'Fixed start time' : 'Start time (optional)'} error={errors[prefix + 'startTime']}><TimeInput id={prefix + 'startTime'} value={stop.startTime} onChange={value => set('startTime', value)} invalid={!!errors[prefix + 'startTime']}/></Field>
    <Field id={prefix + 'timingDetail'} label="Do you know when it finishes?"><select id={prefix + 'timingDetail'} value={stop.timingDetail} onChange={e => set('timingDetail', e.target.value as ExistingStopDraft['timingDetail'])}><option value="unknown">Not sure yet</option><option value="end-time">I know the end time</option><option value="duration">I know the duration</option></select></Field></div>
    {stop.timingDetail === 'end-time' && <Field id={prefix + 'endTime'} label="End time" error={errors[prefix + 'endTime']}><TimeInput id={prefix + 'endTime'} value={stop.endTime} onChange={value => set('endTime', value)} invalid={!!errors[prefix + 'endTime']}/></Field>}
    {stop.timingDetail === 'duration' && <Field id={prefix + 'durationMinutes'} label="Duration (minutes)" error={errors[prefix + 'durationMinutes']}><input id={prefix + 'durationMinutes'} type="number" min="1" step="1" inputMode="numeric" value={stop.durationMinutes} onChange={e => set('durationMinutes', e.target.value)} {...fieldAccessibility(prefix + 'durationMinutes', errors[prefix + 'durationMinutes'])}/></Field>}
    <Field id={prefix + 'note'} label="Note (optional)"><textarea id={prefix + 'note'} rows={2} value={stop.note} onChange={e => set('note', e.target.value)} placeholder="Anything about this stop you want to keep in mind"/></Field>
  </fieldset>;
}
