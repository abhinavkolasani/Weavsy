# Controlled place catalog — Batch 2

**All 24 records are synthetic TEST fixtures. None is a real business, park, street or Orange County recommendation.** All costs, hours, durations, tags and group limits are deliberately invented test inputs. No live Maps, external API, database or API key is used.

The guest form, its fixed/flexible user-entered pieces, submitted requests, session key and session schema are unchanged. The existing request founder metadata still describes the Batch 1 intake contract; it is not a claim that this data layer generates itineraries.

## Files and the single public boundary

- `syntheticCatalog.ts`: literal, manually inspectable test records. IDs never depend on array order, current display name, random generation or timestamps.
- `types.ts`: Place schema and the async PlaceService interface.
- `index.ts`: the **only entry point future UI/planning code should import** for place data; it exports `placeService` and public types.
- `localPlaceService.ts`: internal file-backed adapter. Replace behind the same interface if a later batch approves a database/API.
- `validateCatalog.ts`: runtime validation, including unique IDs, valid prices/durations, all seven days, timezone, ordered hours and group bounds. Invalid source data fails before any record is served.
- `../itinerary/catalogContract.ts`: validation for future planner-selected Place ID references. This is not a planner or itinerary generator.
- `../../scripts/inspect-catalog.ts`: founder command-line inspection using the same service.
- `../../tests/catalog.test.ts`: catalog/service/selection contract regression tests.

## Explain one record

Run from the project folder:

```sh
pnpm catalog:inspect --place TEST_SIT_DOWN_01
```

| Field | Meaning |
| --- | --- |
| `place_id` | Stable internal ID. Keep it when editing a name; never reuse a retired ID for a different place. |
| `name` | Visible name. Every synthetic record starts with `TEST_` to prevent accidental factual presentation. |
| `category` | One of the seven controlled categories below. |
| `area` | Broad location grouping. These records use explicitly fictional TEST zones. |
| `address` | A real address when supported by data; `null` in every synthetic record here. |
| `latitude`, `longitude` | Optional coordinate pair; both `null` here. No fake coordinates or travel distances. |
| `estimated_cost_per_person` | Integer `amount_cents` and `currency: "USD"`. Example: 3200 means $32/person. This is a test estimate, not a quoted price. |
| `typical_duration_minutes` | Positive whole minutes for a future planner to consider. Not a reservation or actual visit length. |
| `vibe_tags` | Controlled fixture tags such as quiet, foodie, active or social. |
| `occasion_tags` | Suitable test contexts such as solo, friends, dinner or celebration. |
| `opening_hours.timezone` | IANA clock reference. America/Los_Angeles is the scenario clock, not evidence that these places exist in LA or Orange County. |
| `opening_hours.weekly` | All seven named weekdays, each with zero/multiple local-time intervals or null. |
| `group_size` | Optional object with `min`, `max`, `recommended`; individual values can be null. Min/max are known bounds; recommendation is a hint. Whole object null means unknown. |
| `active` | Whether a future planner may select this place. Inactive records remain inspectable. |
| `data_status` | `synthetic` here. Schema also permits verified/estimated for later properly sourced data. No entries currently claim either status. |
| `data_notes` | Visible provenance/limitations. Every record states that it is synthetic and not a real place. |

### Hours semantics

- `{ "opens": "12:00", "closes": "21:00" }` means a local interval with opening included and closing excluded.
- `[]` means closed that day; `null` means hours unknown. **Unknown must not be treated as open by default.**
- Multiple intervals support a break between lunch and dinner. Intervals must be ordered and non-overlapping.
- Opening uses `00:00` through `23:59`; closing also allows `24:00` for the end of that day.
- Represent an overnight span as separate intervals across the two days. A Friday 22:00–Saturday 02:00 span is Friday 22:00–24:00 plus Saturday 00:00–02:00.
- The first sit-down fixture is closed Monday, has two Wednesday intervals, closes at 21:00 Friday and 23:00 Saturday.
- `TEST_WALK_03` has unknown Thursday hours as a future-planning edge case.
- No holiday/special-date overrides, availability checks or scheduling logic are built in this batch.

## Catalog composition

| Category | Records | Active |
| --- | ---: | ---: |
| Sit-down food | 4 | 3 |
| Casual food | 3 | 3 |
| Café/dessert | 4 | 4 |
| Active activity | 4 | 4 |
| Entertainment | 3 | 2 |
| Shopping/walking | 3 | 3 |
| Park/viewpoint/low-cost | 3 | 3 |
| **Total** | **24** | **22** |

Fixture costs span **$0–$65/person**, durations **20–150 minutes**, with solo and group contexts, quiet/active/social/foodie/creative vibes, split hours and closed days. `TEST_SIT_DOWN_04` and `TEST_ENTERTAINMENT_03` are deliberately inactive. There are **0 verified, 0 estimated-real-world and 24 synthetic entries**.

## Query examples

```ts
import { placeService } from './data/index.ts'; // Adjust relative path for the caller.

const active = await placeService.listActivePlaces();
const one = await placeService.getPlaceById('TEST_CAFE_01');
const candidates = await placeService.queryPlaces({
  category: 'cafe_dessert',
  max_cost_per_person_cents: 700,
  vibe_tags_any: ['cozy', 'quiet'],
  group_size: 2,
});
```

All methods are async, so consumers do not depend on the storage type. Outputs are detached copies: mutating a returned nested object cannot change the catalog.

- `listActivePlaces()` and `queryPlaces()` exclude inactive records by default.
- `getPlaceById()` is exact and case-sensitive. Unknown IDs return `null`; known inactive records are returned with `active: false` for inspection.
- `queryPlaces({ include_inactive: true })` includes inactive records **for inspection, not planner selection**.
- Available filters: category, exact area, maximum cost in cents, any vibe tags, any occasion tags, group size and data status.
- Different filters combine with AND. Inside a tag list, any matching tag qualifies. An omitted/empty tag list does not restrict results.
- Maximum price is inclusive; zero selects only free fixtures. Min/max group bounds are inclusive. Unknown group limits do not exclude candidates; they are not guarantees of capacity. Recommended size is not a hard filter.
- Unknown filters and invalid filter values throw a clear `PlaceQueryError`, rather than being ignored. No matches returns an empty array; no records are invented.

## Catalog-only selection contract

```ts
import { validatePlannerSelectedStops } from './itinerary/catalogContract.ts';

const checked = await validatePlannerSelectedStops([
  { place_id: 'TEST_CAFE_01' },
  { place_id: 'TEST_PARK_01' },
]);
if (!checked.ok) {
  // Show/log checked.issues; do not use any part of this selection.
} else {
  // Each checked.stops entry has source: 'catalog', place_id, and canonical place facts.
}
```

Only a Place ID is accepted as candidate input. Submitted names/prices/hours are rejected; canonical facts are resolved through PlaceService. Successful results use a branded `ValidatedCatalogStop` type to guide future TypeScript code toward this validation boundary. Do not bypass it with casts.

Errors identify the failing zero-based index, ID (when present), code and readable message:

- `INVALID_SELECTION`: wrong payload shape or extra fields such as an invented name.
- `INVALID_PLACE_ID`: missing, blank or non-string ID.
- `PLACE_NOT_FOUND`: ID absent from the catalog (including case/whitespace differences).
- `PLACE_INACTIVE`: known record is not selectable.

If one reference fails, no partial accepted selection is returned. Service failures propagate; there is no fabricated fallback. Revalidate at use time if catalog status may have changed. An empty reference array is valid as an empty selection; this contract does not claim it is a complete outing.

**This applies only to future planner-selected stops.** User-entered anchor/reservation/free-text pieces remain independent structured request data. They are not forcibly catalog-matched, rejected or removed in Batch 2.

## Inspection commands

```sh
pnpm catalog:inspect
pnpm catalog:inspect --place TEST_SIT_DOWN_01
pnpm catalog:inspect --validate TEST_CAFE_01 TEST_PARK_01
pnpm catalog:inspect --validate TEST_MISSING_99
pnpm catalog:inspect --validate TEST_SIT_DOWN_04
pnpm test
pnpm build
```

The two invalid-reference examples deliberately exit with code 1 and a readable error; that is expected success for the rejection benchmark. The first inspection command shows all IDs, statuses and category counts. No command calls an external service.

## Editing data later

Edit the literal fixture records without changing existing IDs. Keep TEST names and synthetic status for made-up data. Add a new ID for a new place; retire an existing record by setting `active: false` rather than reusing its ID. Run tests/build and review every changed assumption. Introducing real records requires actual sources and an explicit decision about which fields are verified versus estimated; do not simply relabel these synthetic fixtures as verified.

Batch 2 first-pass checks do not imply graduation. Use `BATCH_2_CHECKLIST.md`. No Batch 3 planning engine has been started.
