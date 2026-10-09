/** Provider-neutral diagnostic metadata; not a model's authority to mutate a plan. */
export interface ModelMetrics {
  provider:'openai';model:string|null;constitutionVersion:string;
  status:'disabled'|'unavailable'|'malformed'|'proposed'|'rejected'|'accepted';
  calls:number;retries:number;latencyMs:number;inputTokens:number|null;outputTokens:number|null;
  estimatedCostUsd:number|null;validationErrors?:string[];
}
