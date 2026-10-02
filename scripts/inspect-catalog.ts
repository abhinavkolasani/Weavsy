import { placeService, PLACE_CATEGORIES } from '../src/data/index.ts';
import { validatePlannerSelectedStops } from '../src/itinerary/catalogContract.ts';

const [command, ...args] = process.argv.slice(2);
if (command === '--place' && args.length === 1) {
  const place = await placeService.getPlaceById(args[0]);
  if (!place) { console.error(`PLACE_NOT_FOUND: ${args[0]}`); process.exitCode = 1; }
  else console.log(JSON.stringify(place, null, 2));
} else if (command === '--validate' && args.length > 0) {
  const result = await validatePlannerSelectedStops(args.map(place_id => ({ place_id })));
  console.log(JSON.stringify(result.ok ? { ok: true, place_ids: result.stops.map(stop => stop.place_id) } : result, null, 2));
  if (!result.ok) process.exitCode = 1;
} else if (command === undefined) {
  const places = await placeService.queryPlaces({ include_inactive: true });
  console.log('SYNTHETIC TEST CATALOG — no real places, addresses, coordinates, prices or hours.');
  console.log(JSON.stringify({
    total: places.length,
    active: places.filter(p => p.active).length,
    inactive: places.filter(p => !p.active).map(p => p.place_id),
    categories: Object.fromEntries(PLACE_CATEGORIES.map(category => [category, places.filter(p => p.category === category).length])),
    price_range_usd: [Math.min(...places.map(p => p.estimated_cost_per_person.amount_cents)) / 100, Math.max(...places.map(p => p.estimated_cost_per_person.amount_cents)) / 100],
    duration_range_minutes: [Math.min(...places.map(p => p.typical_duration_minutes)), Math.max(...places.map(p => p.typical_duration_minutes))],
    places: places.map(({place_id,category,active,data_status}) => ({place_id,category,active,data_status})),
  }, null, 2));
} else {
  console.error('Usage: pnpm catalog:inspect [--place PLACE_ID | --validate PLACE_ID ...]');
  process.exitCode = 1;
}
