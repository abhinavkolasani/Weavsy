import type { PlanRepository } from './planRepository.ts';
import type { RunStore } from './api.ts';
interface Statement { bind(...values: unknown[]): Statement; first<T = Record<string, unknown>>(): Promise<T | null>; run(): Promise<unknown> }
export interface DatabaseBinding { prepare(sql: string): Statement; batch(statements: Statement[]): Promise<unknown[]> }
export function createCloudStore(db: DatabaseBinding): RunStore & PlanRepository {
  return {
    async getPlan(id) { const r=await db.prepare('SELECT * FROM saved_plans WHERE id=?').bind(id).first<{id:string;revision:number;token_hash:string;snapshot:string;updated_at:string}>();return r?{id:r.id,revision:r.revision,tokenHash:r.token_hash,snapshot:r.snapshot,updatedAt:r.updated_at}:null; },
    async insertPlan(r) { await db.prepare('INSERT INTO saved_plans VALUES (?,?,?,?,?,?,?)').bind(r.id,r.revision,r.tokenHash,r.snapshot,r.updatedAt,r.updatedAt,r.eventJson??JSON.stringify({revision:r.revision,at:r.updatedAt})).run(); },
    async updatePlan(r,expected) { return !!await db.prepare('UPDATE saved_plans SET revision=?,snapshot=?,updated_at=?,event_json=? WHERE id=? AND revision=? RETURNING id').bind(r.revision,r.snapshot,r.updatedAt,r.eventJson??JSON.stringify({revision:r.revision,at:r.updatedAt}),r.id,expected).first(); },
    async save(run) {
      const statements = [db.prepare('INSERT INTO plan_runs (run_id,timestamp,build,parent_run_id,raw_json) VALUES (?,?,?,?,?)').bind(run.runId, run.timestamp, run.build, run.parentRunId, JSON.stringify(run))];
      if (run.parentRunId) statements.push(db.prepare('INSERT INTO plan_events (run_id,timestamp,type,raw_json) VALUES (?,?,?,?)').bind(run.parentRunId, run.timestamp, run.edit?.kind??'rebuild', JSON.stringify({ nextRunId: run.runId,status:run.status,planId:run.currentPlan?.id })));
      await db.batch(statements);
    },
    async get(id) { const row = await db.prepare('SELECT raw_json FROM plan_runs WHERE run_id=?').bind(id).first<{ raw_json: string }>(); return row ? JSON.parse(row.raw_json) : null; },
  };
}
/** Counters are shared across cloud instances; no visitor IP is stored in plain text. */
export async function withinPublicLimits(db: DatabaseBinding, req: Request, now = Date.now()) {
  const path = new URL(req.url).pathname;
  const reopen=req.method==='GET'&&path.startsWith('/api/plans/');
  if ((req.method !== 'POST'&&!reopen) || !path.startsWith('/api/')) return true;
  const ip = req.headers.get('cf-connecting-ip') ?? 'unknown';
  const day = Math.floor(now / 86400000), window = Math.floor(now / 300000);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${day}:${ip}`));
  const visitor = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const limits = [{ key: `requests:${visitor}:${window}`, limit: 120 }];
  if (path.startsWith('/api/plans')) limits.push({ key: `${reopen?'reopens':'plans'}:${visitor}:${window}`, limit: path==='/api/plans'?6:20 }, { key: `${reopen?'daily-reopens':'daily-plans'}:${day}`, limit: reopen?300:150 });
  for (const item of limits) {
    const row = await db.prepare('INSERT INTO request_limits (bucket,used,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET used=used+1 WHERE used<? RETURNING used').bind(item.key, now + 86400000, item.limit).first();
    if (!row) return false;
  }
  await db.prepare('DELETE FROM request_limits WHERE expires_at<?').bind(now).run();
  return true;
}
