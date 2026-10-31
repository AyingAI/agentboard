import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAIAgentAdapter } from '../openaiAgent';
import { ClaudeAgentAdapter } from '../claudeAgent';
import type { BoardDSL } from '../../types/dsl';

const board: BoardDSL = { version: '0.1', board: { id: 'b', title: 'Test', viewport: { x: 0, y: 0, zoom: 1 } }, nodes: [], edges: [], groups: [], metadata: {} };
const answer = JSON.stringify({ type: 'dsl_patch', summary: 'Done', ops: [] });
afterEach(() => vi.unstubAllGlobals());

describe('API model flexibility and lifecycle', () => {
  it('uses the configured model and output budget on the official endpoint without forcing temperature', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: answer } }] }) });
    vi.stubGlobal('fetch', fetch);
    await new OpenAIAgentAdapter({ apiKey: 'test', model: 'chosen-model', maxOutputTokens: 32768 }).generateResponse({ boardState: board, userMessage: 'Create a visual' });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.model).toBe('chosen-model');
    expect(body.max_completion_tokens).toBe(32768);
    expect(body).not.toHaveProperty('temperature');
  });
  it('preserves max_tokens compatibility for custom endpoints', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: answer } }] }) });
    vi.stubGlobal('fetch', fetch);
    await new OpenAIAgentAdapter({ apiKey: 'test', baseUrl: 'https://compatible.example/v1' }).generateResponse({ boardState: board, userMessage: 'Create' });
    expect(JSON.parse(fetch.mock.calls[0][1].body).max_tokens).toBe(16384);
  });
  for (const provider of ['openai', 'claude'] as const) {
    it(`streams ${provider} visible text into a complete response without changing the model`, async () => {
      const delta = provider === 'openai'
        ? { choices: [{ delta: { content: answer } }] }
        : { type: 'content_block_delta', delta: { type: 'text_delta', text: answer } };
      const end = provider === 'openai' ? '[DONE]' : JSON.stringify({ type: 'message_stop' });
      const fetch = vi.fn().mockResolvedValue(new Response(`data: ${JSON.stringify(delta)}\n\ndata: ${end}\n\n`, { headers: { 'Content-Type': 'text/event-stream' } }));
      vi.stubGlobal('fetch', fetch);
      const adapter = provider === 'openai' ? new OpenAIAgentAdapter({ apiKey: 'test', model: 'chosen-model' }) : new ClaudeAgentAdapter({ provider: 'claude', apiKey: 'test', model: 'chosen-model' });
      const onProgress = vi.fn();
      expect(await adapter.generateResponse({ boardState: board, userMessage: 'Discuss', onProgress })).toMatchObject({ type: 'dsl_patch', summary: 'Done' });
      expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ model: 'chosen-model', stream: true });
      expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ type: 'output', outputChars: answer.length }));
    });
    it(`keeps ${provider} cancellation active while waiting for the response body`, async () => {
      vi.stubGlobal('fetch', vi.fn(async (_url, init) => ({
        ok: true,
        json: () => new Promise((_resolve, reject) => {
          const abort = () => reject(new DOMException('Aborted', 'AbortError'));
          if (init.signal.aborted) abort();
          else init.signal.addEventListener('abort', abort, { once: true });
        }),
      })));
      const controller = new AbortController();
      const adapter = provider === 'openai' ? new OpenAIAgentAdapter({ apiKey: 'test' }) : new ClaudeAgentAdapter({ provider: 'claude', apiKey: 'test' });
      const result = adapter.generateResponse({ boardState: board, userMessage: 'Create', signal: controller.signal });
      await Promise.resolve();
      controller.abort();
      await expect(result).rejects.toMatchObject({ code: 'ABORTED' });
    });
  }
});
