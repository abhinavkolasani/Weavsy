# Batch 2 acceptance — controlled place data

**Founder graduation pending. Do not begin Batch 3 until Josh + Abhinav pass the benchmark or Build Lab explicitly defers an item.** User direction authorized this Batch 2 implementation; this checklist does not retrospectively assert that founders signed off Batch 1.

## Manual checks

From `/Users/abhinavkolasani/outing-planner-v01`:

- [ ] Run `pnpm catalog:inspect`. Confirm 24 records, 22 active, 2 inactive and seven categories. Every displayed ID is unique and stable.
- [ ] Run `pnpm catalog:inspect --place TEST_SIT_DOWN_01`. Explain each field using `src/data/README.md`: cost is cents/person, duration is minutes, coordinates/address are null, group bounds are explicit, status is synthetic.
- [ ] Check that Monday is closed, Wednesday has lunch/dinner intervals, and Friday/Saturday closing differs. Inspect `TEST_WALK_03` and explain how null Thursday hours differ from a closed day.
- [ ] Review category, cost ($0–$65), duration (20–150 minutes), vibe and occasion variety. These are testing fixtures, not live recommendations or businesses.
- [ ] Inspect `src/data/index.ts` and the examples in the data README. Confirm future UI/planning code has one service entry point for active lists, exact-ID lookup and basic queries.
- [ ] Run `pnpm catalog:inspect --validate TEST_CAFE_01 TEST_PARK_01`. Confirm success and the same two IDs.
- [ ] Run `pnpm catalog:inspect --validate TEST_MISSING_99`. Confirm `PLACE_NOT_FOUND` and expected exit code 1.
- [ ] Run `pnpm catalog:inspect --validate TEST_SIT_DOWN_04`. Confirm `PLACE_INACTIVE` and expected exit code 1. Direct `--place` lookup should still allow inspecting the inactive record.
- [ ] Review every record's TEST name, fictional area, null address/coordinates and synthetic data notes. Confirm no real Orange County business/hours/prices were fabricated.
- [ ] Run `pnpm test` (23 checks) and `pnpm build`. The original 11 guest-flow tests must still pass.
- [ ] Open the guest app with `pnpm dev`. Submit a fixed dinner at 7 PM with unknown duration. Confirm the original request and fixed constraints survive in results. The catalog must not force a match, change the request, generate an itinerary or add recommendations.

## Targeted follow-up if a benchmark fails

- Failed benchmark:
- Exact input / command / steps:
- Observed behavior (include error code or field):
- Expected behavior:

Request the smallest general fix and retest the failed benchmark plus directly affected checks. Stay in Batch 2. Defer later-batch features and polish/taste items.

## Graduation record

- Josh verified:
- Abhinav verified:
- Remaining failures:
- Items explicitly deferred by Build Lab:
- Batch 2 graduation decision/date:
