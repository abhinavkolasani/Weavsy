> Historical baseline checklist. See TECHNICAL_HANDOFF.md for the current complete prototype.

# Batch 1 acceptance — Josh + Abhinav

**Not graduated.** This checklist requires founder verification after handoff. Stay in Batch 1 until every benchmark passes or Build Lab explicitly defers the item. Later-batch features and taste-only polish do not block this batch.

## Suggested common input

Starting location: Los Angeles. Date: any valid date. Available start: 4:00 PM. Required end: 10:00 PM. Budget: $75.50/person. Group size: 2. Transportation: walking. Vibe/interests: relaxed dinner and art.

## Manual checklist

- [ ] Start the project and open the local preview. The first screen is the form with no account, sign-in, profile or onboarding requirement.
- [ ] Enter all eight core inputs. Submit Nothing planned. Confirm each input is present in the request summary; no itinerary or suggestions are invented.
- [ ] Submit blank required fields, a negative budget, group size 0/fraction, and an end time before/equal to start. Confirm clear errors, preserved input, no crash. Confirm budget $0 is accepted.
- [ ] Choose Anchor. Enter a name and optional note, leave time and duration unknown. Submit; confirm the place is fixed and unknown timing is not invented.
- [ ] Choose Reservation / fixed stop. Enter Fixed dinner at 7:00 PM, with no duration. Submit. Confirm Fixed and 7:00 PM in results. Expand Founder / debug and verify `fixed: true`, `startTime: "19:00"`, `durationMinutes: null`, `preservePlace: true`, `preserveStartTime: true`.
- [ ] For a reservation, omit the required start time or enter known timing beyond the outing window. Confirm a helpful error. Try an optional valid end time, then an optional valid duration.
- [ ] Choose Partial plan. Add two or more existing stops; make one fixed and one flexible. Include a known time, a duration, a note and at least one unknown duration. Submit and verify all pieces and statuses.
- [ ] Choose Almost-complete plan. Repeat adding/editing/removing entries and submit. Confirm the selected state is explicit in the summary and JSON.
- [ ] Switch between non-empty starting states. Confirm names, fixed flags and timing stay intact. Try Nothing planned with existing pieces; confirm it does not discard them. Explicitly remove pieces, then choose Nothing planned successfully.
- [ ] Use Edit request. Confirm values remain editable. Submit changes and verify the new summary. Refresh on both the form and results; no crash and the same tab’s state remains. Storage is not intended to persist across devices or after the tab session ends.
- [ ] Test a narrow phone-sized viewport. All fields/actions/results remain readable and usable; no horizontal scrolling.
- [ ] Inspect the source structure and run `pnpm test` and `pnpm build`. Save the first GitHub baseline without secrets.

## Targeted follow-up if an item fails

- Failed checklist item:
- Exact input / steps:
- Observed behavior:
- Expected behavior:
- Browser and screen size (if relevant):

Ask for the smallest general fix, then rerun the failed item and any directly affected checks. Do not begin Batch 2 because a first pass was delivered.

## Graduation record

- Josh verified:
- Abhinav verified:
- Remaining failed items:
- Items explicitly deferred by Build Lab:
- Batch 1 graduation decision/date:
