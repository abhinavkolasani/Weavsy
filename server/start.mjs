import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { createStore } from './store.mjs';
import { createApi } from './api.ts';
const production = process.argv.includes('--production');
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
let build = 'uncommitted';
try { build = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch {}
const handleApi = createApi({ env: process.env, store: createStore(), build, allowDiagnostics: true });
const vite = production ? null : await (await import('vite')).createServer({ server: { middlewareMode: true }, appType: 'spa' });
const server = createServer(async (req, res) => {
  if (req.url?.startsWith('/api/')) {
    try {
      const method = req.method ?? 'GET';
      const init = { method, headers: req.headers, ...(['GET', 'HEAD'].includes(method) ? {} : { body: Readable.toWeb(req), duplex: 'half' }) };
      const response = await handleApi(new Request('http://127.0.0.1' + req.url, init));
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'The outing service is unavailable right now. Please try again.' })); }
    return;
  }
  if (vite) { vite.middlewares(req, res); return; }
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    const safe = /^\/assets\/[a-zA-Z0-9_.-]+$/.test(path) ? `dist${path}` : 'dist/index.html';
    res.setHeader('Content-Type', safe.endsWith('.js') ? 'text/javascript' : safe.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(readFileSync(safe));
  } catch { res.statusCode = 404; res.end('Not found'); }
});
server.listen(Number(process.env.PORT || 5174), '127.0.0.1', () => console.log('Outing planner: http://127.0.0.1:' + (process.env.PORT || 5174)));
