# Outing planner V0.1

A local guest prototype: enter outing details and existing decisions, then receive a clear saved-request summary. Stage A is independently verified; live Google integration is stopped for the manual setup in [GOOGLE_SETUP.md](GOOGLE_SETUP.md).

## Run

Use Node 24 for native SQLite. From this project directory:

```
pnpm install
pnpm dev
```

Open http://127.0.0.1:5174. No account or API key is required. `pnpm test` runs regressions; `pnpm build` checks TypeScript and builds the frontend; `pnpm start` serves the built app **with its planning API and SQLite store**. Do not use plain Vite preview for the full prototype; it has no planning API. `PORT` overrides the server port.

## Current behavior

All eight guest inputs and all five starting situations are supported. New drafts default to the browser's local date and Nothing planned. Budget stays per person independently of group size. Explicit AM/PM controls retain normalized internal times; consumer summaries use 12-hour time. Fixed identity, known times and notes remain structured. The normal guest results summarize the received request and clearly say an itinerary is not available yet.

The frontend sends the submitted draft to the local API. SQLite stores internal raw runs and rebuild linkage in `.data/plan-runs.sqlite`, excluded from Git. Browser session storage preserves the guest draft and request summary across refresh. Existing deterministic engineering composition and raw run diagnostics remain at `/founder`, without a consumer-facing debug link. Product Intelligence remains a separate human-reviewed evidence layer.

The internal catalog has 24 **fictional TEST places**, never real business claims. These recommendations are not displayed in the normal guest experience. The separate engineering TravelProvider uses a fictional zone matrix; custom user costs/hours/geography are unknown. There is no live routing, geocoding or real-world coverage yet. See [BATCH_HANDOFF.md](BATCH_HANDOFF.md) for all requested report items and the pass/blocked test matrix.

## Verified catalog import

`pnpm catalog:import /absolute/path/catalog.json` validates a catalog and creates `src/data/importedCatalog.ts`. Review it and update `src/data/index.ts` to activate the imported records. Real records require source/reference, verified-at date and estimated-field metadata. Keep stable IDs. The synthetic source shows the full schema; never convert a TEST fixture into an invented business.

See [TECHNICAL_HANDOFF.md](TECHNICAL_HANDOFF.md) for architecture, input/output models, persistence, validation, current limitations and case-breaking suggestions. Batch checklists describe the historical baseline only.
