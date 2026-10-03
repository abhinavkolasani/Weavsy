export function timeParts(value: string) {
  if (!value) return { hour: '', minute: '00', period: 'PM' };
  const [hour, minute] = value.split(':');
  const h = Number(hour);
  return { hour: String(h % 12 || 12), minute, period: h >= 12 ? 'PM' : 'AM' };
}
export function toInternalTime(hour: string, minute: string, period: string) {
  if (!hour) return '';
  return `${String(Number(hour) % 12 + (period === 'PM' ? 12 : 0)).padStart(2, '0')}:${minute}`;
}
export function displayTime(value: string, dayOffset = 0) {
  if (!value) return 'Not specified';
  const p = timeParts(value);
  return `${p.hour}:${p.minute} ${p.period}${dayOffset === 1 ? ' (next day)' : ''}`;
}
/** Typed clock text with an explicit period; never guess what “7” means without AM/PM. */
export function parseTypedTime(text: string, period: string): string | null {
  const match = /^\s*(0?[1-9]|1[0-2])(?::([0-5]\d))?\s*$/i.exec(text);
  return match && ['AM','PM'].includes(period) ? toInternalTime(String(Number(match[1])), match[2] ?? '00', period) : null;
}
