import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { validateRequest } from '../src/planning/validate.ts';
import { isPlanningDraft } from '../src/planning/state.ts';
import { createWorldProvider, WorldError } from './worldProvider.ts';
import { createStore } from './store.mjs';
const production = process.argv.includes('--production');
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const world = createWorldProvider();
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
        res.setHeader('Cache-Control', 'no-store');
        let received = null;
        try {
            if (req.method === 'GET' && req.url === '/api/world/config') {
                res.end(JSON.stringify({provider:'openstreetmap',mapStyleUrl:process.env.MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/positron'}));
                return;
            }
            if (req.method === 'GET' && req.url.startsWith('/api/runs/')) {
                const run = store.get(req.url.slice(10));
                res.statusCode = run ? 200 : 404;
                res.end(JSON.stringify(run ?? { error: 'Run not found' }));
                return;
            }
            if (req.method !== 'POST' || !['/api/plans','/api/world/autocomplete','/api/world/details','/api/world/search'].includes(req.url)) {
                res.statusCode = 404;
                res.end(JSON.stringify({ error: 'Unknown endpoint' }));
                return;
            }
            let body = '';
            for await (const chunk of req) {
                body += chunk;
                if (body.length > 100000)
                    throw new WorldError('Request too large',413);
            }
            let input;
            try { input = JSON.parse(body); } catch { throw new WorldError('Send a valid request.',400); }
            if (!input || typeof input !== 'object' || Array.isArray(input)) throw new WorldError('Send a valid request.',400);
            if (req.url === '/api/world/autocomplete') {res.end(JSON.stringify(await world.autocompleteLocation(input.query,input.bias)));return;}
            if (req.url === '/api/world/details') {if(typeof input.placeId !== 'string')throw new WorldError('Select a valid place.',400);res.end(JSON.stringify(await world.getPlaceDetails(input.placeId)));return;}
            if (req.url === '/api/world/search') {res.end(JSON.stringify(await world.searchPlaces(input)));return;}
            received = input;
            if (!isPlanningDraft(input.draft)) throw new WorldError('Your outing details are incomplete. Review the form and try again.',400);
            const valid = validateRequest(input.draft,{requirePlaceSelections:true});
            if (!valid.ok) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Invalid request', details: valid.errors }));
                return;
            }
            const request = valid.request;
            const selectedPlaces=[request.startingPlace,...request.existingStops.flatMap(stop=>stop.place?[stop.place]:[])];
            const references = await world.resolveReferences(selectedPlaces.map(place=>place.provider_place_id),selectedPlaces);
            // Identity comes from the provider. Never change fixed/time/note constraints here.
            request.startingPlace = references.get(request.startingPlace.provider_place_id);
            request.startingLocation = request.startingPlace.display_name;
            request.existingStops = request.existingStops.map(stop=>stop.place?{...stop,place:references.get(stop.place.provider_place_id),name:references.get(stop.place.provider_place_id).display_name}:stop);
            const run = {runId:crypto.randomUUID(),timestamp:new Date().toISOString(),build,request,status:'not-generated',parentRunId:typeof input.parentRunId === 'string' && store.get(input.parentRunId) ? input.parentRunId : null};
            store.save(run);
            res.end(JSON.stringify(run));
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Planning failed';
            if (error instanceof WorldError || req.url?.startsWith('/api/world/')) {res.statusCode=error instanceof WorldError?error.status:503;res.end(JSON.stringify({error:message}));return;}
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
