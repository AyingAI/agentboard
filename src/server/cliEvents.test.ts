import { describe, expect, it } from 'vitest';
import { readCliEvent, type CliOutputState } from './cliEvents';
const state = (): CliOutputState => ({ partialText: '', assistantText: '', resultText: '', outputChars: 0, lastOutputSentAt: 0, seenTools: new Set() });
describe('CLI event sanitization', () => {
  it('Pi collects text deltas and authoritative final text while omitting hidden thinking and tool payloads', () => {
    const value = state();
    const read = (event: unknown) => readCliEvent('pi', JSON.stringify(event), value);
    read({ type: 'message_start', message: { role: 'assistant' } });
    expect(read({ type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', delta: 'SECRET' } })).toEqual([]);
    read({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: '{"summary":' } });
    read({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: '"hello"}' } });
    expect(value.partialText).toBe('{"summary":"hello"}'); expect(value.outputChars).toBe(value.partialText.length);
    const tool = { type: 'tool_execution_start', toolName: 'read', toolCallId: 't1', args: { secret: 'SECRET' } };
    expect(read(tool)).toEqual([{ type: 'tool', message: '正在阅读材料', toolName: 'read' }]);
    expect(read(tool)).toEqual([]);
    read({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'thinking', thinking: 'SECRET' }, { type: 'text', text: 'final' }] } });
    expect(value.assistantText).toBe('final'); expect(JSON.stringify(value)).not.toContain('SECRET');
  });
  it('new Pi assistant messages clear stale intermediate output', () => {
    const value = { ...state(), assistantText: 'old', resultText: 'old' };
    readCliEvent('pi', '{"type":"message_start","message":{"role":"assistant"}}', value);
    expect(value.assistantText).toBe(''); expect(value.resultText).toBe('');
  });
  it('Claude emits tool metadata once and keeps thinking private', () => {
    const value = state();
    readCliEvent('claude', JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'SECRET' } } }), value);
    const message = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't', name: 'Bash', input: 'SECRET' }] } });
    expect(readCliEvent('claude', message, value)[0].type).toBe('tool');
    expect(readCliEvent('claude', message, value)).toEqual([]); expect(JSON.stringify(value)).not.toContain('SECRET');
  });
  it('Codex JSON events extract the final agent message and activity, ignoring reasoning', () => {
    const value = state();
    expect(readCliEvent('codex', '{"type":"item.completed","item":{"type":"reasoning","text":"SECRET"}}', value)).toEqual([]);
    expect(readCliEvent('codex', '{"type":"item.started","item":{"type":"command_execution","id":"x"}}', value)[0].toolName).toBe('bash');
    readCliEvent('codex', '{"type":"item.completed","item":{"type":"agent_message","text":"result"}}', value);
    expect(value.resultText).toBe('result'); expect(value.outputChars).toBe(6);
  });
  it('ignores invalid and non-event JSON', () => {
    for (const line of ['null', 'hello', '{}', '[]']) expect(readCliEvent('pi', line, state())).toEqual([]);
  });
});
