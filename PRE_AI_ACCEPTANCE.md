# ROVELLE pre-AI backend acceptance — October 16, 2026

This records the supplied 15-scenario checklist against the existing V0.1 codebase. It is a technical test result, not founder sign-off, an in-person outing, or approval to activate paid AI.

**Result: the tested functionality assertions pass for all 15 scenarios.** Thirteen use live Google Places/Routes through the same API used by the app; two inject controlled failures with synthetic engineering fixtures. Paid AI stays disabled. Real-world data accuracy and outing quality remain separate from functional correctness.

## Failures found and fixed

1. **Missing experiences hidden by a complete result.** Generic “an activity” was not recognized, short windows silently reduced the desired roles to one, and a fallback could label a subset complete even without existing commitments. Generic activity now has a structured role. Explicit requests are distinguished from inferred suggestions; the no-commitment fallback cannot silently omit an explicitly requested role.
2. **Short outings used unnecessarily long category allowances.** A 90-minute walk and dessert could return only a walk. Short windows now use the existing lower category duration estimates. User-entered durations remain user-owned; the planner does not rewrite them.
3. **Study requests became leisure outings.** Study/library requests now query real Google `library` candidates through the existing provider interface. Their role is `study`. Listed hours are checked; access, visitor/student eligibility, special closures, seats and parking are explicitly unverified. A small planning reserve is not presented as an admission price. “Buena Park” in the study request does not create a park visit.
4. **One cap phrase was missed.** “Must not exceed $35” now produces the same structured per-person hard cap as “do not exceed $35.” One shared parser is used by intake, intent, edits and remaining-budget calculations. The $40/five-people regression remains $40 per person.
5. **Reopening dropped useful cautions.** Visit warnings are recomputed consistently on build, reopening and repair. Library access and parking warnings survive reopening. Above-target and cap disclosures survive; if refreshed price signals exceed a cap, reopening exposes a conflict without replacing choices, moving a reservation, or overwriting the stored revision.
6. **Selected pier type coverage.** Google returned a real destination with a `fishing_pier` type. It is recognized as a waterfront walk, with unknown admission/parking and an access caution. Generic street/route identities remain excluded from automatic leisure recommendations; an explicitly selected user destination is treated as the user's commitment.

Test-runner problems were fixed too: the old runner did not send the saved-plan capability, a completed-history assertion compared refreshable Google metadata, and a landmark lookup could choose a street-address suggestion rather than the exact destination. The new runner uses the current API, checks protected decisions separately from refreshed content, and selects exact Google destination identities.

## Scenario record

**F** = Functionality/Trust. **Data** describes actual-world certainty, not whether a mock is predictable. **Q** is a provisional quality assessment; “Needs improvement” keeps the case open for founder judgment and later AI comparison. All Data entries remain Uncertain because live identity/routing is not independent verification of prices, access, opening exceptions or experience quality.

Future Saturday: **October 17, 2026**. Study Friday: **October 23, 2026**. Driving throughout. The following totals are product estimates per person, not prices quoted by venues.

| # | Scenario | F | Data | Q | Observation / remaining question |
| --- | --- | --- | --- | --- | --- |
| 1 | Nothing planned | Pass | Uncertain | Needs improvement | Five people, $40/person preserved; real meal/activity/dessert, feasible mapped travel. Estimated $48/person is disclosed above the soft target. Finishes 7:30 PM despite an 11 PM preference; long-window pacing needs review. |
| 2 | Beach date | Pass | Uncertain | Needs improvement | Real beach experience, dinner and ice cream; approximately $28/person. Beach hours unavailable and disclosed. Judge peacefulness, coastal access and geographic flow in person. |
| 3 | Specific destination | Pass | Uncertain | Needs improvement | Exact Google Huntington Beach Pier destination ID retained. Google identity is not proof of beach/pier access; how well the surrounding sequence delivers the beach experience remains a quality/data question. |
| 4 | Dinner reservation | Pass | Uncertain | Needs improvement | Exact restaurant and 7 PM retained, plus the user-entered 60-minute duration. Activities before and after. This is a simulated fixed commitment, not an actual booking. |
| 5 | Partial outing | Pass | Uncertain | Needs improvement | Venue-free bowling and dessert ideas survive; bowling precedes dessert and dinner fills a gap. Dinner is inserted between them; assess whether that flow feels right. |
| 6 | Almost complete | Pass | Uncertain | Needs improvement | Three real places selected, then only dessert explicitly replaced via Edit details. New dessert appears; other two identities and the same Plan ID remain. |
| 7 | Strict budget | Pass | Uncertain | Needs improvement | Dinner plus activity estimated at exactly $35/person. Cap and unverified-price disclosures shown. Activity hours were unknown; no guarantee of actual spending or access. Controlled over-cap combinations fail instead of pretending the activity is included. |
| 8 | Short relaxed night | Pass | Uncertain | Needs improvement | Dessert and walk, no extra stops, finish 9:25 PM within the firm 8–9:30 PM window; approximately $13/person. Dessert came first; judge relaxed pacing and preferred order. |
| 9 | Difficult timing | Pass | Uncertain | Needs improvement | Far-apart selected pier plus fixed 7 PM dinner rejected as infeasible. Supplied identities and exact times remain intact; usefulness of the generic explanation could improve. |
| 10 | Keep and change | Pass | Uncertain | Needs improvement | Keep one stop, change dessert. Only target identity changes; every unrelated stop, Keep protection and Plan ID survive. |
| 11 | Save and return | Pass | Uncertain | Good | Actual SQLite close/reopen and a new API instance retain the edited Plan, revision, identities, times, Keep and budget. Local browser Keep + server restart + refresh also checked. Phone acceptance remains for the founders. |
| 12 | Running late | Pass | Uncertain | Needs improvement | Simulated completion → 15-minute delay → skip retains completed identity, timing, duration and execution history; adjusts the future. Bounded repair only, not proof of autonomous recovery or attendance. |
| 13 | Library reality | Pass | Uncertain | Needs improvement | Real library near Buena Park; listed Friday hours support the scheduled visit. Access/student restrictions, seats, special closures and parking explicitly uncertain, including after reopening. An isolated dated-closure fixture excludes the closed library. Next-Friday real hours are not independently verified holiday/special hours. |
| 14 | Missing/failed provider information | Pass | Uncertain | Good | Controlled missing hours/prices remain uncertain. Injected failures on reopening, editing and live update produce clean errors and leave the saved snapshot/revision unchanged. Recovery reopens the same Plan. |
| 15 | Invalid AI response — mock only | Pass | Uncertain | Good | Fabricated ID, omitted/replaced fixed reservation despite a claimed preservation, and attempted model-supplied arrival override rejected. Independently validated fallback preserves the original restaurant and 7 PM. No external AI request. |

## Evidence and verification limits

- Full automated suite: **150 passed, 0 failed**. TypeScript and the production client/Worker build are checked as part of release packaging.
- `artifacts/pre-ai/live-results.json`: timestamp, dates, statuses, stable Place IDs, own roles/hours assessments, estimated totals, times and run IDs. No credentials, saved-link bearer keys, raw Google objects, copied addresses or permanent business catalog. The live runner uses an isolated temporary SQLite database and removes it afterward; its IDs are diagnostic references, not reopenable public links.
- `artifacts/pre-ai/reopened-warnings.png`: actual local browser result after Keep, server restart and reopening. Captured below the private saved link; it shows the restored cost warning.
- `tests/pre-ai.test.ts`: focused regressions for the observed failures, special library closure, saved cap conflict, provider outage and invalid mock proposal.
- Existing overnight, fixed/flexible, all-five-state, persistence, revision-conflict, cloud/D1 and live-repair tests remain in the full suite.
- Final live run: **155 Google backend calls, 0 OpenAI calls**. Google dollar cost is unmeasured. Browser map/autocomplete calls are additional and excluded from that counter.
- Final sampled live build requests took **0.26–0.77 seconds**, excluding interactive typing, browser rendering and manual inspection. Every sampled build stayed below 30 seconds. This is a small controlled sample, not a production latency percentile or guarantee.
- No business website/phone or on-site verification occurred. `OPEN_CONFIRMED` means the supplied provider hours cover that visit; it does not prove public access, a seat, a ticket or a booking. No real-world price is guaranteed.
- Functionality Pass applies to the assertions listed above. It does not certify arbitrary natural-language ordering, every possible location or flawless recommendations. Founder manual acceptance and Q review remain outstanding.

## Files to know

- `scripts/verify-pre-ai.mjs`: repeatable 13 live + 2 controlled founder checks; forces model usage off and rejects attempted OpenAI network calls.
- `tests/pre-ai.test.ts`: isolated deterministic regression coverage, clearly synthetic and never a consumer fallback.
- `src/planning/budget.ts`: shared cap interpretation, still per person.
- `src/planner/intent.ts`, `types.ts`, `schedule.ts`: requested/inferred experiences and safe scheduling fallback.
- `src/planner/qualification.ts`, `estimates.ts`, `visitWarnings.ts`: study/pier classification and honest, regenerable estimates/cautions.
- `src/world/types.ts`, `server/googleProvider.ts`: normalized study search through the existing Google provider boundary.
- `server/realPlanner.ts`: short-window allowances, study candidate search and warnings.
- `server/planRepository.ts`, `server/liveRepair.ts`: retained disclosures during reopening and updates.
- `tests/pacing.test.ts`: updates the previous incorrect expectation that a meal-only result counts as completing a dinner/activity request under an impossible cap.

No new dependency, database migration, credential or service is required. Existing environment configuration stays server-side. No AI activation, chatbot, weather, accounts, booking, payments, Explore, social feature or app rewrite.

## Repeat and founder handoff

From `/Users/abhinavkolasani/outing-planner-v01`:

```sh
pnpm test
pnpm build
pnpm test:pre-ai:live
pnpm dev
```

The third command intentionally makes live Google calls using the configured server key and rewrites the acceptance JSON. It never makes a paid OpenAI call. Open the local URL printed by the last command. If Node is not in the Terminal path, use the bundled-runtime PATH instructions in `ROVELLE_TECHNICAL_STATE.md`.

Josh and Abhinav should rerun the same 15 cases on the published site, particularly phone reopening, their exact preferred venues and the library access check. For each, record F, Data, Q, a short observation and a private Plan link/screenshot if useful. Do not publish bearer links or credentials in GitHub. Fix new Function/Trust failures; investigate Data; preserve Q observations for the comparison.

Before any paid model experiment, Abhinav still needs to confirm the integration and spending safeguards. A planning-budget discussion has not activated billing. The existing model gateway remains off, with no live model quality/cost/latency claim.

Suggested commit message: `fix: harden pre-AI planning trust and add founder acceptance checks`
