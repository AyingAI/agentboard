import { afterEach, describe, expect, it, vi } from 'vitest';
import { pollLocalCliResult, runLocalCli } from '../localCliAgent';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

it.each([
  ['TimeoutError', 'TIMEOUT', true],
  ['AbortError', 'ABORTED', false],
] as const)('maps native %s and cancels the server-side run', async (name, code, retryable) => {
  const controller = new AbortController();
  const fetcher = vi.fn((_url: string, options: RequestInit) => {
    if (options.method === 'DELETE') return Promise.resolve(new Response());
    return new Promise<Response>((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true });
    });
  });
  globalThis.fetch = fetcher as unknown as typeof fetch;

  const pending = runLocalCli('pi', 'system', 'task', controller.signal);
  controller.abort(new DOMException('Native interruption', name));

  await expect(pending).rejects.toMatchObject({ code, retryable });
  const request = JSON.parse(fetcher.mock.calls[0][1].body as string);
  expect(fetcher.mock.calls[1]).toEqual([
    `/api/agent/run/${request.requestId}`, { method: 'DELETE', keepalive: true },
  ]);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

describe('local CLI recovery polling', () => {
  it('preserves provider failure classification when recovering a disconnected stream', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'failed', code: 'AUTH_ERROR', retryable: false, error: '认证失败' }))) as typeof fetch;
    await expect(pollLocalCliResult('failed-run', new AbortController().signal)).rejects.toMatchObject({ code: 'AUTH_ERROR', retryable: false });
  });
  it('returns a completed background result after the stream disconnects', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: 'completed',
      text: '{"type":"dsl_patch","summary":"recovered","ops":[],"questions":[]}',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as unknown as typeof fetch;

    await expect(pollLocalCliResult(
      'run-1',
      new AbortController().signal,
    )).resolves.toContain('"summary":"recovered"');
  });

  it('offers ordinary recovery instead of asking the user to redefine a lost task', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('', { status: 404 })) as unknown as typeof fetch;
    await expect(pollLocalCliResult('missing-run', new AbortController().signal)).rejects.toMatchObject({
      code: 'API_ERROR', reason: 'incomplete', retryable: false, message: '本地 Agent 运行状态已丢失。原请求已保留，可直接重新尝试。',
    });
  });
});
