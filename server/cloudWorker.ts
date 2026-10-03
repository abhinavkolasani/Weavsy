import { createApi } from './api.ts';
import type { ApiEnvironment } from './api.ts';
import { createCloudStore, withinPublicLimits } from './cloudStore.ts';
import type { DatabaseBinding } from './cloudStore.ts';
interface Environment extends ApiEnvironment { DB: DatabaseBinding; ASSETS: { fetch(request: Request): Promise<Response> } }
export default {
  async fetch(req: Request, env: Environment): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/founder') || url.pathname.startsWith('/api/runs/')) return new Response('Not found', { status: 404 });
    try {
      let response: Response;
      if (url.pathname.startsWith('/api/')) {
        const origin = req.headers.get('Origin');
        if (req.method === 'POST' && origin && origin !== url.origin) return Response.json({ error: 'Please use the outing planner website.' }, { status: 403 });
        if (!await withinPublicLimits(env.DB, req)) return Response.json({ error: 'A few too many requests. Please wait a few minutes and try again.' }, { status: 429, headers: { 'Retry-After': '300' } });
        response = await createApi({ env, store: createCloudStore(env.DB) })(req);
      } else {
        if (!['/', '/terms', '/privacy'].includes(url.pathname) && !url.pathname.startsWith('/assets/')) return new Response('Not found', { status: 404 });
        response = await env.ASSETS.fetch(url.pathname.startsWith('/assets/') ? req : new Request(new URL('/index.html', url), req));
      }
      const headers = new Headers(response.headers);
      headers.set('X-Content-Type-Options', 'nosniff'); headers.set('Referrer-Policy', 'strict-origin-when-cross-origin'); headers.set('X-Frame-Options', 'DENY');
      return new Response(response.body, { status: response.status, headers });
    } catch { return Response.json({ error: 'The outing service is unavailable right now. Your choices are still here. Please try again.' }, { status: 503 }); }
  },
};
