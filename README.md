# Outing planner — V0.1 / Batches 1–2

Clean-slate guest planning foundation. A user enters the pieces they already know and reaches an honest results shell with the structured request intact. This project is independent of any earlier prototype.

**Status: Batch 2 controlled place data implemented at user direction; founder graduation pending. Do not begin Batch 3 until Josh + Abhinav pass the benchmark or Build Lab explicitly defers an item.**

The guest flow and its saved request format are unchanged. Batch 2 adds a separate catalog of 24 explicitly synthetic test places, a query service and a catalog-only ID validation contract. No planning engine has been built. See [the data guide](src/data/README.md) and [Batch 2 checklist](BATCH_2_CHECKLIST.md).

## Stack

React + TypeScript + Vite. Two runtime dependencies (`react`, `react-dom`); TypeScript, Vite and React type definitions for development. Native accessible form controls and plain CSS. No component framework, router, state library, server, database, external API, API key or hosted-service dependency.

The app runs entirely in the browser. React state is the active source of truth. Versioned sessionStorage is a best-effort copy for refresh recovery in the same tab. No input leaves the browser. A new independent tab starts a new session; duplicating/restoring a tab may preserve it according to browser behavior. This is not durable or cross-device storage. If storage is unavailable, the app keeps working in memory and explains that refresh will clear input.

## Setup

Install Node.js 22.13+ (Node 24 LTS also works) and pnpm 11.25.0. If pnpm is missing, use `npm install --global pnpm@11.25.0`.

```sh
cd /Users/abhinavkolasani/outing-planner-v01
pnpm install --frozen-lockfile
pnpm dev
```

Open the exact local URL printed by Vite. The handoff preview uses port 5174; restart it with:

```sh
pnpm dev --port 5174 --strictPort
```

Run checks and optionally serve the production build:

```sh
pnpm test
pnpm build
pnpm preview
```

No `.env` setup and no API key are required. `.env` files are ignored by Git in case a later batch introduces secrets.

## Structure

- `src/App.tsx`: app state, form/results switching, refresh restoration and session-storage fallback.
- `src/components/PlanningForm.tsx`: complete guest input form and validation display.
- `src/components/ExistingStopEditor.tsx`: repeatable fixed/flexible existing stop entry.
- `src/components/RequestSummary.tsx`: human-readable results shell and collapsed founder JSON view.
- `src/components/Field.tsx`: shared accessible label, hint and error wrapper.
- `src/planning/types.ts`: draft, validated request, existing-stop and starting-state types.
- `src/planning/draft.ts`: initial values, stop creation/removal and preservation during mode changes.
- `src/planning/validate.ts`: pure input validation and conversion to a structured request.
- `src/planning/state.ts`: session shape, safe restoration and separate submitted snapshot.
- `src/planning/engine.ts`: explicit placeholder that returns `not-generated`; no planning algorithm.
- `src/itinerary/types.ts`: truthful result contract with `primaryItinerary: null`.
- `src/data/index.ts`: single public PlaceService entry point; active lists, exact-ID lookup and basic filters.
- `src/data/types.ts`: place schema and service/query types.
- `src/data/syntheticCatalog.ts`: 24 synthetic fixtures (22 active, 2 inactive).
- `src/data/localPlaceService.ts` and `validateCatalog.ts`: internal adapter and runtime data checks.
- `src/itinerary/catalogContract.ts`: validates future planner-selected references without generating a plan.
- `src/data/README.md`: full schema guide, provenance, query examples and inspection instructions.
- `scripts/inspect-catalog.ts`: founder inspection through the same service.
- `src/founder/metadata.ts`: schema/prototype/batch version, submission ID/time, planner status.
- `src/styles.css`: mobile-first layout and accessible form/results styles.
- `tests/planning.test.ts`: original guest-flow regression checks, unchanged.
- `tests/catalog.test.ts`: catalog, queries and selection-contract checks.
- `BATCH_2_CHECKLIST.md`: current founder acceptance checklist and failure-report template.
- `BATCH_1_CHECKLIST.md`: founder acceptance checklist and follow-up failure template.

## Structured request

The eight core values are individually accessible: starting location, date, available start time, required end time, budget per person, group size, transportation, vibe/interests. Budget is stored as `{ amountCents, currency: 'USD' }`; group size is a number. Empty numeric inputs remain empty in draft state and do not become zero accidentally.

Exactly five starting states are represented by a TypeScript union and a single shared choice list:

| UI label | Stored value |
| --- | --- |
| Nothing planned | `nothing-planned` |
| Anchor | `anchor` |
| Reservation / fixed stop | `reservation` |
| Partial plan | `partial-plan` |
| Almost-complete plan | `almost-complete` |

Existing stops are an ordered array. Each stop has a stable ID, name, fixed boolean, optional start/end time, optional duration and note. Unknown submitted timing is `null`. Users choose an end time OR duration, or leave both unknown. Optional draft timing is retained if the user switches the timing selector back before submission; only the selected timing representation is submitted.

Every fixed stop has explicit `constraints` flags for preserving its place and any known start/end/duration. An anchor automatically fixes the first place, without requiring a time. A reservation fixes the first place and requires its start time. Partial/almost-complete plans support repeatable entries with user-controlled fixed/flexible status. Existing entries and fixed flags survive mode changes. Nothing planned cannot be chosen until the user explicitly removes existing entries. Removing the first anchor/reservation makes the next remaining stop its fixed first piece; removing all stops allows Nothing planned.

Example of the required dinner case in submitted state:

```json
{
  "name": "Fixed dinner",
  "fixed": true,
  "startTime": "19:00",
  "endTime": null,
  "durationMinutes": null,
  "constraints": {
    "preservePlace": true,
    "preserveStartTime": true,
    "preserveEndTime": false,
    "preserveDuration": false
  }
}
```

## Data flow

Typing updates a structured draft. Build My Plan validates that draft. Invalid input stays on the form with field errors and a focused error summary. Valid input becomes a new submitted snapshot, with normalized money/numbers and explicit fixed constraints. The app reveals RequestSummary using that snapshot, plus a `not-generated` result and separate founder metadata. Edit request returns to the draft. Editing a draft does not mutate the previous submission; submitting again replaces it. No page routing library is needed.

## Intentionally absent

No place suggestions, itinerary generation, travel routing, maps, reservations/booking integration, AI integration, external services, account/login/profile/onboarding, Explore, creators, feeds, social/group chat, calendar, notifications, payments, monetization or native app. No final branding or animation. This batch is a complete input-to-summary flow, not an operational outing planner.

## Verification

Batch 2: all 23 automated checks (12 catalog checks and the original 11 guest-flow checks) and production build passed. Founder acceptance is pending. Run `pnpm catalog:inspect` to inspect the candidate universe; see `BATCH_2_CHECKLIST.md` before Batch 3.

### Original Batch 1 handoff checks

- TypeScript check and production build passed.
- 11 automated tests passed.
- Browser checks covered all five starting-state submissions, required-field errors, zero group size, negative budget, fixed 7 PM dinner, mixed fixed/flexible entries, optional duration, structured JSON, refresh and return-to-edit.
- Mobile form and results checked at 390 × 844; no horizontal overflow.
- Unknown duration remained `null`; no invented stop was generated.
- These original checks document the input-flow handoff; they are not a record of founder graduation.

## GitHub baseline

This folder is an independent local Git repository. No GitHub repository has been created and nothing has been pushed externally. The lockfile, source, tests and acceptance checklist are ready for your first baseline.

```sh
git add .
git commit -m "feat: establish v0.1 guest planning flow and structured request shell"
```

Create/select your intended GitHub repository, add its exact remote URL, and push `main`. Do not commit an API key. The production `dist/` output and installed dependencies are intentionally ignored; regenerate with the commands above.

Suggested Batch 2 commit: `feat: add synthetic place catalog and catalog-only selection contract`. No GitHub push is performed by this batch.
