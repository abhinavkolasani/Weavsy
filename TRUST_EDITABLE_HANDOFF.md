# Real-world trust + editable planner handoff

Continues the existing React/TypeScript/Vite app, Node preview, Google provider, and Sites Worker/D1 deployment. No application rewrite or new paid service was introduced.

Public app: https://outing-planner-v01.abhinavkolasani.chatgpt.site

## IMPLEMENTED

### Provider audit, fields, and costs

The consumer API explicitly uses Google Places API (New) for autocomplete, details, nearby search, and text search. Google Maps JavaScript with Advanced Markers renders the map. Google Routes provides directional road/footpath matrices and route polylines. Driving uses **TRAFFIC_UNAWARE**; traffic and transit schedules are not connected. OSM/Photon/Overpass/OSRM and the synthetic catalog remain isolated legacy/test adapters, never a consumer fallback.

Identity mask: `id`, `displayName`, `formattedAddress`, `location`, `primaryType`, `primaryTypeDisplayName`, `types`, `businessStatus`, `addressComponents`, `googleMapsUri`, `attributions`, `utcOffsetMinutes`.

Planning adds `regularOpeningHours`, `currentOpeningHours`, `priceLevel`, and `priceRange`. No wildcard, reviews, photos, ratings, or Atmosphere fields are requested. Browser selection with an autocomplete session token uses the narrower identity mask; the planner refreshes planning fields separately. Provider responses are normalized into `PlaceReference` and `PlaceDetails`.

Google's [field-tier table](https://developers.google.com/maps/documentation/places/web-service/data-fields) places hours and price signals in Enterprise and primary-type display names in Pro. Hours were already requested at Enterprise, so adding price signals does not raise the highest tier of those planning calls. It can still cost money: search/detail/route/map requests remain billable according to the configured Google account. Actual Cloud-console enabled-service lists, billing totals, and quotas were not independently inspected; successful live requests verify runtime access. Existing ignored local credentials and hosted secrets were reused.

### Qualification, filtering, and reality

`src/planner/qualification.ts` records provider type, normalized category, experience role, and high/medium/low **type qualification confidence** before ranking. Explicit non-leisure commitments can remain pickups/appointments without being presented as leisure recommendations. Automatic candidates reject non-consumer entities, generic map points, insufficient identity, incompatible categories, and closed businesses. Specific museum/bowling/cinema searches cannot substitute another main-activity category. No founder bug location is hard-coded.

Nearby Search uses `includedPrimaryTypes`; Text Search uses `includedType` and `strictTypeFiltering: true`, with pure service-area businesses excluded. See Google's [Nearby Search](https://developers.google.com/maps/documentation/places/web-service/nearby-search) and [Text Search](https://developers.google.com/maps/documentation/places/web-service/text-search) contracts.

Hours are structured weekly and, when available, by date. Scheduling checks the full visit, including overnight visits, rather than only arrival. Known closed/status-unavailable venues cannot be automatically selected. Results distinguish OPEN_CONFIRMED, CLOSED_CONFIRMED, HOURS_UNKNOWN, and HOURS_PARTIAL internally. Missing hours never become invented hours: the consumer sees “Hours weren’t available here — worth checking before you go.” A protected closed venue produces a conflict, rather than a silent replacement.

### Commitment semantics and current state

- **Experience anchor:** an independently structured activity (for example beach or museum) must remain represented, while its implementation venue and inferred timing may change.
- **Place anchor / USER_PLACE:** its exact Google Place ID remains included. Timing stays flexible unless explicitly made exact.
- **Fixed commitment / USER_FIXED:** only explicit times, end, duration and place are protected. After-midnight offsets remain explicit.
- **USER_KEPT:** Keep this protects a generated venue's Place ID. Its inferred arrival and duration are not promoted to exact commitments.
- **PLANNER_FLEXIBLE:** generated decisions may change where needed. Removing an anchor never silently fixes the next stop's time.

`CurrentPlan` contains a stable plan ID, revision, current run ID, structured request/result, edit history and rejected-place IDs. Generate → keep/change → adjust → edit details updates the same active plan. No account is needed. On incompatible hard constraints the last valid plan remains visible; the attempted edit has separate run evidence. There is no silent removal or unlocking of a protected place. Flexible timing is tried first, followed by a clear conflict and an explicit choice to allow more time, change the constraint, or release/change a place.

### Composition, interests and budget

Roles separate meals, activities, coffee, dessert, drinks, walks, beach/scenic time, browsing and extras from provider categories. Bounded sequence scoring considers available time, desired roles, anchors, visit durations, geography, cost, waiting, and breathing room. Unrequested repetition in the refreshment/outdoor families is rejected; explicitly requested crawls may repeat. Dinner-first is an explicit sequence adjustment. It does not impose a universal itinerary template or fill long outings with repeated meals.

The five consumer situations are Nothing yet, One thing I want included, Something booked / fixed, A few pieces, and Mostly planned. Contextual interest chips are suggestions, never automatically selected; two people do not imply a date. “Anything else?” is optional. A small deterministic language boundary recognizes common casual interests and the documented adjustments; unknown experience anchors receive a clarification instead of fabricated understanding.

Budget stays **per person** in integer USD cents, irrespective of group size. Normal numbers are soft targets. Explicit “Do not go over $40” or the firm-cap control is a cap applied to estimates; a text cap is separately structured from the soft target. Results show both estimated per-person/group spend and the per-person/group target or cap.

Cost states distinguish KNOWN_COST, PROVIDER_PRICE_SIGNAL, ESTIMATED_COST, SHARED_COST, and UNKNOWN_COST. This build does **not** obtain verified ticket/menu totals. Google price signals guide estimates when available. Beach/park admission is unknown, with a labeled $5 planning reserve (not an invented entry fee); parking/passes remain separate and unknown. No universal $0 beach/park claim. Actual costs may exceed estimates, including a numeric cap, so that limitation is visible. Visit durations remain product assumptions unless supplied by the user.

### Editing, map and loading

Change this replaces one flexible stop with a suitable new stop of the same role. All unrelated IDs remain retained, with affected times, travel and totals recalculated. If no usable replacement fits, the old current plan stays intact. Keep this / Kept · release provide explicit protection/release.

Adjust this plan supports Dinner first, Different dessert, Less driving, More active, Make it cheaper, Stay out later, Finish earlier, Keep the beach, and explicit finish/home-by times. “Keep the beach” keeps the venue; explicitly “Keep the beach experience” protects the experience and permits a venue change. Edit details first attempts to retain current decisions, then recomposes only unprotected pieces if necessary.

Location copy is “Where are you starting from?” with the requested meeting/departure helper. Empty panels close on blur; suggestions only appear when useful; selected addresses remain in the input with compact confirmation and provider attribution. Generic “place” labels were removed, and AM/PM arrow padding increased.

Plan map is open by default after generation, with origin, ordered stop markers, and Google route polylines. Loading names the three planning steps without promising a wait time. Debugging stays on separate local founder pages.

### Validation and structured evidence

Final checks use EXPERIENCE_SUPPLY, EXPERIENCE_COMPOSITION, INTENT_FIDELITY and REAL_WORLD_ACCURACY. Earlier failures also retain their relevant lens; failed edits never replace the valid current plan.

SQLite locally and D1 on the public site retain run/parent IDs, user intent, anchor/fixed/kept state, candidate/selected IDs, confidence, rejection codes, product scores, timing, derived totals, assumptions, quality-lens outcomes, edit requests, revisions/history, and validation/error evidence. Signals distinguish shown, selected, kept, changed, rejected, restored and adjusted; candidate records represent considered places. Fresh local diagnostics keep more detail in a bounded memory window. Durable records avoid archiving Google names, addresses, raw hours and raw price signals; Google IDs and human/product decisions are retained and provider content is refreshed. This follows the existing [Places content/attribution policy](https://developers.google.com/maps/documentation/places/web-service/policies), rather than creating a permanent scraped catalog.

## VERIFIED

- `pnpm test`: **120 passed, 0 failed**; includes deterministic TEST fixtures for unsuitable places, category fidelity, known closure, incomplete hours, explicit caps/home deadlines, legal kept-time movement, conflict preservation, same-role replacement, coffee crawls and edit API/state/evidence.
- `pnpm build`: TypeScript, production frontend and Worker bundling passed.
- Real Google founder scenarios A–L below all ran successfully on the final implementation. G has two checks. Evidence: `artifacts/trust-editable/founder-live-results.json`, with actual run IDs, plan/revision IDs, selected Place IDs and measured elapsed time.
- Live duration/overnight checks passed: 3-hour outing 2 stops, 4-hour 3, 6-hour 4, 8-hour 5; midnight finish accepted; an explicitly fixed 12:30 AM dinner remained next-day and exact. A's three requested roles fit as 3 stops in its 3-hour outing. Evidence: `artifacts/overnight/live-pacing-results.json`.
- Browser: fresh local date/current start; manual date entry; empty location blur; real Cypress selection; venue-free beach; three real stops; per-person/group totals; default map and order markers; Dinner first; kept beach; dessert-only replacement; Edit details retains inputs; impossible firm finish leaves current plan and beach intact; 390 px mobile layout has no horizontal overflow; no founder/test/debug terminology in the consumer flow.

| Scenario | Actually exercised | Result |
| --- | --- | --- |
| A | Cypress, tomorrow 5–8 PM, 2 people, $40/person, dinner/beach/walk/ice cream, venue-free beach anchor | PASS — three real roles, one outdoor family |
| B | Selected Huntington City Beach Google venue | PASS — exact Place ID retained |
| C | Real dinner at 7 PM fixed | PASS — venue and exact arrival retained |
| D | Dinner, chill, dessert | PASS — no dessert/café duplication |
| E | Dinner in central Los Angeles | PASS — only qualified consumer destinations |
| F | Live restaurant whose listed hours exclude 2 AM, with fixed 2 AM visit | PASS — rejected with a conflict |
| G | Dinner first; Keep beach; Different dessert | PASS — same plan ID, revision increments, only dessert changes |
| H | Nothing planned, minimal “do something tonight” interest text within the explicit requested date/window | PASS — one outing, no venue/chips required |
| I | Mostly planned: fixed dinner, dessert, back at origin by 10:30 PM | PASS — real return route included; deadline met |
| J | Explicit $40/person cap | PASS — applied to estimates without division by group size |
| K | Live venue with unknown/partial hours | PASS — visible uncertainty; no fabricated hours |
| L | Kept beach versus new impossible firm finish | PASS — conflict; old plan/kept venue preserved |

Measured final founder API requests took about 0.24–0.77 seconds locally. This is evidence for those runs, not a reliability promise for all Google/network conditions.

## UNRESOLVED

No failing A–L scenario or reproducible blocker remains in the checks above. This is a founder prototype handoff, **not automatic founder graduation**. Josh + Abhinav should retest in the published app and report exact observed failures; resolve those before expanding scope.

## UNTESTED / UNCERTAIN

- Provider coverage, type accuracy, special-event access, omitted status/hours, and future operational changes are not independently verified ground truth. Unknown values stay uncertain.
- Actual prices, parking/admission charges, capacity, reservations, cinema showtimes, and astronomical sunset times are not integrated. A Sunset interest means scenic intent, not a confirmed sunset calculation.
- Driving estimates exclude live traffic; transit scheduling remains deferred. Google outages, billing changes and quota exhaustion can prevent a plan. Failure states are tested deterministically, not by disabling production credentials.
- Language support is bounded; arbitrary slang/conversation and every combination of simultaneous edits have not been verified. Unsupported adjustments give a clear message. This is not a GPT chatbot.
- The bounded shortlist/64-state beam seeks a good feasible plan, not a proof of global optimality. Detailed pacing/composition taste should be evaluated by founders.
- Current plan state is for the active editing experience. Refresh restores the form and refreshes IDs; it does not retrieve a saved account itinerary or kept decisions from long-term memory.
- Live retests focused on Southern California and driving. All-US completeness, international support, multi-day trips and exhaustive future daylight-saving cases are not claimed.
- Existing large legacy MapLibre lazy chunks produce a non-blocking build-size warning. The consumer Google map works; no dependency overhaul was done.

## Important files

- `server/googleProvider.ts`: normalized Google supply and field masks.
- `src/planner/qualification.ts`: place/type/role qualification.
- `src/planner/intent.ts`, `estimates.ts`, `schedule.ts`, `server/realPlanner.ts`: intent, costs, bounded sequencing, protected reality checks.
- `src/planning/types.ts`, `validate.ts`, `currentPlan.ts`, `state.ts`: structured intake, commitments, caps/deadlines, current state/edit preparation.
- `server/api.ts`: shared local/cloud plan and edit APIs.
- `server/durableRun.ts`, `store.mjs`, `cloudStore.ts`: bounded fresh diagnostics and durable founder evidence.
- `src/components/PlanningForm.tsx`, `ExistingStopEditor.tsx`, `PlacePicker.tsx`, `ItineraryResults.tsx`, `GooglePlaceMap.tsx`, `src/App.tsx`: consumer flow.
- `tests/trust-editing.test.ts`, `scripts/verify-founder-trust.mjs`: new deterministic and real-world founder checks.

## Founder checklist / setup

Use the public URL for guest tests. For local work, Node 24 and `pnpm dev` in this project run http://127.0.0.1:5174/. Existing `.env.local` is ignored. `pnpm build` builds local/cloud output; `pnpm test` runs deterministic checks. Do not use `pnpm preview` for a backend test. `node --experimental-strip-types scripts/verify-founder-trust.mjs` and `scripts/verify-pacing.mjs` call live Google and incur normal usage.

1. Repeat A–L using actual selected Google venues, including explicit 7 PM and overnight commitments.
2. Keep a place, replace another, and confirm identity/timing/cost/map updates without returning to intake.
3. Tighten a legal deadline and verify inferred times can move; tighten it impossibly and confirm the valid plan remains.
4. Try $40/person with 5 people, soft target and explicit cap, and inspect per-person/group values.
5. Test phone layout, blank/minimal intent, all five starting situations, venue-free experience versus an exact selected venue, and manual AM/PM/date inputs.
6. Inspect the local founder run IDs for qualification, rejections, commitment fidelity, revision linkage, unknown hours/costs and separate signals.

Suggested GitHub commit message: `feat: qualify real places and add protected current-plan editing`

No accounts, Explore/social/creators, voting/chat, booking/payment, multiple origins, midpoint/carpool, weather, GPT interface, learning, or autonomous disruption repair was added. Stop here for founder testing.
