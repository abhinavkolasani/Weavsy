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
export function displayTime(value: string) {
  if (!value) return 'Not specified';
  const p = timeParts(value);
  return `${p.hour}:${p.minute} ${p.period}`;
}
