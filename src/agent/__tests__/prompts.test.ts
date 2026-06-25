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
    edges: nodeCount >= 2
      ? [{ id: 'e0', from: 'n0', to: 'n1', label: 'feeds', type: 'arrow' as const }]
      : [],
    groups: nodeCount >= 2
      ? [{ id: 'g0', title: 'Group 0', nodeIds: ['n0', 'n1'] }]
      : [],
    metadata: { revision: 3 },
  };
}

function extractJsonBlock(message: string): unknown {
  const match = message.match(/```json\n([\s\S]*?)\n```/);
  if (!match) throw new Error(`No JSON block found in message:\n${message}`);
  return JSON.parse(match[1]);
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
    expect(prompt).toMatch(/interaction_request/);
  });

  it('should include all patch operation types', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toMatch(/add_node/);
    expect(prompt).toMatch(/update_node/);
    expect(prompt).toMatch(/delete_node/);
    expect(prompt).toMatch(/add_edge/);
    expect(prompt).toMatch(/delete_edge/);
    expect(prompt).toMatch(/add_group/);
    expect(prompt).toMatch(/update_group/);
    expect(prompt).toMatch(/delete_group/);
    expect(prompt).toMatch(/"layout"/);
  });

  it('should instruct the agent to choose non-flow structures when appropriate', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toMatch(/Do not default to a flowchart/);
    expect(prompt).toMatch(/mindmap/);
    expect(prompt).toMatch(/matrix/);
    expect(prompt).toMatch(/cluster/);
    expect(prompt).toMatch(/timeline/);
    expect(prompt).toMatch(/swimlane/);
  });

  it('should instruct the agent to preserve existing layout by default', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toMatch(/Preserve the current layout by default/);
    expect(prompt).toMatch(/scope "all"/);
    expect(prompt).toMatch(/at least 56px visual spacing/);
    expect(prompt).toMatch(/Do not add a layout op just because multiple nodes were added/);
  });

  it('should instruct the agent to handle flow execution commands safely', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toMatch(/Flow Execution Commands/);
    expect(prompt).toMatch(/执行流程/);
    expect(prompt).toMatch(/current board as a possible executable workflow/);
    expect(prompt).toMatch(/return an interaction_request/);
    expect(prompt).toMatch(/preserve the original flow nodes/);
  });
});

describe('buildUserMessage', () => {
  it('should include the board JSON and user message', () => {
    const board = makeBoard(2);
    const msg = buildUserMessage(board, 'add a risk note', { runId: 'run_test' });
    expect(msg).toContain('Current board DSL');
    expect(msg).toContain('"n0"');
    expect(msg).toContain('"n1"');
    expect(msg).toContain('add a risk note');
    expect(msg).toContain('Run id: run_test');
  });

  it('should include run context when provided', () => {
    const board = makeBoard(1);
    const msg = buildUserMessage(board, 'continue', {
      runId: 'run_context',
      runContext: [{ type: 'user_decision', timestamp: 1, payload: { message: '授权搜索' } }],
    });
    expect(msg).toContain('Run context events');
    expect(msg).toContain('授权搜索');
  });

  it('should include recent human edit events when provided', () => {
    const board = makeBoard(2);
    const msg = buildUserMessage(board, 'continue from my edits', {
      runId: 'run_edits',
      recentEditEvents: [
        {
          id: 'edit_1',
          type: 'node_moved',
          timestamp: 123,
          nodeId: 'n0',
          summary: '移动节点 n0',
          details: { from: { x: 100, y: 100 }, to: { x: 180, y: 160 } },
        },
      ],
    });

    expect(msg).toContain('Context packet (delta)');
    expect(msg).not.toContain('Current board DSL');
    expect(msg).toContain('node_moved');
    expect(msg).toContain('移动节点 n0');

    const packet = extractJsonBlock(msg) as {
      boardId: string;
      revision: number;
      changedNodeIds: string[];
      changedNodes: { id: string; body: string }[];
      relatedEdges: { id: string }[];
      nearbyNodes: { id: string; body?: string }[];
      boardSummary: { nodeLabels: { id: string; body?: string }[] };
    };
    expect(packet.boardId).toBe('b1');
    expect(packet.revision).toBe(3);
    expect(packet.changedNodeIds).toEqual(['n0']);
    expect(packet.changedNodes).toHaveLength(1);
    expect(packet.changedNodes[0].body).toContain('Body text for node 0');
    expect(packet.relatedEdges.map((edge) => edge.id)).toEqual(['e0']);
    expect(packet.nearbyNodes).toEqual([{ id: 'n1', title: 'Node 1', type: 'card' }]);
    expect(packet.nearbyNodes[0]).not.toHaveProperty('body');
    expect(packet.boardSummary.nodeLabels[0]).not.toHaveProperty('body');
  });

  it('should include changed edge context for edge-only edits', () => {
    const board = makeBoard(2);
    const msg = buildUserMessage(board, '继续完善这条关系', {
      runId: 'run_edge',
      recentEditEvents: [
        {
          id: 'edit_edge',
          type: 'edge_updated',
          timestamp: 123,
          edgeId: 'e0',
          summary: '更新连线标签',
          details: { fromLabel: '', toLabel: 'feeds' },
        },
      ],
    });

    const packet = extractJsonBlock(msg) as {
      changedNodeIds: string[];
      changedEdgeIds: string[];
      changedEdges: { id: string }[];
      relatedEdges: { id: string }[];
      nearbyNodes: { id: string }[];
    };
    expect(packet.changedNodeIds).toEqual([]);
    expect(packet.changedEdgeIds).toEqual(['e0']);
    expect(packet.changedEdges.map((edge) => edge.id)).toEqual(['e0']);
    expect(packet.relatedEdges.map((edge) => edge.id)).toEqual(['e0']);
    expect(packet.nearbyNodes.map((node) => node.id)).toEqual(['n0', 'n1']);
  });

  it('should use full board context for global requests even with recent edits', () => {
    const board = makeBoard(2);
    const msg = buildUserMessage(board, '整理整个白板', {
      runId: 'run_global',
      recentEditEvents: [
        {
          id: 'edit_1',
          type: 'node_updated',
          timestamp: 123,
          nodeId: 'n0',
          summary: '更新节点标题',
          details: { field: 'title', from: 'Old', to: 'New' },
        },
      ],
    });

    expect(msg).toContain('Current board DSL');
    expect(msg).toContain('Recent human edit events');
    expect(msg).not.toContain('Context packet (delta)');
  });

  it('should not leak unchanged node bodies into the delta board summary', () => {
    const board = makeBoard(2);
    board.nodes[1] = {
      ...board.nodes[1],
      body: 'Sensitive unchanged body that should not be summarized',
    };

    const msg = buildUserMessage(board, '继续补充刚才改的节点', {
      runId: 'run_no_body_leak',
      recentEditEvents: [
        {
          id: 'edit_1',
          type: 'node_updated',
          timestamp: 123,
          nodeId: 'n0',
          summary: '更新节点正文',
          details: { field: 'body', from: 'Old', to: 'New' },
        },
      ],
    });

    const packet = extractJsonBlock(msg) as {
      boardSummary: { nodeLabels: { body?: string }[] };
      nearbyNodes: { body?: string }[];
    };
    expect(JSON.stringify(packet.boardSummary)).not.toContain('Sensitive unchanged body');
    expect(JSON.stringify(packet.nearbyNodes)).not.toContain('Sensitive unchanged body');
  });

  it('should not modify the original board', () => {
    const board = makeBoard(1);
    const originalBody = board.nodes[0].body;
    buildUserMessage(board, 'test');
    expect(board.nodes[0].body).toBe(originalBody);
  });
});
