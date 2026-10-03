import type { RunStore } from './api.ts';
interface Statement { bind(...values: unknown[]): Statement; first<T = Record<string, unknown>>(): Promise<T | null>; run(): Promise<unknown> }
export interface DatabaseBinding { prepare(sql: string): Statement; batch(statements: Statement[]): Promise<unknown[]> }
export function createCloudStore(db: DatabaseBinding): RunStore {
  return {
    async save(run) {
      const statements = [db.prepare('INSERT INTO plan_runs (run_id,timestamp,build,parent_run_id,raw_json) VALUES (?,?,?,?,?)').bind(run.runId, run.timestamp, run.build, run.parentRunId, JSON.stringify(run))];
      if (run.parentRunId) statements.push(db.prepare('INSERT INTO plan_events (run_id,timestamp,type,raw_json) VALUES (?,?,?,?)').bind(run.parentRunId, run.timestamp, 'rebuild', JSON.stringify({ nextRunId: run.runId })));
      await db.batch(statements);
    },
    async get(id) { const row = await db.prepare('SELECT raw_json FROM plan_runs WHERE run_id=?').bind(id).first<{ raw_json: string }>(); return row ? JSON.parse(row.raw_json) : null; },
  };
}
/** Counters are shared across cloud instances; no visitor IP is stored in plain text. */
export async function withinPublicLimits(db: DatabaseBinding, req: Request, now = Date.now()) {
  const path = new URL(req.url).pathname;
  if (req.method !== 'POST' || !path.startsWith('/api/')) return true;
  const ip = req.headers.get('cf-connecting-ip') ?? 'unknown';
  const day = Math.floor(now / 86400000), window = Math.floor(now / 300000);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${day}:${ip}`));
  const visitor = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const limits = [{ key: `requests:${visitor}:${window}`, limit: 120 }];
  if (path === '/api/plans') limits.push({ key: `plans:${visitor}:${window}`, limit: 6 }, { key: `daily-plans:${day}`, limit: 150 });
  for (const item of limits) {
    const row = await db.prepare('INSERT INTO request_limits (bucket,used,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET used=used+1 WHERE used<? RETURNING used').bind(item.key, now + 86400000, item.limit).first();
    if (!row) return false;
  }
  await db.prepare('DELETE FROM request_limits WHERE expires_at<?').bind(now).run();
  return true;
}
