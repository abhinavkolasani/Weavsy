# Stage A — guest experience correction

Stage A is implemented and independently retested. Stage B implementation is stopped at the manual Google Cloud configuration gate. See `GOOGLE_SETUP.md` and `BATCH_HANDOFF.md`.

Budget investigation: the existing validation already converts $40 per person to `amountCents: 4000` and retains group size 5 independently. No division by group size exists in this checkout. An $8 individual stop estimate could appear in results, while the entered $40 ceiling was absent; budget versus estimated spend was easy to confuse. The consumer summary now prominently says “About $40 per person.” A regression locks this input pair at 4000 cents per person.

The guest location label is “Where are you?” New drafts use the browser’s local calendar date. Existing saved and selected dates remain intact. Explicit hour/minute/AM-PM selectors display 4 PM and 11 PM while retaining 16:00 and 23:00 internally. Existing stop timing uses the same control, preserving 7 PM reservations as 19:00. Arbitrary saved minutes, noon and midnight are supported.

Consumer results now honestly summarize the saved outing request, budget, times and fixed/flexible pieces. They explicitly state that a complete itinerary is not available yet. They do not show fictional place recommendations, diagnostics or implementation terminology. Engineering composition, raw runs, SQLite persistence, and `/founder` diagnostics remain available internally. There is no guest-facing debug link.

All five starting situations remain supported, with Nothing planned the fresh default. Existing session drafts and unavailable-storage in-memory behavior are retained. No external provider, account, key or API integration was added.

43 tests and the production build passed again during independent verification on October 2, 2026.

## Required browser retests

| Check | Result | Evidence |
| --- | --- | --- |
| A1 Budget | Pass | Five people and $40 displayed “About $40 per person”; stored request contained `budgetPerPerson.amountCents: 4000`, independently from `groupSize: 5`. |
| A2 Date | Pass | Fresh browser tab defaulted to local October 2, 2026. Changing to October 3 survived submission and refresh. |
| A3 Time | Pass | Explicit hour/minute/PM selectors submitted 4:00 PM–11:00 PM; stored times were `16:00` and `23:00`. |
| A4 Fixed stop | Pass | Dinner at 7:00 PM retained `fixed: true`, `startTime: "19:00"`, its name and note after submission, mode changes and refresh. |
| A5 Language | Pass | Guest form and results contained no founder/debug/test terminology, raw state or fictional recommendations. Diagnostics remain at `/founder`. |
| A6 Guest flow | Pass | All eight inputs and all five starting states reached results. Partial and almost-complete requests preserved separate fixed dinner and flexible walk records. Negative budget, zero group size and end-before-start produced clear validation errors. |

Mobile form and results were inspected at 390 × 844. Document width equaled viewport width (390 px), with no horizontal overflow. Runtime requests were independently inspected in the local SQLite store to confirm structured values. No Google requests were made.
