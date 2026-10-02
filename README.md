# Outing planner V0.1

A complete local founder prototype: guest context → one structured outing, preserving fixed decisions, with deterministic scheduling and a controlled synthetic TEST catalog.

## Run

Use Node 24 for native SQLite. From this project directory:

```
pnpm install
pnpm dev
```

Open http://127.0.0.1:5174. No account or API key is required. `pnpm test` runs regressions; `pnpm build` checks TypeScript and builds the frontend; `pnpm start` serves the built app **with its planning API and SQLite store**. Do not use plain Vite preview for the full prototype; it has no planning API. `PORT` overrides the server port.

## Current behavior

All eight guest inputs and all five starting situations are supported. Fixed identity, times, end and duration are preserved; flexible pieces are scheduled around them. The planner records open windows, filters active catalog candidates by hours, capacity, budget and available time, reserves travel/buffers and produces one chronological itinerary or explicit conflicts. Untimed catalog pieces wait for opening intervals. Suitable flexible start preferences are retained.

The frontend sends the submitted draft to the local API. SQLite stores raw plan runs, errors and rebuild linkage in `.data/plan-runs.sqlite`, excluded from Git. Browser session storage preserves the guest draft and last Run ID; refreshing retrieves the saved itinerary. The founder disclosure shows structured constraints, assumptions, candidates, selected IDs, failures and itinerary. Product Intelligence remains a separate human-reviewed evidence layer.

The catalog has 24 **fictional TEST places**, never real business claims. The separate TravelProvider uses a fictional zone matrix and conservative fallback for unknown locations such as Los Angeles. Costs/hours/geography for custom user stops are unknown; results explicitly mark the budget unconfirmed when those costs are missing. There is no live routing, geocoding or real-world coverage yet.

## Verified catalog import

`pnpm catalog:import /absolute/path/catalog.json` validates a catalog and creates `src/data/importedCatalog.ts`. Review it and update `src/data/index.ts` to activate the imported records. Real records require source/reference, verified-at date and estimated-field metadata. Keep stable IDs. The synthetic source shows the full schema; never convert a TEST fixture into an invented business.

See [TECHNICAL_HANDOFF.md](TECHNICAL_HANDOFF.md) for architecture, input/output models, persistence, validation, current limitations and case-breaking suggestions. Batch checklists describe the historical baseline only.
