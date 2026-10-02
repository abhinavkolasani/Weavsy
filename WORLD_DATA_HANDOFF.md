# Live place foundation handoff

October 2, 2026. The existing project was continued, not rewritten. Stage A passed before live integration. The user subsequently approved replacing the Google requirement with a Google-free OpenStreetMap approach. This is a real-data foundation, not an AI-created database of businesses. Google-specific benchmarks are evaluated against the approved OSM provider contract; Google Place IDs are not claimed.

## Requested report

1. **Stage A fixes retained:** clear per-person budget, “Where are you?”, browser-local today, explicit AM/PM, readable 12-hour summaries, five starting states, guest-first entry and no consumer diagnostics. Live selection adds structured geography without changing those rules.
2. **Budget root cause:** no divide-by-group-size bug was found in this checkout. The earlier result view omitted the entered ceiling and showed individual stop costs, creating ambiguity. The consumer now prominently shows the entered per-person budget. This is a verified presentation fix, not a claim to have reproduced historical arithmetic code.
3. **Budget storage:** `budgetPerPerson: { amountCents: 4000, currency: 'USD' }`, independently from `groupSize: 5`. No conversion into group total.
4. **Date:** `src/planning/draft.ts` uses the browser's local year/month/day for a fresh draft. Saved and edited dates remain intact. October 2 default and an October 3 edit were checked.
5. **Time:** `HH:mm` internally, explicit hour/minute/AM-PM input, and 12-hour consumer output. **7 PM is only a test input.** New stops have no time. A restaurant entered at 7 PM was later changed to 8 PM and remained fixed at `20:00` through submission and mode changes.
6. **Consumer language:** normal form/results have no founder/debug/test labels, raw JSON, synthetic recommendations or implementation explanations. `/founder/places` is deliberately separate; it is not an Explore feature or a normal navigation item.
7. **Stage A regression result:** all eight inputs, all five states, fixed/flexible pieces, result navigation and refresh passed again. $40/5 remained 4000 cents per person; 4 PM–11 PM remained `16:00`/`23:00`. Mobile form/results and map had 390 px document width at a 390 px viewport. The automated suite has 57 passing tests; the production build passed.
8. **APIs/libraries used:** Photon forward autocomplete and filtered reverse search; Overpass exact selected-record detail lookup; MapLibre GL JS 6.11.2; OpenFreeMap Positron vector style. Built-in Node fetch performs source calls. No Google or OpenAI calls are made.
9. **Manual Cloud setup:** none for the local prototype. No Google project, billing change, API enablement or key is required. `GOOGLE_SETUP.md` is archived as an alternative only.
10. **Credentials/configuration:** no credentials added or exposed. Optional server environment variables are `PHOTON_URL`, `OVERPASS_URL` and `MAP_STYLE_URL`; defaults are in `.env.example`. `.env.local` is ignored and loaded by Node on startup. Browser search calls only this app's API; the map browser fetches public tiles/fonts/styles. The server binds to `127.0.0.1`.
11. **Location autocomplete:** `PlacePicker` debounces text, receives up to five normalized suggestions and requires selecting one. Selected location includes source ID, display name, nullable address, latitude and longitude. Edited text immediately clears selection. Worldwide origin search has no implicit LA bias or country restriction. Optional explicit bias respects named-place relevance.
12. **Existing-place selection:** each stop has its own picker/reference, separate from its `fixed`, start/end/duration and note fields. Loading details uses the latest change callback so edits made while a lookup is pending survive. Venue-free activities remain explicitly user-provided and have no verified place reference.
13. **Normalized model:** `PlaceReference` includes `provider`, `provider_place_id`, `display_name`, nullable `formatted_address`, coordinates, `primary_type`, `additional_types`, `fetched_at`, `data_status: 'community'` and small source metadata. Raw source responses stay behind the provider. Community map records are not business verification; representative points are labeled.
14. **Requested source fields:** Photon returns name/address, OSM identity, coordinates and primary category. Overpass retrieves tags and point/center for the exact selected ID, then normalizes name, address when supplied, categories, opening-hours expression and safe website URL. It does not request surrounding businesses, relation-member geometry, reviews or photos. Unknown costs and durations are null. Only simple weekly hours are interpreted; complex/holiday/overnight rules retain the source expression with `weekly: null`. No open-at-time claims are made.
15. **IDs:** namespaced stable source IDs such as `node/13201777755`, `way/163328155`, `relation/5586855` avoid node/way/relation collisions. These are OSM IDs, not Google Place IDs or immutable guarantees against later source deletion. Malformed IDs fail with 400; unavailable IDs fail with 404/410 when the source confirms that condition.
16. **Persistence/refresh:** SQLite stores local submitted request snapshots and rebuild links; session storage stores the draft/result and founder scenario references. Selected snapshots include normalized source content with a fetch timestamp, separate from user constraints. No permanent bulk copy or scrape is built. Source responses have a bounded 15-minute in-memory cache; stale references require refresh. After a server restart, saved selections are re-resolved with name/location hints and exact source ID matching, rather than accepting caller-provided facts. Missing refreshed fields may become unknown. User time/fixed/notes do not change.
17. **Founder search:** `/founder/places` (also `/founder`) accepts names, category queries, optional chosen geography and basic category-plus-area syntax such as “bowling near Irvine” or “casual dinner Cypress”. It shows up to eight candidates within a 15 km category-search radius, source IDs, addresses and coordinates. Inspect exposes normalized details; select stores up to ten independent scenario references in the tab. No itinerary is run. This is local development infrastructure and has no public authentication gate.
18. **Provider boundary:** future code uses `WorldProvider` in `src/world/types.ts`: `autocompleteLocation`, `autocompletePlace`, `searchPlaces`, `getPlaceDetails`, and a prepared `getRouteEstimate` signature. The browser implementation is `src/world/client.ts`; the server implementation is `server/worldProvider.ts`. Unsupported price/open-time filters fail explicitly rather than silently inventing precision.
19. **Routes:** interface preparation only. Calls fail clearly as not implemented. No live travel, traffic or route estimates are added; the older synthetic travel matrix remains isolated engineering code.
20. **Attribution/policy:** search, selected results and the founder surface credit OpenStreetMap. Maps display the style's OpenFreeMap/OpenMapTiles/OpenStreetMap attribution. Searches are debounced, server calls spaced, caches bounded and throttling handled. Overpass is used only for selected IDs, with an 80-detail-request daily cap per process and at least three seconds between requests. No public Nominatim autocomplete is used. Public services are suitable for moderate local testing, not a promised production SLA. Choose managed/self-hosted search/details infrastructure before public traffic; restarting a process resets its local daily counter.
21. **Manual tests:** results below record actual browser/API checks, with engineering fixtures used only for deterministic error cases.
22. **Remaining blockers:** no key/setup blocker for this local foundation. Josh + Abhinav still need to run the acceptance checklist; agent verification does not automatically graduate the batch. An exhaustive “every arbitrary input returns a place” guarantee is impossible; unsupported/nonexistent inputs receive an honest no-match state.
23. **Limitations:** community coverage and source availability vary. Details sometimes time out; an already resolved identity can remain selected with unavailable extras clearly labeled. Prices, durations, current business opening and live travel are not established. The map is loaded on demand and has a sizable separate bundle. The URL is local, not public. Autonomous ranking/generation, slang interpretation, chatbot, weather, traffic, accounts, booking, payments and social features were not built. Older synthetic engine tests are retained but that engine is not invoked by the guest Build action.
24. **Suggested commit:** `Add worldwide OpenStreetMap place selection and map foundation`.

## Manual verification

| Test | Result and evidence |
| --- | --- |
| 1 Cypress location | Pass — real selected `relation/6013836`, latitude 33.8248235, longitude -118.0399368; source identity in saved request. |
| 2 Street address | Pass — `1313 South Harbor Boulevard Anaheim` produced real suggestions; Disneyland selected and submitted with `relation/5586855`, address and coordinates. |
| 3 Real anchor | Pass — selected Disneyland, submitted as Anchor, retained as Fixed. |
| 4 Fixed dinner | Pass — real Din Tai Fung Irvine `node/13201777755`, user time 7 PM / `19:00`, fixed true and note. Time and note entered during lookup survived. Later 8 PM / `20:00` also survived. |
| 5 Partial plan | Pass — Din Tai Fung fixed, Disneyland flexible, Veterans Park `way/163328155` flexible; three independent references in request and SQLite. Almost-complete mode retained the same pieces. |
| 6 Founder search | Pass — bowling near Irvine returned Bowlero, Tavern+Bowl, Round1, Forest Lanes, Fountain Bowl and Lucky Strike with source IDs and coordinates. Inspect handled partial detail availability; two scenario selections survived refresh/restart. |
| 7 Geographic context | Pass — selected Cypress in the lab; food search returned eight real nearby records including Kimmie's Coffee Cup, Alberto's and Kura Sushi, with IDs/coordinates. Category/area and explicit-coordinate tests also verify correct geography and radius. |
| 8 Unresolved text | Pass — valid other fields plus typed Tokyo without selection produced “Choose your location from the search results.” Editing clears source selection. |
| 9 API failure | Pass — isolated production preview with unreachable services showed a clean error and empty candidate list, no crash or fake fallback. Real transient detail failure also displayed unknown extras. Deterministic tests cover 429 cooldown, invalid ID, missing ID and inactive record. |
| 10 Budget | Pass — 5 people, $40/person; displayed $40 and stored 4000 cents/person. |
| 11 Time | Pass — explicit PM for 4 PM–11 PM; readable result; normalized 16:00/23:00. No universal dinner time. |
| 12 Guest flow | Pass — eight fields, five states, optional unknown duration, independent pieces, Build summary and refresh. Source-backed Tokyo flow retained edited October 3 date. |
| Worldwide search | Pass — Tokyo `relation/1543125` selected/submitted; London `relation/175342` returned by live API. No country filter. |
| No matches | Pass — nonexistent query returned an explicit no-match message and no invented place. |
| Map | Pass — real map tiles and selected-place markers rendered; source attribution visible; mobile width did not overflow. No routes implied. |

The initial live checks found and fixed excessive LA autocomplete bias, an autocomplete-only parameter sent to reverse search, and AND-versus-OR category filtering. Regression tests cover these mistakes. Tests use clearly labeled synthetic transport fixtures only; they are never served as product search results.

Provider documentation: [Photon API and demo usage](https://github.com/komoot/photon), [category filter semantics](https://github.com/komoot/photon/blob/master/docs/categories.md), [Overpass public-instance guidance](https://wiki.openstreetmap.org/wiki/Overpass_API), [OpenFreeMap setup](https://openfreemap.org/quick_start/), and [OpenStreetMap attribution/license](https://www.openstreetmap.org/copyright).

## Files and setup

The input form is `src/components/PlanningForm.tsx`. Stop editing is `ExistingStopEditor.tsx`; shared search is `PlacePicker.tsx`; the result is `RequestSummary.tsx`. Request/state types and validation remain under `src/planning/`. Normalized world types, reference validation, hours handling and browser client are under `src/world/`. Source access lives in `server/worldProvider.ts`, behind endpoints in `server/start.mjs`. Map rendering is `PlaceMap.tsx` plus lazy worker setup in `src/world/mapSetup.ts`. Founder search is `src/founder/PlaceLab.tsx`. Tests are in `tests/world.test.ts` alongside the prior regression suite.

From the project directory with Node 24 and pnpm:

```sh
pnpm install
pnpm dev
```

Open http://127.0.0.1:5174/. Keep the server running. For built mode, run `pnpm build` then `pnpm start`. Optional `.env.local` overrides require a restart; no key is required. No Google Cloud manual step applies to this chosen implementation.

## Founder acceptance checklist

- Fresh tab: today selected, Nothing planned checked, all inputs available without an account.
- Cypress and a public street address: choose actual suggestions; inspect source IDs/coordinates via a saved run or the lab.
- Enter five people at $40 each and 4 PM–11 PM; confirm summary and structured values.
- Try every starting state; add three real places with one fixed and two flexible. Unknown durations should stay optional.
- Set a dinner to your own time, including a time other than 7 PM. Change budget, vibe and starting state; confirm fixed identity/time/note remain.
- Edit location/place text without selecting it; Build must reject unresolved venue text. A venue-free activity must stay clearly user-provided.
- Refresh both input and result; selected date, separate references and constraints should survive.
- Founder search: bowling near Irvine, casual dinner Cypress, and a selected search area. Inspect and select multiple candidates; verify source IDs and honest unknown fields.
- Try nonsense input and an unavailable source; expect a clear error/no-match state with no fabricated fallback.
- Check a phone-width screen and open the map. Confirm attribution and readable controls.
- If any required item fails, remain in this batch, record exact observed/expected behavior, make the smallest general correction and retest. Do not start autonomous planning or the next batch until founders accept or explicitly defer the item.
