import type { PlanProposal } from './gateway.ts';
import type { CandidatePlace } from '../../src/planner/types.ts';
/** Identity and commitment validation is independent of the model and its claimed preserved IDs. */
export function proposalIdentityErrors(proposal:PlanProposal,candidates:CandidatePlace[]):string[] {
  const ids=proposal.stops.map(s=>s.place_id),errors:string[]=[];
  if(proposal.status!=='plan'||!ids.length)errors.push('NO_PROPOSAL');
  if(new Set(ids).size!==ids.length)errors.push('DUPLICATE_PLACE');
  for(const s of proposal.stops){const c=candidates.find(c=>c.id===s.place_id);if(!c)errors.push('UNKNOWN_PLACE');else if(c.role!==s.experience_role)errors.push('ROLE_MISMATCH');}
  if(candidates.some(c=>c.userStopId&&!ids.includes(c.id)))errors.push('MISSING_COMMITMENT');
  return [...new Set(errors)];
}
