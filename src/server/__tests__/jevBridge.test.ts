import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { handleJevRequest } from '../jevBridge';

function exchange(origin = 'http://localhost:5173') {
  const body = { apiKey: 'local-test-key', request: { model: 'jev-latest', state: { topic: 'sample' }, questions: { connected: { type: 'noul', instructions: 'Does the topic exist?' } }, url: 'https://unexpected.example' } };
  const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), {
    method: 'POST', socket: { remoteAddress: '127.0.0.1' },
    headers: { origin, host: 'localhost:5173', 'content-type': 'application/json' },
  });
  let output = '';
  const res = Object.assign(new EventEmitter(), { statusCode: 200, destroyed: false, writableEnded: false, setHeader: vi.fn(), end(value: string) { output = value; this.writableEnded = true; } });
  return { req: req as IncomingMessage, res: res as unknown as ServerResponse, body: () => JSON.parse(output) };
}

describe('optional Jev bridge', () => {
  it('rejects requests from another browser origin before forwarding credentials', async () => {
    const { req, res, body } = exchange('https://unexpected.example');
    const upstream = vi.fn();
    await handleJevRequest(req, res, upstream);
    expect(res.statusCode).toBe(403); expect(body().error).toBeTruthy(); expect(upstream).not.toHaveBeenCalled();
  });
  it('only forwards to TypeSafe and returns the answer without reflecting credentials', async () => {
    const { req, res, body } = exchange();
    const upstream = vi.fn().mockResolvedValue(new Response(JSON.stringify({ model: 'jev-latest', answers: { connected: { type: 'noul', noul: 1 } }, debug: 'private-provider-debug' })));
    await handleJevRequest(req, res, upstream);
    expect(upstream.mock.calls[0][0]).toBe('https://api.typesafe.ai/v1/systemone');
    expect(upstream.mock.calls[0][1].redirect).toBe('error');
    expect(JSON.parse(upstream.mock.calls[0][1].body).url).toBeUndefined();
    expect(res.statusCode).toBe(200); expect(body().answers.connected.noul).toBe(1);
    expect(JSON.stringify(body())).not.toMatch(/local-test-key|private-provider-debug/);
  });
  it('returns a recoverable error without exposing upstream error contents', async () => {
    const { req, res, body } = exchange();
    await handleJevRequest(req, res, vi.fn().mockRejectedValue(new Error('credentials: local-test-key')));
    expect(res.statusCode).toBe(502); expect(body().error).toContain('main Agent can continue');
    expect(JSON.stringify(body())).not.toContain('local-test-key');
  });
});
