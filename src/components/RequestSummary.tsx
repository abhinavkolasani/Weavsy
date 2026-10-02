import type { Submission } from '../planning/state';
import { displayTime } from '../planning/displayTime';
import { STARTING_STATES } from '../planning/types';
import { PlaceMap } from './PlaceMap';
import { placeUrl } from '../world/reference';
export function RequestSummary({ submission, onEdit }: { submission: Submission; onEdit: () => void }) {
  const { request } = submission;
  const budget = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: request.budgetPerPerson.amountCents % 100 ? 2 : 0 }).format(request.budgetPerPerson.amountCents / 100);
  return <><div className="page-heading"><p className="eyebrow">YOUR OUTING</p><h1>Your outing details are saved.</h1><p>Your choices are ready. A complete itinerary isn’t available yet.</p></div>
  <section className="panel"><div className="section-heading"><h2>Your outing</h2><button className="text-button" onClick={onEdit}>Edit details</button></div><p className="budget-summary">About {budget} per person</p><dl className="summary-grid">
  <div><dt>Where you are</dt><dd>{request.startingLocation}{request.startingPlace&&<small className="address-line">{request.startingPlace.formatted_address??'Address not supplied'}</small>}</dd></div><div><dt>Date</dt><dd>{new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(new Date(request.date + 'T12:00:00'))}</dd></div>
  <div><dt>Start</dt><dd>{displayTime(request.availableStartTime)}</dd></div><div><dt>Finish by</dt><dd>{displayTime(request.requiredEndTime)}</dd></div>
  <div><dt>Group</dt><dd>{request.groupSize} people</dd></div><div><dt>Getting around</dt><dd className="capitalize">{request.transportation}</dd></div><div><dt>Interests</dt><dd>{request.vibeInterests}</dd></div><div><dt>Already planned</dt><dd>{STARTING_STATES.find(s => s.value === request.startingState)?.label}</dd></div></dl></section>
  {!!request.existingStops.length && <section className="panel"><h2>Your decided pieces</h2><ol className="received-stops">{request.existingStops.map(s => <li key={s.id}><div className="received-stop-heading"><h3>{s.name}</h3><span className="status-badge">{s.fixed ? 'Fixed' : 'Flexible'}</span></div>{s.place&&<p className="hint">{s.place.formatted_address??'Address not supplied'} · <a href={placeUrl(s.place)} target="_blank" rel="noreferrer">View place</a></p>}<p>{s.startTime ? displayTime(s.startTime) : 'Start time open'}{s.endTime ? ` – ${displayTime(s.endTime)}` : ''}{s.durationMinutes ? ` · ${s.durationMinutes} minutes` : ''}</p>{s.note && <p>{s.note}</p>}</li>)}</ol></section>}
  {request.startingPlace&&<section className="panel"><h2>Your places</h2><PlaceMap places={[request.startingPlace,...request.existingStops.flatMap(s=>s.place?[s.place]:[])]}/><p className="hint">Location data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>.</p></section>}
  <button className="secondary" onClick={onEdit}>← Edit your outing</button></>;
}
