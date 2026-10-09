# Rovelle technical state — October 9, 2026

This is an implementation snapshot, not alpha graduation or founder acceptance. Continue the existing project; do not infer a production release from this report.

**Publication follow-up, October 9:** Abhinav subsequently authorized publishing these changes to the existing public Site. The initial local-only status and rollout instructions below describe the implementation handoff before that authorization. The publication keeps the existing project, URL, Google credentials and audience; paid OpenAI calls remain disabled. Use the returned Sites deployment status as the evidence of successful publication, not this source snapshot. Founder outing acceptance remains outstanding.

## Scope and source verification

- Repository: `/Users/abhinavkolasani/outing-planner-v01`, branch `main`, starting commit `948f530`.
- Existing React 19 / TypeScript / Vite client, Node API with native SQLite locally, Cloudflare Worker / D1 through OpenAI Sites when hosted. No dependencies added and no application rebuild.
- Read the full current **Builder Context v0.7** and **Planner Constitution v0.1**. The latter is versioned in `server/model/plannerConstitution.ts`; the Builder Context is never a runtime prompt.
- Existing Google Places (New), Autocomplete (New), Nearby/Text Search (New), Routes API and Maps JavaScript map remain. The normal app is US-only. No OpenStreetMap fallback was added.
- Existing untracked `artifacts/budget-input/` was preserved. No GitHub push, production publication, key rotation, customer-data deletion or new billing activation occurred.
- Abhinav explicitly requested **paid OpenAI calls remain disabled**. No live OpenAI calls were made.

## Capability status

| Capability | Current implementation and evidence | Status |
| --- | --- | --- |
| Guest intake / five starting states | Existing structured form retained; local-date, current-time, overnight, per-person-budget and fixed/flexible regressions pass. Fresh browser form and manually entered times checked. | Working locally |
| Real-world place supply | Existing Google provider remains the only consumer supply. Cypress autocomplete and one real three-stop outing tested in the browser. | Working locally; broader founder outings still required |
| Precise commitment protection | Place identity, experience role, exact arrival, exact end and explicit duration stay distinct. Keep preserves identity without freezing inferred time. Swap is a change signal, not evidence of dislike. Finished stops cannot be replaced or released. | Covered by controlled regressions |
| Authoritative persistent Plan | Server-stored ID/current revision, hashed access capability, atomic revision check and automatic immutable version snapshots. Client-supplied current-plan objects are no longer the source of truth. | Local SQLite restart and D1-compatible adapter tests pass |
| Saved-plan reopening | Saved URL uses a fragment capability and an `X-Plan-Key` header. Reopening retrieves server state, refreshes Google details/routes and preserves intended times. Live browser Keep + refresh passed. | Working locally; actual hosted phone test awaits release review |
| Runtime Model Gateway | Replaceable interface, compact versioned Constitution/context packet, strict Responses output schema, one bounded call, no automatic retry, token/latency/cost metadata. | Implemented and fixture-tested; live use disabled / not tested |
| Independent model validation | Unknown/duplicate IDs, role mismatch and missing commitments rejected. Exact proposed sequence then passes route, hours, fixed-time, experience, deadline and estimated-cap checks. Unsafe proposal falls back to separately validated rules; diagnostics identify fallback. | Controlled tests pass; no claim of live model quality |
| Experience composition | Existing pacing remains when AI is disabled. An accepted model sequence may use fewer stops, breathing room or intentional repetition rather than maximize density. | Fixture-tested; qualitative founder evaluation pending |
| Persistent editing | Keep/release, one-stop swap and recognized plan adjustments update the same ID with revision protection. Edits during an outing plan only future steps and merge completed/skipped history back intact. | Controlled tests pass |
| Explicit live continuity | Mark completed, skip flexible stop, report flexible venue unavailable, and typed delay. Repair preserves future identities, consumes slack before shifting, protects fixed timing, refreshes routes/hours and records explicit execution separately. Conflicts retain intended times and persist an attention flag. | Controlled tests pass; real execution not claimed |
| Evidence / metrics | Run diagnostics plus authoritative version/event history, shown vs user-kept vs explicit execution, provider-call failures/counts, latency, model tokens/retries/estimated cost. Supplemental run-write failure is exposed as `evidenceSaved:false`; durable Plan/version evidence remains. | Working in tests; production monitoring not claimed |
| Public rollout | Cloud bundle and additive migration prepared. | **Not deployed — explicit founder review required** |
| Broader beta / personalized learning / background repair | Not part of this slice. | Not started |

## Exact files in this slice

**Persistence and API**

- `server/planRepository.ts`: access-token hashing, provider-content-free snapshots and live rehydration. Keeps own reasons, roles, intended timing and user choices; refreshes provider facts and availability warnings.
- `server/store.mjs`: local persistence methods and additive schema initialization, alongside existing run storage.
- `server/cloudStore.ts`: equivalent D1 repository methods and bounded shared reopen limits.
- `server/api.ts`: authoritative create/reopen/edit/live actions, revision conflicts, provider telemetry, request deadline and model integration. No arbitrary client-plan overwrite.
- `server/durableRun.ts`: adds model/provider metrics and explicit execution to durable diagnostic evidence.
- `db/schema.ts`, `drizzle/0001_durable_plans.sql`, `drizzle/meta/0001_snapshot.json`, `drizzle/meta/_journal.json`: additive saved-plan/current-state and version tables. SQL triggers archive each accepted revision atomically.

**Reasoning and planning**

- `server/model/plannerConstitution.ts`: complete Constitution v0.1 with source and version.
- `server/model/gateway.ts`: server-only OpenAI Responses adapter, structured proposal contract, compact packet, refusal/malformed/incomplete handling, default-off activation and metrics.
- `server/model/validateProposal.ts`: independent identity, role and mandatory-stop checks.
- `server/realPlanner.ts`: optional validated model sequence; existing deterministic fallback and final reality checks retained. Candidate identity must match the actual provider ID.
- `src/planner/schedule.ts`: optional exact proposed sequence; hard constraints remain software-owned.
- `src/planner/reasoning.ts`, `src/planner/types.ts`: diagnostic types separated from UI and provider calls.
- `src/planning/currentPlan.ts`: finished-history protections, execution state, precise Keep semantics, swap signal correction and live attention state.
- `src/planning/live.ts`, `server/liveRepair.ts`: structured explicit actions, bounded future-only repair and immutable history merge, including overnight day offsets.
- `src/itinerary/totals.ts`: one shared calculation for live updates and saved-plan reopening; skipped/unavailable history does not reappear in cost, travel or unknown-cost totals.

**Client and setup**

- `src/App.tsx`: saved-link rehydration, ID/revision/capability requests and explicit execution actions.
- `src/components/ItineraryResults.tsx`: save/reopen link, completion/skip/unavailable controls, typed delay and conflict attention. Existing consumer flow retained.
- `src/components/PlacePicker.tsx`: fixes a browser-observed race where moving focus could cancel a clicked selection during details loading; changing the search text still invalidates the old selection.
- `src/components/PolicyPage.tsx`: describes saved links, explicit execution storage and disabled runtime reasoning.
- `.env.example`: documents disabled model configuration without real credentials.

**Evidence and documentation**

- `tests/persistence.test.ts`, `tests/reasoning.test.ts`, `tests/live-repair.test.ts`, `tests/helpers/plannerFixture.ts`: new deterministic trust and failure tests. Fixtures are explicitly synthetic and never consumer fallbacks.
- `tests/cloud.test.ts`: additive migration, cross-adapter version/archive and idempotent migration coverage.
- `tests/trust-editing.test.ts`: updates the existing edit integration test to use its saved-plan capability.
- `artifacts/core-loop/mobile-overview.png`: 390-pixel browser viewport evidence, cropped before the private saved link. No horizontal overflow was observed.
- `ROVELLE_TECHNICAL_STATE.md`: this snapshot and handoff.

## State and data flow

The form still owns individually accessible request fields. Build validates those fields, resolves actual Google identities, builds one itinerary and independently checks it. A successful plan gets one server ID and a random access capability. Only a hash of that capability is stored on the server.

Reopen and edit requests send the ID, capability and expected revision. The server retrieves its own current state. Stale revisions fail rather than overwrite another tab. Each accepted revision automatically archives the prior/current evidence as a new version; records are not deleted. Keep/change/explicit execution stay separate from automatic plan generation.

Google business names, addresses, coordinates, hours, raw price signals and route geometry are not archived in saved snapshots. IDs survive; provider content is fetched again. Own user notes, timing decisions, budgets, durations, roles, product estimates, reasons and explicit execution events survive. A reopened price signal may refresh an estimate; this is not historical proof of spending. Completed planned times and explicit execution records are preserved.

A single swap retains other places. After execution begins, the planner uses the last completed place as the future origin, allocates the remaining estimated budget and restores the original request/origin/budget plus immutable past stops in the accepted result. Fixed/kept/finished constraints remain protected.

## Checks and observed results

Baseline before edits: **120 tests passed**.

Final checks: `pnpm test` — **141 passed, 0 failed**; `pnpm exec tsc --noEmit` — passed; `pnpm build` — client and cloud server built; `git diff --check` — passed. No lint script exists. Existing MapLibre chunk-size warning remains; no dependency or branding overhaul was performed to address it.

Failures found and corrected during implementation: an old edit fixture lacked the new capability; a model fixture omitted US country data; a prompt-isolation assertion incorrectly matched the Constitution's own reference to the Builder Context; day-offset typing and a shadowed validation variable failed typechecking; real browser testing found the place-selection focus race; final review caught skipped stops being included again in reopened estimates. These are fixed in the passing result, not deferred blockers.

Required controlled scenarios covered across the existing and new suites: no anchor, experience-only anchor, place anchor, exact reservation, almost-complete intake, hard cap, unknown cost/hours, closed hours, wrong/duplicate identity, USER_KEPT rejection, surgical swap preserving other IDs, impossible constraints retaining the current plan, SQLite restart/reopen, cross-instance revision conflict, late/skip preserving completed history, future swap after completion, overnight merge, malformed/refused/unavailable model and supplemental audit-write failure. No destructive lock violation was observed in these controlled checks. This is not proof of perfect behavior or founder graduation.

**Real browser smoke (Google calls, AI disabled):** fresh local date October 9; manually selected October 10; 4:00 PM–11:00 PM; five people; $40/person; Cypress origin; nothing planned; dinner/walk/dessert. Returned three actual Google-identified stops. Server run `52074203-e16b-4ab8-a1b9-ce28a88ecc0f`: 718 ms, six Google backend calls, zero failed calls, zero model calls. Keep then refresh retained the chosen place. Mobile viewport 390 × 844: content width and scroll width both 390. This is one controlled smoke, not an outing executed in person or a p95 measurement. Backend counts exclude the browser map load/autocomplete. Google dollar cost is unknown, not zero.

## Run and migration instructions

From the existing project:

```sh
cd /Users/abhinavkolasani/outing-planner-v01
pnpm dev
```

Open `http://127.0.0.1:5174/`. If this Terminal cannot find Node/pnpm, prepend the bundled runtime paths:

```sh
export PATH=/Users/abhinavkolasani/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:/Users/abhinavkolasani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH
pnpm dev
```

Stop with Control-C. Restart after server-side code or environment changes. The dev server does not hot reload backend modules. The local preview run for this implementation is stopped at handoff; the saved database remains.

Local startup idempotently creates the added tables/triggers in `.data/plan-runs.sqlite`; existing run rows are untouched. Local restart and migration reapplication were tested. Keep `.data` and `.env.local` outside Git. No new package install is required if the existing dependencies are present.

Before a hosted release, Abhinav must review the new guest capability access and storage changes, migration and acceptance results, then explicitly authorize release. Preserve the existing Sites project and `DB` binding. Sites' supported publishing workflow applies the pending Drizzle migration before the Worker upload; package the source with `drizzle/` and its metadata, not only the client assets. Do not manually reinitialize or drop the production database. Preserve a backup through the hosting workflow before an approved migration/release. A failed release may already have applied a migration, so inspect its state before any retry.

No hosting API or production database was changed in this session. The existing public URL remains on its previously published version. A localhost saved link is usable on this computer while the server runs; actual phone reopening requires the approved hosted release. Existing historical run logs do not automatically become reopenable plans; newly created plans use the new durable record.

## Runtime model activation remains blocked by the user's choice

Keep `ROVELLE_MODEL_ENABLED=false`. `OPENAI_API_KEY` was absent from the local file at inspection, and no live model test occurred. The gateway works with fixtures even without a key. A future activation requires founder authorization with a spending limit, an account-supported Responses/Structured Outputs model in `ROVELLE_MODEL`, and server-only secret configuration. Do not paste or commit keys and do not use a browser `VITE_` key for OpenAI.

The call has an eight-second network timeout, 2,200 output-token limit and zero automatic retries; the API uses a 27-second provider deadline. Cost metadata is null unless verified input/output rates and token usage are available. These are bounds, not a dollar-budget enforcement system. Do not enable paid calls before agreeing on and implementing the required spending limit.

Structured Outputs and `store:false` follow [the Responses structured-output documentation](https://developers.openai.com/api/docs/guides/structured-outputs). `store:false` is not a promise of zero provider retention. Before live activation, review the applicable provider-content handling and retention terms; fixtures are not Google content used to train or improve a model.

Google ID/content separation and attribution follow [Places policies](https://developers.google.com/maps/documentation/places/web-service/policies). IDs are retained separately; content is refreshed and displayed with Google attribution. Current masks retain the existing identity fields plus regular/current opening hours, price level/range, business status and attributions; no reviews/photos/Atmosphere expansion. No permanent copied place catalog or learning dataset was added.

## Known limits and next action

- Live frontier quality/cost/latency is untested and disabled by explicit request. The usable planner remains the existing deterministic real-data planner.
- Reopening needs current Google details and routing. An outage or unusable identity yields a clean error; the durable record is unchanged. This is not an offline planner. Reopen does not silently reschedule old intended times; fresh availability warnings may require a decision.
- Prices, capacity, tickets, admissions, parking and reservations remain unverified unless explicitly user supplied. A cap is applied to estimates, not guaranteed actual spend. Completed budget allocation is estimated, not a spending ledger.
- Live repair keeps future identities; unavailable optional venues can be skipped and future alternatives requested through Change This. There is no automatic replacement brain, background monitoring, live traffic or transit schedule.
- Existing route matrix/provider candidate bounds remain. Large, multi-day itineraries and multiple disruptions with complex booking obligations need further acceptance work. Current outing windows remain under 24 hours and support crossing midnight.
- Model role labels use the existing role vocabulary; broader role interpretation, slang, arbitrary natural-language adjustments, reusable learned knowledge and personalization were not added.
- Guest links are bearer access: anyone holding one can read/edit its plan. They are not full accounts, revocable sharing permissions or an authorization system approved for outside beta. Never expose the token in production logs or screenshots.
- Plan/current-version/event archives are atomic; supplemental run metrics are a separate write. A metrics failure is exposed as incomplete evidence and does not claim the saved plan failed.
- No weather, chatbot, accounts, social/Explore/feed, payments/booking, native app or broader design system was added. No alpha/beta/version graduation claimed.

**Next priority:** Josh and Abhinav run the acceptance scenarios below. Fix observed trust failures first. After explicit review, publish this slice to the existing URL and test cross-device reopening. Keep paid AI off until a separate spending-limited activation decision; then test one live gateway call and qualitative plan quality before expanding it.

## Founder acceptance — run these eight scenarios

1. Fresh tab: today defaults, no login, all five starting states available. Enter tomorrow, typed 4:00 PM–11:00 PM, five people and $40/person; verify stored budget is 4,000 cents per person.
2. Nothing planned in a real US origin, then experience-only “beach.” Each produces one readable plan; the experience anchor protects the experience rather than arbitrarily freezing its first venue/time.
3. Choose a real place anchor and a real dinner at 7:00 PM fixed. Change budget/finish/other stops; exact dinner identity/time stay unchanged or a clear conflict asks for a decision.
4. Almost-complete plan with three independent places, one fixed and two flexible. Keep one suggested stop, Change another; preserved IDs remain and only affected future timing/travel changes.
5. Hard-cap/short-deadline conflict, plus unknown admission/hours. No fabricated fee or confirmed booking, silent cap overrun or automatic removal of a commitment.
6. Save the complete private link; restart the local server and reopen it. After an approved hosted release, open it on a phone. Same ID, latest revision, per-person budget, notes, fixed and kept status remain.
7. Open the saved link in two tabs. Edit one, then attempt an edit from the stale tab. It must reject the stale revision; refresh restores the latest version.
8. Record the first stop completed, then a delay and skip of a flexible stop. Completed timing/history remain; slack absorbs harmless delay, a threatened fixed time produces a conflict, and a future swap preserves completed history. Repeat across midnight. Confirm the run diagnostics show no live model calls while disabled.

Suggested commit message: `feat: persist protected outing plans and add gated reasoning and live updates`
