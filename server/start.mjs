import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { compose } from '../src/planning/compose.ts';
import { validateRequest } from '../src/planning/validate.ts';
import { createStore } from './store.mjs';
const production = process.argv.includes('--production');
const store = createStore();
let build = 'uncommitted';
try {
    build = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}
catch { }
const vite = production ? null : await (await import('vite')).createServer({ server: { middlewareMode: true }, appType: 'spa' });
const server = createServer(async (req, res) => {
    if (req.url?.startsWith('/api/')) {
        res.setHeader('Content-Type', 'application/json');
        let received = null;
        try {
            if (req.method === 'GET' && req.url.startsWith('/api/runs/')) {
                const run = store.get(req.url.slice(10));
                res.statusCode = run ? 200 : 404;
                res.end(JSON.stringify(run ?? { error: 'Run not found' }));
                return;
            }
            if (req.method !== 'POST' || req.url !== '/api/plans') {
                res.statusCode = 404;
                res.end(JSON.stringify({ error: 'Unknown endpoint' }));
                return;
            }
            let body = '';
            for await (const chunk of req) {
                body += chunk;
                if (body.length > 100000)
                    throw new Error('Request too large');
            }
            const input = JSON.parse(body);
            received = input;
            const valid = validateRequest(input.draft);
            if (!valid.ok) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Invalid request', details: valid.errors }));
                return;
            }
            const run = await compose(valid.request);
            run.build = build;
            run.parentRunId = typeof input.parentRunId === 'string' && store.get(input.parentRunId) ? input.parentRunId : null;
            store.save(run);
            res.end(JSON.stringify(run));
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Planning failed';
            const failure = { runId: crypto.randomUUID(), timestamp: new Date().toISOString(), build, parentRunId: null, status: 'error', received, error: message };
            try {
                store.save(failure);
            }
            catch { }
            res.statusCode = 500;
            res.end(JSON.stringify({ error: message, runId: failure.runId }));
        }
        return;
    }
    if (vite) {
        vite.middlewares(req, res);
        return;
    }
    try {
        const path = new URL(req.url, 'http://localhost').pathname;
        const safe = path.startsWith('/assets/') && !path.includes('..') ? `dist${path}` : 'dist/index.html';
        res.setHeader('Content-Type', safe.endsWith('.js') ? 'text/javascript' : safe.endsWith('.css') ? 'text/css' : 'text/html');
        res.end(readFileSync(safe));
    }
    catch {
        res.statusCode = 404;
        res.end('Not found');
    }
});
server.listen(Number(process.env.PORT || 5174), '127.0.0.1', () => console.log('Outing planner: http://127.0.0.1:' + (process.env.PORT || 5174)));
