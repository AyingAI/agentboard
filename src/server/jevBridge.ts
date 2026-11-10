import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { isLocalRequest, LocalRequestError, readLocalJson, sendLocalJson } from './localApi';

/** Fixed upstream, no persisted keys or request logging. Avoids browser CORS in local mode. */
export async function handleJevRequest(req: IncomingMessage, res: ServerResponse, upstream: typeof fetch = fetch) {
  const reply = (status: number, value: unknown) => sendLocalJson(res, status, value);
  if (!isLocalRequest(req)) { reply(403, { error: 'Local same-origin requests only' }); return; }
  if (req.method !== 'POST') { reply(405, { error: 'POST required' }); return; }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  const disconnect = () => { if (!res.writableEnded) controller.abort(); };
  res.on('close', disconnect);
  try {
    const value = await readLocalJson(req, 250_000);
    const request = value.request as Record<string, unknown> | null | undefined;
    if (typeof value.apiKey !== 'string' || !value.apiKey.trim() || value.apiKey.length > 4096
      || !request?.questions || typeof request.questions !== 'object' || Array.isArray(request.questions) || typeof request.model !== 'string') {
      reply(400, { error: 'Invalid Jev request' }); return;
    }
    const response = await upstream('https://api.typesafe.ai/v1/systemone', { method: 'POST', signal: controller.signal, redirect: 'error',
      headers: { Authorization: `Bearer ${value.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: request.model, state: request.state, questions: request.questions }) });
    if (!response.ok) { reply(response.status, { error: `Jev returned ${response.status}` }); return; }
    const data = await response.json();
    reply(200, { model: data.model, answers: data.answers, usage: data.usage });
  } catch (error) {
    if (error instanceof LocalRequestError) reply(error.status, { error: error.message });
    else reply(502, { error: 'Jev is unavailable; the main Agent can continue' });
  }
  finally { clearTimeout(timer); res.off('close', disconnect); }
}

export function jevBridgePlugin(): Plugin {
  return { name: 'jev-bridge', configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url?.split('?')[0] === '/api/jev/evaluate') void handleJevRequest(req, res);
      else next();
    });
  } };
}
