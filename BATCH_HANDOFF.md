# Stage A result and Stage B configuration handoff

October 2, 2026. Existing React/TypeScript/Vite frontend and Node/SQLite backend retained. Stage A code commit: `8a5b346`. Independent Stage A verification passed. Stage B is not implemented: the user explicitly required a stop for manual Google Cloud setup, and no key is configured.

1. **Stage A fixes:** “Where are you?” label, local-today date, explicit hour/minute/AM-PM controls, 12-hour summaries, prominent entered budget, cleaner mobile fields/cards and consumer request summary. Nothing planned remains the fresh default; all five states remain available.
2. **Budget root cause:** No group-size division was found or reproduced in this checkout. Validation already preserved $40 as 4000 cents. The old results omitted the entered ceiling while showing individual stop costs such as $8, making the meaning unclear. This is an observed presentation ambiguity, not a proven historical arithmetic fault.
3. **Budget storage:** `request.budgetPerPerson = { amountCents: 4000, currency: "USD" }`. `groupSize: 5` is independent. The consumer says “About $40 per person.”
4. **Date default:** `emptyDraft()` uses browser-local year/month/day, not the UTC date. Saved drafts and edited dates remain intact.
5. **Time storage/display:** Normalized `HH:mm` internally; `displayTime()` produces 12-hour text. `TimeInput` has separate hour, minute and AM/PM selectors. Dinner 7 PM is stored as `19:00`.
6. **Consumer language:** Founder metadata, synthetic recommendation details, raw JSON and engineering assumptions are absent from the normal guest flow. Existing internal diagnostics remain at `/founder` without a guest-facing link.
7. **Stage A retests:** A1–A6 passed in browser, 43 automated tests passed, production build passed. Changed-date and fixed-stop refresh checks passed. 390-pixel mobile form/results had no horizontal overflow. See `STAGE_A_HANDOFF.md` for exact evidence.
8. **Google APIs/libraries:** None integrated yet. The chosen next approach is server-side REST Places API (New): Autocomplete, Details, Text Search and Nearby Search. Native Node `fetch` avoids a new library dependency. Routes is later work.
9. **Manual Cloud setup:** Required now. Follow `GOOGLE_SETUP.md`: select project, link billing, enable Places API (New), create/restrict a dedicated server key, save it in ignored `.env.local`, then resume.
10. **Credentials/security:** No secrets were read, printed, invented or committed. `.env.example` has an empty server-only `GOOGLE_PLACES_API_KEY`. There is no browser credential. Server IP and API restrictions are documented. The environment loader is not implemented yet.
11. **Location autocomplete:** Not implemented. Current location is user-entered text and is not presented as Google-verified geography. Next stage will resolve a chosen suggestion through the provider boundary; edited/unselected text must clear verification.
12. **Real-place picker:** Not implemented. Existing names/times/fixed flags/notes remain structured. Next stage will add independently selected references while keeping identity separate from human intent.
13. **Normalized PlaceReference:** Not implemented. Requested fields remain the next-stage contract: provider, provider_place_id, display_name, formatted_address, latitude, longitude, primary_type, additional_types, provider_metadata and fetched_at.
14. **Fields requested:** None; no Google calls made. Next implementation must choose explicit masks for identity/address/coordinates/types, and request business status/hours/price only when the surface needs them. No wildcard, photos or reviews by default.
15. **Place IDs:** No Google IDs stored yet. Existing synthetic internal catalog IDs remain internal test fixtures. They are not Google identities.
16. **Persistence/refresh:** No Google content is persisted. Existing user requests and internal runs remain in local SQLite; guest session state preserves form/result navigation. Next stage must keep durable provider IDs and user constraints separate from refreshable Google content, rather than saving a permanent raw Google dump.
17. **Founder real-place search:** Not implemented. Existing `/founder` diagnostics are preserved; they do not claim real search results. The requested Google candidate inspection and scenario-selection surface is pending configuration.
18. **Future provider interface:** Not implemented for Google. Existing controlled catalog interface remains separate. Pending interface operations are autocompleteLocation, autocompletePlace, searchPlaces, getPlaceDetails and a future route estimate contract.
19. **Routes status:** No Routes API integration, route requests or new live travel estimates. Existing fictional engineering travel fixtures remain internal. Enable Routes only when required by later implementation.
20. **Attribution/policy:** No Google content is currently displayed. Setup guide links current official policy/security/billing documentation. Google Maps attribution, returned third-party attribution, session handling, refresh rules and public Terms/Privacy pages must be implemented with Stage B.
21. **Requested manual tests:** See the table below. Live Google tests are blocked, not passed. Budget/time/guest regressions pass.
22. **Blocker:** No Google credential configured and Cloud billing/API enablement cannot be verified. Explicit B3 stop applies. Stage B cannot graduate.
23. **Non-blocking limitations:** Consumer output is an honest request summary, not a generated itinerary. The date picker uses the browser's native calendar. Drafts are tab-scoped; the URL is a local development address, not a public deployment. `/founder` is local development infrastructure, not protected for public hosting.
24. **Suggested commit:** `Fix guest budget and date-time UX; document Google setup gate`.

## All requested manual tests

| Test | Result |
| --- | --- |
| 1 Cypress real location | Blocked — no live provider configured |
| 2 Real street address | Blocked — no live provider configured |
| 3 Real Orange County anchor | Blocked — no live provider configured |
| 4 Real restaurant + fixed 7 PM | Google selection blocked; Stage A text-based Dinner 7 PM/fixed passed |
| 5 Three real independent places | Google selection blocked; repeatable fixed/flexible structured pieces passed |
| 6 Founder bowling search | Blocked — no live provider configured |
| 7 Geographic search context | Blocked — no live provider configured |
| 8 Unresolved Google text | Google picker unavailable; current text makes no verification claim |
| 9 Google API failure | Blocked — no live provider to exercise |
| 10 Five people, $40/person | Pass — 4000 cents/person and clear $40 display |
| 11 4 PM–11 PM | Pass — explicit PM, 12-hour result, internal 16:00/23:00 |
| 12 Complete guest flow | Pass — all fields, five states, independent pieces, result and refresh |

No autonomous planning, chatbot, weather, social, account, booking or payment work was added. Stage B and its graduation remain pending; do not begin later planning work.
