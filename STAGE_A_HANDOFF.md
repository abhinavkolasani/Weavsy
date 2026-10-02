# Stage A — guest experience correction

Stage A only. Stage B has not been researched or implemented and remains gated on the six required browser retests.

Budget investigation: the existing validation already converts $40 per person to `amountCents: 4000` and retains group size 5 independently. No division by group size exists in this checkout. An $8 individual stop estimate could appear in results, while the entered $40 ceiling was absent; budget versus estimated spend was easy to confuse. The consumer summary now prominently says “About $40 per person.” A regression locks this input pair at 4000 cents per person.

The guest location label is “Where are you?” New drafts use the browser’s local calendar date. Existing saved and selected dates remain intact. Explicit hour/minute/AM-PM selectors display 4 PM and 11 PM while retaining 16:00 and 23:00 internally. Existing stop timing uses the same control, preserving 7 PM reservations as 19:00. Arbitrary saved minutes, noon and midnight are supported.

Consumer results now honestly summarize the saved outing request, budget, times and fixed/flexible pieces. They explicitly state that a complete itinerary is not available yet. They do not show fictional place recommendations, diagnostics or implementation terminology. Engineering composition, raw runs, SQLite persistence, and `/founder` diagnostics remain available internally. There is no guest-facing debug link.

All five starting situations remain supported, with Nothing planned the fresh default. Existing session drafts and unavailable-storage in-memory behavior are retained. No external provider, account, key or API integration was added.

43 tests and production build passed. The root agent performs the six required browser retests before authorizing Stage B.
