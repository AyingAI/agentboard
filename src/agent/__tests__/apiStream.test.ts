import { describe, expect, it } from 'vitest';
import { readApiStream } from '../apiStream';
import type { AgentProgressEvent } from '../../types/dsl';
function response(text: string, chunk = 7) {
  const bytes = new TextEncoder().encode(text);
  return new Response(new ReadableStream({ start(controller) { for (let i = 0; i < bytes.length; i += chunk) controller.enqueue(bytes.slice(i, i + chunk)); controller.close(); } }));
}
const frame = (data: unknown) => `data: ${JSON.stringify(data)}\r\n\r\n`;
describe('API streaming', () => {
  it('decodes UTF-8 split across chunks and extracts only visible OpenAI content', async () => {
    const events: AgentProgressEvent[] = [];
    const source = frame({ choices: [{ delta: { reasoning_content: 'SECRET' } }] }) + frame({ choices: [{ delta: { content: '{"title":"方案比较"}' } }] }) + 'data: [DONE]\n\n';
    expect(await readApiStream(response(source, 1), 'openai', new AbortController().signal, event => events.push(event))).toBe('{"title":"方案比较"}');
    expect(events[events.length - 1]?.previewTitles).toEqual(['方案比较']); expect(JSON.stringify(events)).not.toContain('SECRET');
  });
  it('filters Claude thinking and joins text blocks through message_stop', async () => {
    const source = frame({ type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'SECRET' } }) + frame({ type: 'content_block_delta', delta: { type: 'text_delta', text: '你好' } }) + frame({ type: 'message_stop' });
    expect(await readApiStream(response(source), 'claude', new AbortController().signal)).toBe('你好');
  });
  it('rejects an interrupted stream even when it happens to end with valid JSON', async () => {
    await expect(readApiStream(response(frame({ choices: [{ delta: { content: '{}' } }] })), 'openai', new AbortController().signal)).rejects.toThrow('中断');
  });
  it('surfaces streaming provider errors and exhausted budgets', async () => {
    await expect(readApiStream(response(frame({ error: { message: '服务忙' } })), 'openai', new AbortController().signal)).rejects.toThrow('服务忙');
    await expect(readApiStream(response(frame({ choices: [{ delta: { content: '{}' }, finish_reason: 'length' }] })), 'openai', new AbortController().signal)).rejects.toThrow('输出预算');
  });
  it('cancels a reader waiting for the next byte', async () => {
    let cancelled = false;
    const controller = new AbortController();
    const pending = readApiStream(new Response(new ReadableStream({ cancel() { cancelled = true; } })), 'openai', controller.signal);
    controller.abort(); await expect(pending).rejects.toMatchObject({ name: 'AbortError' }); expect(cancelled).toBe(true);
  });
});
