import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
export function createStore(path = '.data/plan-runs.sqlite') {
    mkdirSync('.data', { recursive: true });
    const db = new DatabaseSync(path);
    db.exec('CREATE TABLE IF NOT EXISTS plan_runs (run_id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, build TEXT NOT NULL, parent_run_id TEXT, raw_json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS plan_events (event_id INTEGER PRIMARY KEY, run_id TEXT NOT NULL, timestamp TEXT NOT NULL, type TEXT NOT NULL, raw_json TEXT NOT NULL)');
    return { save(run) { db.prepare('INSERT INTO plan_runs VALUES (?, ?, ?, ?, ?)').run(run.runId, run.timestamp, run.build, run.parentRunId, JSON.stringify(run)); if (run.parentRunId)
            db.prepare('INSERT INTO plan_events (run_id,timestamp,type,raw_json) VALUES (?,?,?,?)').run(run.parentRunId, run.timestamp, run.edit?.kind??'rebuild', JSON.stringify({ nextRunId: run.runId,status:run.status,planId:run.currentPlan?.id })); }, get(id) { const row = db.prepare('SELECT raw_json FROM plan_runs WHERE run_id=?').get(id); return row ? JSON.parse(row.raw_json) : null; }, close() { db.close(); } };
}
