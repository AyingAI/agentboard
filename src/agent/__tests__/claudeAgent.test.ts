import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardDSL } from '../../types/dsl';
import { ClaudeAgentAdapter } from '../claudeAgent';
import type { AgentError } from '../types';

function testBoard(): BoardDSL {
  return {
    version: '0.1',
    board: { id: 'b1', title: 'Test', viewport: { x: 0, y: 0, zoom: 1 } },
    nodes: [
      { id: 'n1', type: 'card', x: 100, y: 100, width: 200, height: 100, title: 'Node 1', body: '' },
    ],
    edges: [],
    groups: [],
    metadata: {},
  };
}

function makePatchJson(summary: string, ops: unknown[] = []) {
  return JSON.stringify({ type: 'dsl_patch', summary, ops, questions: [] });
}

function mockAnthropicResponse(text: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ content: [{ type: 'text', text }] }),
  };
}

describe('ClaudeAgentAdapter', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should return DSLPatch on successful response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockAnthropicResponse(makePatchJson('Added a node', [{ op: 'add_node', node: { id: 'n2', type: 'card', x: 200, y: 300, width: 200, height: 100, title: 'New', body: '' } }])),
    ) as unknown as typeof fetch;

    const adapter = new ClaudeAgentAdapter({ provider: 'claude', apiKey: 'test-key', model: 'claude-opus-4-20250514' });
    const patch = await adapter.generatePatch({ boardState: testBoard(), userMessage: 'add a node' });

    expect(patch.type).toBe('dsl_patch');
    expect(patch.summary).toBe('Added a node');
    expect(patch.ops).toHaveLength(1);
    expect(patch.ops[0]).toMatchObject({ op: 'add_node' });
  });

  it('should extract JSON from markdown code fences', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockAnthropicResponse('```json\n' + makePatchJson('From fence') + '\n```'),
    ) as unknown as typeof fetch;

    const adapter = new ClaudeAgentAdapter({ provider: 'claude', apiKey: 'test-key' });
    const patch = await adapter.generatePatch({ boardState: testBoard(), userMessage: 'test' });

    expect(patch.summary).toBe('From fence');
  });

  it('should throw AUTH_ERROR when API key is missing', async () => {
    const adapter = new ClaudeAgentAdapter({ provider: 'claude' });
    try {
      await adapter.generatePatch({ boardState: testBoard(), userMessage: 'test' });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AgentError).code).toBe('AUTH_ERROR');
    }
  });

  it('should throw AUTH_ERROR on 401 response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    }) as unknown as typeof fetch;

    const adapter = new ClaudeAgentAdapter({ provider: 'claude', apiKey: 'bad-key' });
    try {
      await adapter.generatePatch({ boardState: testBoard(), userMessage: 'test' });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AgentError).code).toBe('AUTH_ERROR');
    }
  });

  it('should throw RATE_LIMITED on 429 response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
    }) as unknown as typeof fetch;

    const adapter = new ClaudeAgentAdapter({ provider: 'claude', apiKey: 'key' });
    try {
      await adapter.generatePatch({ boardState: testBoard(), userMessage: 'test' });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AgentError).code).toBe('RATE_LIMITED');
    }
  });

  it('should throw PARSE_ERROR on malformed JSON response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockAnthropicResponse('This is not JSON at all, just some text.'),
    ) as unknown as typeof fetch;

    const adapter = new ClaudeAgentAdapter({ provider: 'claude', apiKey: 'key' });
    try {
      await adapter.generatePatch({ boardState: testBoard(), userMessage: 'test' });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AgentError).code).toBe('PARSE_ERROR');
    }
  });

  it('should throw PARSE_ERROR when response is missing required fields', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockAnthropicResponse(JSON.stringify({ type: 'wrong_type', ops: [] })),
    ) as unknown as typeof fetch;

    const adapter = new ClaudeAgentAdapter({ provider: 'claude', apiKey: 'key' });
    try {
      await adapter.generatePatch({ boardState: testBoard(), userMessage: 'test' });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AgentError).code).toBe('PARSE_ERROR');
    }
  });

  it('should throw NETWORK_ERROR when fetch fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network failure')) as unknown as typeof fetch;

    const adapter = new ClaudeAgentAdapter({ provider: 'claude', apiKey: 'key' });
    try {
      await adapter.generatePatch({ boardState: testBoard(), userMessage: 'test' });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AgentError).code).toBe('NETWORK_ERROR');
    }
  });
});
