import { describe, expect, it } from 'vitest';
import type { BoardDSL } from '../../types/dsl';
import { buildSystemPrompt, buildUserMessage } from '../prompts';

function makeBoard(nodeCount: number): BoardDSL {
  const nodes = Array.from({ length: nodeCount }, (_, i) => ({
    id: `n${i}`,
    type: 'card' as const,
    x: 100 + i * 300,
    y: 100,
    width: 240,
    height: 120,
    title: `Node ${i}`,
    body: `Body text for node ${i}. `.repeat(10),
  }));
  return {
    version: '0.1',
    board: { id: 'b1', title: 'Test', viewport: { x: 0, y: 0, zoom: 1 } },
    nodes,
    edges: [],
    groups: [],
    metadata: {},
  };
}

describe('buildSystemPrompt', () => {
  it('should return a non-empty string', () => {
    const prompt = buildSystemPrompt();
    expect(prompt.length).toBeGreaterThan(500);
  });

  it('should include DSL schema keywords', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toMatch(/BoardNode/);
    expect(prompt).toMatch(/BoardEdge/);
    expect(prompt).toMatch(/BoardGroup/);
    expect(prompt).toMatch(/dsl_patch/);
  });

  it('should include all 6 patch operation types', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toMatch(/add_node/);
    expect(prompt).toMatch(/update_node/);
    expect(prompt).toMatch(/delete_node/);
    expect(prompt).toMatch(/add_edge/);
    expect(prompt).toMatch(/delete_edge/);
    expect(prompt).toMatch(/"layout"/);
  });
});

describe('buildUserMessage', () => {
  it('should include the board JSON and user message', () => {
    const board = makeBoard(2);
    const msg = buildUserMessage(board, 'add a risk note');
    expect(msg).toContain('Current board DSL');
    expect(msg).toContain('"n0"');
    expect(msg).toContain('"n1"');
    expect(msg).toContain('add a risk note');
  });

  it('should not modify the original board', () => {
    const board = makeBoard(1);
    const originalBody = board.nodes[0].body;
    buildUserMessage(board, 'test');
    expect(board.nodes[0].body).toBe(originalBody);
  });
});
