import type { CandidatePlace } from './types.ts';

/** Recomputed on generation/reopening: provider refresh must not erase product cautions. */
export function visitWarnings(category: string, hoursStatus: CandidatePlace['hoursStatus']): string[] {
  const warnings: string[] = [];
  if (hoursStatus === 'HOURS_UNKNOWN') warnings.push('Hours weren’t available here — worth checking before you go.');
  if (hoursStatus === 'HOURS_PARTIAL') warnings.push('Only some hours were available — check the full visit window before going.');
  if (hoursStatus === 'CLOSED_CONFIRMED') warnings.push('Current listed availability conflicts with this saved visit. Your choice and times are preserved; confirm or explicitly change this stop.');
  if (category === 'Library / study') warnings.push('Library hours do not confirm study access or a seat. Check visitor/student restrictions, special closures and parking costs with the library.');
  if (category === 'Cinema') warnings.push('Choose an actual showtime before going; this is a visit allowance.');
  if (category === 'Active activity') warnings.push('Check public access, sessions and equipment requirements.');
  if (category === 'Waterfront / pier') warnings.push('Confirm public access and any pier closures before going. Admission and parking costs are unverified.');
  return warnings;
}
