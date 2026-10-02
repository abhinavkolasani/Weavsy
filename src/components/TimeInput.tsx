import { useEffect, useState } from 'react';
import { timeParts, toInternalTime } from '../planning/displayTime';
export function TimeInput({ id, value, onChange, invalid = false }: { id: string; value: string; onChange: (value: string) => void; invalid?: boolean }) {
  const [parts, setParts] = useState(() => timeParts(value));
  useEffect(() => { setParts(timeParts(value)); }, [value]);
  const update = (key: 'hour' | 'minute' | 'period', next: string) => {
    const p = { ...parts, [key]: next };
    setParts(p);
    onChange(toInternalTime(p.hour, p.minute, p.period));
  };
  return <div className="time-input">
    <select id={id} aria-label="Hour" aria-invalid={invalid} value={parts.hour} onChange={e => update('hour', e.target.value)}><option value="">Hour</option>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select>
    <span aria-hidden="true">:</span>
    <select aria-label="Minute" value={parts.minute} onChange={e => update('minute', e.target.value)}>{Array.from({ length: 60 }, (_, i) => <option key={i} value={String(i).padStart(2, '0')}>{String(i).padStart(2, '0')}</option>)}</select>
    <select aria-label="AM or PM" value={parts.period} onChange={e => update('period', e.target.value)}><option>AM</option><option>PM</option></select>
  </div>;
}
