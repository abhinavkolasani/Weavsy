import { useEffect, useRef, useState } from 'react';
import { parseTypedTime, timeParts } from '../planning/displayTime';
import { isClockTime } from '../planning/timeline';
function editorParts(value: string) {
  if (isClockTime(value)) { const p = timeParts(value); return { text: `${p.hour}:${p.minute}`, period: p.period }; }
  const match = /^(.*)\s+(AM|PM)$/i.exec(value);
  return { text: match ? match[1] : value, period: match ? match[2].toUpperCase() : 'PM' };
}
export function TimeInput({ id, value, onChange, invalid = false, minimum }: { id: string; value: string; onChange: (value: string) => void; invalid?: boolean; minimum?: string }) {
  const [parts, setParts] = useState(() => editorParts(value));
  const emitted = useRef(value);
  useEffect(() => { if (value !== emitted.current) { setParts(editorParts(value)); emitted.current = value; } }, [value]);
  function update(text: string, period: string) {
    const suffix = /\s*(AM|PM)\s*$/i.exec(text);
    if (suffix) { period = suffix[1].toUpperCase(); text = text.slice(0, suffix.index).trim(); }
    setParts({ text, period });
    const next = text.trim() ? parseTypedTime(text, period) ?? `${text} ${period}` : '';
    emitted.current = next; onChange(next);
  }
  function finishEditing() {
    const parsed = parseTypedTime(parts.text, parts.period);
    if (!parsed) return;
    const next = minimum && parsed < minimum ? minimum : parsed;
    setParts(editorParts(next)); emitted.current = next; onChange(next);
  }
  return <div className="time-input">
    <input id={id} type="text" inputMode="text" autoComplete="off" spellCheck={false} placeholder="7:30" value={parts.text} aria-invalid={invalid} aria-describedby={invalid ? `${id}-error` : undefined} onChange={e => update(e.target.value, parts.period)} onBlur={finishEditing}/>
    <select aria-label="AM or PM" value={parts.period} aria-invalid={invalid} onChange={e => update(parts.text, e.target.value)}><option>AM</option><option>PM</option></select>
  </div>;
}
