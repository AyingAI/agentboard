import { afterEach, describe, expect, it, vi } from 'vitest';
import { pollLocalCliResult } from '../localCliAgent';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('local CLI recovery polling', () => {
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

  it('surfaces a missing server-side run with a clear message', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('', { status: 404 })) as unknown as typeof fetch;

    await expect(pollLocalCliResult(
      'missing-run',
      new AbortController().signal,
    )).rejects.toMatchObject({
      code: 'API_ERROR',
      message: '本地 Agent 运行状态已丢失，请重新发送任务。',
    });
  });
});
