import { afterEach, describe, expect, it, vi } from 'vitest';
import { discover } from '../discoveryAgent';
import { createExplorationBoard } from '../../data/exploration';

const board = createExplorationBoard('research', '公共空间如何被使用？', '待核实的观察记录');
const result = JSON.stringify({ type: 'discovery', understanding: '从记录出发核实使用方式', discoveries: [] });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('read-only discovery transport', () => {
  it('accepts OpenAI SSE while keeping the response separate from patches', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: result } }] })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } }));
    vi.stubGlobal('fetch', fetcher);
    expect((await discover({ provider: 'openai', apiKey: 'test-key' }, board, { discoveries: [] }, new AbortController().signal, () => {})).discoveries).toEqual([]);
    const request = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(request.tools).toBeUndefined();
    expect(request.messages[1].content).toContain('公共空间如何被使用');
  });
  it('accepts Claude JSON and rejects a regular patch in the background channel', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ content: [{ type: 'text', text: result }] }))));
    expect((await discover({ provider: 'claude', apiKey: 'test-key' }, board, { discoveries: [] }, new AbortController().signal, () => {})).type).toBe('discovery');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ content: [{ type: 'text', text: '{"type":"dsl_patch","summary":"改写","ops":[]}' }] }))));
    await expect(discover({ provider: 'claude', apiKey: 'test-key' }, board, { discoveries: [] }, new AbortController().signal, () => {})).rejects.toThrow();
  });
  it('bounds a hung analysis and explains the timeout without automatic retries', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn((_url, options) => new Promise<Response>((_resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })));
    vi.stubGlobal('fetch', fetcher);
    const pending = expect(discover({ provider: 'openai', apiKey: 'test-key' }, board, { discoveries: [] }, new AbortController().signal, () => {})).rejects.toThrow('用时较长');
    await vi.advanceTimersByTimeAsync(120_000);
    await pending;
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
