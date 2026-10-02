# Founder prototype handoff

Branch: `main`. Baseline commit: `46938ff`. Final implementation commit is the latest `git log -1`; every run stores the commit the server started with. No remote is configured; commits are local.

Run with Node 24 (native SQLite required): `pnpm install`, `pnpm dev`. Open http://127.0.0.1:5174. `pnpm test` runs regression tests, `pnpm build` verifies and builds, `pnpm start` serves the built app with the same persistent API. `PORT` overrides 5174. Start from the project directory. Keep one server running per port.

## Architecture and data

React guest form preserves existing session drafts and structured fixed/flexible constraints. The API validates submitted drafts, converts them to `PlanningRequest`, invokes deterministic composition and persists the complete raw run before returning it. Session drafts remain in the tab; the last Run ID retrieves the authoritative result from SQLite after refresh. Edit and rebuild leaves the prior raw run intact and adds a rebuild event with the next Run ID.

`src/planning/types.ts` is the input model, including all eight guest fields, five starting situations, and preservation flags. `compose.ts` records open windows before/between/after fixed commitments, explicit duration assumptions and conflict diagnostics. It reserves known existing-stop costs before filling windows, leaves breathing room and returns one itinerary or a conflict. Fixed identity/time/end/duration are retained. Flexible identities are retained and scheduled when possible. Ranking uses interests and category variety; the deterministic calculations constrain time, hours, group size, known budget and travel.

`src/data/index.ts` is the catalog service boundary; IDs are stable. All 24 current records are openly fictional TEST fixtures, not real Los Angeles or Orange County businesses. Data includes categories, areas, costs, duration, tags, per-day hours, suitability and active status. Real catalog records require verification source/reference, verified-at timestamp and estimated-field names. Use `pnpm catalog:import /absolute/path/catalog.json`; the importer validates and writes `src/data/importedCatalog.ts`. Review the generated source and deliberately switch the import in `src/data/index.ts` to activate it. Existing synthetic entries are a schema example; do not relabel them as real businesses.

`src/data/travel.ts` is the replaceable TravelProvider: fictional zone matrix and explicit unknown-location fallback. Exact catalog IDs, names and fictional areas can resolve the starting point; the first fixed stop at the exact starting place needs no travel or arrival buffer. Untimed stops wait for a feasible opening interval, and flexible start preferences are kept when feasible. No maps, traffic, starting-address geocoding or live coverage. Known estimates consume time with ten-minute arrival buffers. Finishing is at the final stop, without a return journey. Unknown user-entered places retain unknown costs/hours/location, display a conspicuous budget-not-confirmed notice, and are never represented as verified catalog selections.

`src/itinerary/plan.ts` defines the canonical run and stops, including per-stop provenance and actual run catalog data statuses, IDs, chronology, duration, travel/buffer, cost, source, fixed status, fit reason, assumptions and conflicts. Planner-selected IDs are revalidated through the catalog contract. The founder disclosure exposes received constraints, open windows, candidates/rejections, selected IDs, build, raw itinerary, conflicts and assumptions, without hidden model reasoning.

`.data/plan-runs.sqlite` stores `plan_runs` raw JSON and `plan_events` rebuild linkage. Runtime data is gitignored and excluded from Product Intelligence. GET `/api/runs/:id` provides raw JSON. POST `/api/plans` accepts `{draft,parentRunId?}`. Unexpected generation errors are stored as failure runs; validation errors return field diagnostics. This local unauthenticated prototype should remain localhost-only.

## Verification and case breaking

39 tests passed: all five states, four-friends Saturday 2–9 PM $60 driving food+active smoke, 7 PM fixed preservation, end-only preservation, insufficient travel between fixed stops, zero budget, catalog IDs/inactive handling, legacy draft/session behavior and SQLite connection restart/rebuild linkage. Build passed. Browser QA performed separately on the running preview.

Known limitations: local same-day time windows; estimated prices do not guarantee real costs; unknown costs prevent confirmed total-budget compliance; no live routing/geocoding; greedy deterministic selection can reject some feasible complex cases; no swaps/locks/social/accounts/booking. TEST plans are for case breaking only. Unknown custom-stop hours cannot be verified. Fixed custom times are preserved rather than fabricated or moved.

Try tight windows, split/closed hours, large groups, budgets below a known fixed stop, several flexible stops before a later fixed reservation, unknown custom places, conflicting fixed durations, end-only commitments and repeated refresh/edit/rebuild. Compare each stored run and record human diagnoses in the separate Product Intelligence workflow.
