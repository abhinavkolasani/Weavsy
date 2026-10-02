import { DAYS, PLACE_CATEGORIES } from './types.ts';
import type { Place } from './types.ts';

export class CatalogValidationError extends Error {
  readonly issues: readonly string[];
  constructor(issues: string[]) {
    super(`Invalid place catalog:\n${issues.join('\n')}`);
    this.name = 'CatalogValidationError';
    this.issues = issues;
  }
}
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const positiveInteger = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
const tags = (value: unknown) => Array.isArray(value) && value.length > 0 && value.every(text) && new Set(value).size === value.length;
const time = (value: unknown, allowMidnight: boolean) => typeof value === 'string' &&
  (/^([01]\d|2[0-3]):[0-5]\d$/.test(value) || (allowMidnight && value === '24:00'));
const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));

/** Validate the entire dataset before exposing any records. No silent coercion or repair. */
export function assertValidCatalog(input: unknown): asserts input is readonly Place[] {
  if (!Array.isArray(input) || input.length === 0) throw new CatalogValidationError(['catalog: expected a non-empty array.']);
  const issues: string[] = [];
  const ids = new Set<string>();
  input.forEach((place: unknown, index) => {
    const root = `places[${index}]`;
    const fail = (field: string, message: string) => issues.push(`${root}.${field}: ${message}`);
    if (!record(place)) { fail('record', 'expected an object.'); return; }
    if (!text(place.place_id) || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(place.place_id)) fail('place_id', 'a stable nonempty identifier is required.');
    else if (ids.has(place.place_id)) fail('place_id', `duplicate ID ${place.place_id}.`);
    else ids.add(place.place_id);
    for (const field of ['name', 'area', 'data_notes']) if (!text(place[field])) fail(field, 'a nonempty string is required.');
    if (!PLACE_CATEGORIES.includes(place.category as never)) fail('category', 'unknown category.');
    if (place.address !== null && !text(place.address)) fail('address', 'use an address string or null.');
    for (const [field, bound] of [['latitude', 90], ['longitude', 180]] as const) {
      const value = place[field];
      if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > bound)) fail(field, `use null or a finite number within ±${bound}.`);
    }
    if ((place.latitude === null) !== (place.longitude === null)) fail('coordinates', 'both coordinates must be present or both null.');
    const cost = place.estimated_cost_per_person;
    if (!record(cost) || !Number.isSafeInteger(cost.amount_cents) || Number(cost.amount_cents) < 0 || cost.currency !== 'USD') fail('estimated_cost_per_person', 'use nonnegative integer amount_cents and currency USD.');
    if (!positiveInteger(place.typical_duration_minutes)) fail('typical_duration_minutes', 'use a positive whole number.');
    for (const field of ['vibe_tags', 'occasion_tags']) if (!tags(place[field])) fail(field, 'use a nonempty list of unique, nonempty tags.');
    if (typeof place.active !== 'boolean') fail('active', 'use true or false.');
    if (!['verified', 'estimated', 'synthetic'].includes(String(place.data_status))) fail('data_status', 'use verified, estimated or synthetic.');
    if (place.data_status === 'synthetic' && (!text(place.name) || !place.name.startsWith('TEST_'))) fail('name', 'synthetic records must have a visible TEST_ name.');

    if (place.data_status !== 'synthetic') {
      const v = place.verification;
      if (!record(v) || !text(v.source_reference) || !text(v.verified_at) || Number.isNaN(Date.parse(String(v.verified_at))) || !Array.isArray(v.estimated_fields) || !v.estimated_fields.every(text)) fail('verification', 'real records require source_reference, verified_at and estimated_fields.');
    }
    const group = place.group_size;
    if (group !== null) {
      if (!record(group)) fail('group_size', 'use null or a group-size object.');
      else {
        for (const key of ['min', 'max', 'recommended']) if (group[key] !== null && !positiveInteger(group[key])) fail(`group_size.${key}`, 'use null or a positive integer.');
        if (positiveInteger(group.min) && positiveInteger(group.max) && group.min > group.max) fail('group_size', 'min exceeds max.');
        if (positiveInteger(group.recommended) && ((positiveInteger(group.min) && group.recommended < group.min) || (positiveInteger(group.max) && group.recommended > group.max))) fail('group_size.recommended', 'must lie within known min/max bounds.');
      }
    }
    const hours = place.opening_hours;
    if (!record(hours) || !record(hours.weekly)) { fail('opening_hours', 'provide a timezone and all seven named days.'); return; }
    try {
      if (!text(hours.timezone)) throw new Error();
      new Intl.DateTimeFormat('en-US', { timeZone: hours.timezone });
    } catch { fail('opening_hours.timezone', 'provide a valid IANA timezone.'); }
    if (Object.keys(hours.weekly).some(day => !DAYS.includes(day as never))) fail('opening_hours.weekly', 'unknown day key.');
    for (const day of DAYS) {
      const intervals = hours.weekly[day];
      if (intervals === null) continue;
      if (!Array.isArray(intervals)) { fail(`opening_hours.${day}`, 'use intervals, [] for closed, or null for unknown.'); continue; }
      let lastClose = -1;
      intervals.forEach((interval: unknown, position) => {
        const field = `opening_hours.${day}[${position}]`;
        if (!record(interval) || !time(interval.opens, false) || !time(interval.closes, true)) { fail(field, 'use valid opens/closes HH:mm times (closing may be 24:00).'); return; }
        const open = minutes(interval.opens as string), close = minutes(interval.closes as string);
        if (close <= open) fail(field, 'closing must follow opening; split overnight hours across two days.');
        if (open < lastClose) fail(field, 'intervals must be ordered and cannot overlap.');
        lastClose = close;
      });
    }
  });
  if (issues.length) throw new CatalogValidationError(issues);
}
