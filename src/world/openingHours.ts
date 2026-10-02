import { WEEKDAYS } from './types.ts';
import type { OpeningHours } from './types.ts';
/** Only the simple weekly subset is interpreted; holidays/seasonal/overnight rules stay unknown. */
export function normalizeOpeningHours(expression?: string): OpeningHours | null {
  if (!expression) return null;
  const weekly: NonNullable<OpeningHours['weekly']> = {monday:[],tuesday:[],wednesday:[],thursday:[],friday:[],saturday:[],sunday:[]};
  if (expression === '24/7') { for (const day of WEEKDAYS) weekly[day] = [{opens:'00:00',closes:'24:00'}]; return {source_expression:expression,weekly}; }
  const dayNames = ['Mo','Tu','We','Th','Fr','Sa','Su'];
  const seenDays=new Set<number>();
  const unknown = () => ({source_expression:expression,weekly:null});
  for (const rule of expression.split(';')) {
    const match = /^\s*((?:Mo|Tu|We|Th|Fr|Sa|Su)(?:[-,](?:Mo|Tu|We|Th|Fr|Sa|Su))*)\s+(off|closed|(?:\d{2}:\d{2}-\d{2}:\d{2})(?:\s*,\s*\d{2}:\d{2}-\d{2}:\d{2})*)\s*$/.exec(rule);
    if (!match) return unknown();
    const days: number[] = [];
    for (const part of match[1].split(',')) {
      const [first,last=first] = part.split('-').map(d => dayNames.indexOf(d));
      if (last < first) return unknown();
      for (let i=first;i<=last;i++) days.push(i);
    }
    const intervals = ['off','closed'].includes(match[2]) ? [] : match[2].split(',').map(part => {const [opens,closes]=part.trim().split('-');return {opens,closes};});
    if (intervals.some(i => !/^([01]\d|2[0-3]):[0-5]\d$/.test(i.opens) || !/^(?:([01]\d|2[0-3]):[0-5]\d|24:00)$/.test(i.closes) || i.closes <= i.opens)) return unknown();
    for (const day of days) { if (seenDays.has(day)) return unknown(); seenDays.add(day); weekly[WEEKDAYS[day]] = intervals; }
  }
  return {source_expression:expression,weekly};
}
