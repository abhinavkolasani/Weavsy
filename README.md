# Outing planner V0.1

A guest-first outing planner using React, TypeScript, Vite, a small Node server, and native SQLite. It returns one outing with real Google places and driving estimates, while preserving the user's fixed places and times.

## Run

Use Node 24. In this project directory:

```sh
pnpm install
pnpm dev
```

Open [the local app](http://127.0.0.1:5174/). This address runs on this computer; it is not a public deployment. Edits appear at the same address. Google credentials belong in ignored `.env.local`; see [GOOGLE_MAPS_SETUP.md](GOOGLE_MAPS_SETUP.md).

`pnpm build` checks TypeScript and builds the frontend. `pnpm start` serves the built frontend with its API. Plain `pnpm preview` does not include the planning API. `pnpm test` runs deterministic regression tests. `node --experimental-strip-types scripts/verify-live-plans.mjs` runs the live Google benchmarks and incurs normal Maps Platform usage.

## Current behavior

Guests can enter all eight core inputs and choose any of the five starting states. Date defaults to the browser's local date. Today’s start cannot fall before the current time. For a selected Google location, its supplied UTC offset checks the current local time there. Future outing times are local clock times at the origin; we do not invent future timezone offsets. Budget is per person: five people at $40 preserves 4000 cents each.

Type hours and minutes in 12-hour form, with an AM/PM dropdown. A finish clock earlier than the start means the next day: 8 PM → midnight, 3 AM or 8 AM are valid. Structured requests and itinerary stops retain day offsets, including fixed stops after midnight. Opening hours are checked across both dates. A single outing can continue through the following morning; multi-day trips are outside this prototype.

Select a Google result for the origin and every venue. Unselected text is not verified geography. An activity without a venue asks for a geographic clarification before travel planning. There is no default 7 PM reservation; it remains only when the user enters it. Existing fixed and flexible place identities remain mandatory. The planner changes flexible timing to connect those places.

The planner uses a bounded candidate shortlist, real Google opening hours when provided, and directional Routes API driving durations without live traffic. A 27-second response deadline protects against slow services. Costs and durations are explicitly category estimates. Missing details stay unknown; no fake place or estimated straight-line travel fallback is used. Transit scheduling is deferred.

Stop count responds to available time: roughly 2 for 2–3 hours, 3 for 4 hours, 4 for 6 hours, 5 for 8 hours and 6 for 10+ hours, when feasible. Longer outings discover additional cafés, dessert, walking and browsing stops. Budget, actual routes, opening hours and fixed commitments still determine what fits; the planner does not repeat meals or activities merely to fill a quota. All existing user places stay mandatory even when they exceed the suggested count. The route shortlist stays bounded and scheduling uses the existing 64-state beam.

Google identity/address/hours stay in active memory. Durable browser drafts and SQLite runs retain provider IDs and user decisions, not a permanent copy of Google content. Refresh restores the form and fetches those IDs again; Build refreshes the itinerary and routes. Old OSM selections require explicit Google reselection, preserving existing times, notes and fixed status.

`/founder` is a separate candidate-search surface. `/founder/runs` inspects active run diagnostics; after a restart, its durable record contains IDs and product metrics. Google place data appears on a Google map with attribution. The old OSM and synthetic catalog adapters remain isolated in engineering tests.

See [BATCH3_HANDOFF.md](BATCH3_HANDOFF.md) for architecture, benchmark evidence, screenshots, limitations and the founder checklist. Older handoffs describe historical batches. Accounts, social features, payments, weather, chatbot, swaps and autonomous repair are not part of this batch. The cloud build reuses the local planning API and engine, uses a D1 database for durable IDs/intent, and excludes founder routes. Public Terms/Privacy pages explain the prototype and its data use. Google browser-key website restrictions must include the published domain.

## Cloud hosting

`.openai/hosting.json` identifies the permanent Sites project. `server/api.ts` is the shared Node/cloud API; `server/cloudWorker.ts` is its cloud entry point. `server/cloudStore.ts` adapts the existing run store to D1, with prepared statements. `db/schema.ts` and generated `drizzle/` migrations define the database. `pnpm build` emits the frontend and bundled Worker into `dist`; publishing uses the Sites workflow and preserves the same URL. Local edits become public after a new version is published. Secrets live in the hosting runtime, never in the source or bundle.

The public prototype allows 6 plan builds per visitor per 5 minutes, 120 API requests per visitor per 5 minutes, and 150 builds across the site per day to limit unintended Maps usage. These are server-enforced prototype limits, not a paid product tier. The local development server retains its separate founder surfaces.

## Verified catalog import

`pnpm catalog:import /absolute/path/catalog.json` validates a catalog and creates `src/data/importedCatalog.ts`. Review it and update `src/data/index.ts` to activate the imported records. Real records require source/reference, verified-at date and estimated-field metadata. Keep stable IDs. The synthetic source shows the full schema; never convert a TEST fixture into an invented business.

These older controlled catalog tools do not populate or replace the live provider. [TECHNICAL_HANDOFF.md](TECHNICAL_HANDOFF.md) describes the historical engineering baseline.
