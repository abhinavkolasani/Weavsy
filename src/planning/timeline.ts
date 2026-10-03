import type { ExistingStop, ExistingStopDraft, PlanningDraft } from './types.ts';

export const isClockTime = (time: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
export const clockMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
export function addDays(date: string, days: number) {
  const value = new Date(date + 'T12:00:00Z');
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function outingWindow(context: Pick<PlanningDraft, 'availableStartTime' | 'requiredEndTime'>) {
  const start = clockMinutes(context.availableStartTime), end = clockMinutes(context.requiredEndTime);
  const endDayOffset = end < start ? 1 : 0;
  return { start, finish: end + endDayOffset * 1440, endDayOffset: endDayOffset as 0 | 1 };
}
/** Minutes on the outing timeline; midnight is 1440, not a jump backwards to zero. */
export function stopTiming(context: Pick<PlanningDraft, 'availableStartTime'>, stop: Pick<ExistingStop | ExistingStopDraft, 'startTime' | 'endTime' | 'startDayOffset' | 'endDayOffset'>) {
  const origin = isClockTime(context.availableStartTime) ? clockMinutes(context.availableStartTime) : 0;
  const startClock = stop.startTime && isClockTime(stop.startTime) ? clockMinutes(stop.startTime) : null;
  const endClock = stop.endTime && isClockTime(stop.endTime) ? clockMinutes(stop.endTime) : null;
  const startDayOffset = startClock === null ? null : stop.startDayOffset ?? (startClock < origin ? 1 : 0);
  const endDayOffset = endClock === null ? null : stop.endDayOffset ?? (startClock !== null ? startDayOffset! + (endClock < startClock ? 1 : 0) : endClock < origin ? 1 : 0);
  return { start: startClock === null ? null : startClock + startDayOffset! * 1440, end: endClock === null ? null : endClock + endDayOffset! * 1440, startDayOffset, endDayOffset };
}
/** Freeze the date of existing decisions before an outing's start time changes. */
export function preserveStopDays(draft: PlanningDraft): PlanningDraft {
  if (!isClockTime(draft.availableStartTime)) return draft;
  return { ...draft, existingStops: draft.existingStops.map(stop => {
    const timing = stopTiming(draft, { ...stop, endTime: stop.timingDetail === 'end-time' ? stop.endTime : '' });
    return { ...stop, ...(timing.startDayOffset !== null ? { startDayOffset: timing.startDayOffset as 0 | 1 } : {}), ...(timing.endDayOffset !== null && timing.endDayOffset <= 1 ? { endDayOffset: timing.endDayOffset as 0 | 1 } : {}) };
  }) };
}
export const timelineClock = (minutes: number) => `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
export const timelineDay = (minutes: number) => Math.floor(minutes / 1440) as 0 | 1;
