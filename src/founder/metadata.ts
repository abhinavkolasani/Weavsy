export interface FounderMetadata {
  schemaVersion: 1;
  prototypeVersion: '0.1.0';
  batch: 1 | 3;
  requestId: string;
  submittedAt: string;
  plannerStatus: 'not-built' | 'built';
}
export function createFounderMetadata(): FounderMetadata {
  return { schemaVersion: 1, prototypeVersion: '0.1.0', batch: 1, requestId: crypto.randomUUID(), submittedAt: new Date().toISOString(), plannerStatus: 'not-built' };
}
