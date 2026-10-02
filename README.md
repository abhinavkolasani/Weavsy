# Outing planner V0.1

A guest-first outing request prototype with real worldwide location/place selection, an optional map, and a saved-request summary. The existing React/TypeScript/Vite and Node/SQLite stack is retained. No account, Google key or OpenAI key is needed.

## Run

Use Node 24 for native SQLite. From this project directory:

```
pnpm install
pnpm dev
```

Open [the local app](http://127.0.0.1:5174/). Internet access is needed for real search and map tiles. This URL works on the computer running the server; it is not a public deployment. Edits appear at the same URL while the server is running.

`pnpm test` runs regressions; `pnpm build` checks TypeScript and builds the frontend; `pnpm start` serves the built app **with its API and SQLite store**. Plain Vite preview has no planning API. `PORT` overrides the server port.

Optional provider settings are in `.env.example`. Put overrides in ignored `.env.local` and restart the server. The defaults work without credentials.

## Current behavior

All eight inputs and five starting states remain supported. New drafts default to today's browser-local date and Nothing planned. Budget is always per person: five people at $40 preserves 4000 cents each. Times use explicit AM/PM and normalized internal storage. There is **no default 7 PM stop**. Each fixed stop retains the time, note and identity entered by the user.

Choose a real search result for the origin and venue stops. Editing text clears its selection. An activity without a specific venue can remain explicitly user-provided text; it is never labeled as a verified place. Build My Plan saves structured data and shows a summary. It does not generate an itinerary yet.

Real records come from OpenStreetMap through Photon, with selected-record details from Overpass. MapLibre displays OpenFreeMap tiles. Search has no country restriction; LA is the default context for development category searches with no specified area. Community data can be incomplete, outdated or unavailable. Missing prices, durations and hours remain unknown. No fake business fallback is used.

SQLite stores local request snapshots and rebuild linkage in ignored `.data/plan-runs.sqlite`. Browser session storage preserves drafts/results through refresh. Source identity stays separate from user fixed/flexible status, time and notes. The server validates IDs and uses canonical provider identity instead of trusting caller facts.

`/founder/places` (also `/founder`) is the isolated real-place search and scenario surface. No consumer debug link is added. The older synthetic catalog, engineering composition, travel fixtures, tests and raw run access remain in the repository. They are not used by the guest Build action or live lab.

No live routing, traffic, weather, chatbot, accounts, booking, payment or autonomous planning were added. See [WORLD_DATA_HANDOFF.md](WORLD_DATA_HANDOFF.md) for current architecture, setup, verification, limitations and the founder checklist. Older handoffs describe historical batches; their Google setup gate has been superseded by the user's approved OpenStreetMap approach.

## Verified catalog import

`pnpm catalog:import /absolute/path/catalog.json` validates a catalog and creates `src/data/importedCatalog.ts`. Review it and update `src/data/index.ts` to activate the imported records. Real records require source/reference, verified-at date and estimated-field metadata. Keep stable IDs. The synthetic source shows the full schema; never convert a TEST fixture into an invented business.

These older controlled catalog tools do not populate or replace the live provider. [TECHNICAL_HANDOFF.md](TECHNICAL_HANDOFF.md) describes the historical engineering baseline.
