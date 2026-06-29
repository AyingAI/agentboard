import { describe, expect, it } from 'vitest';
import type { BoardDSL, BoardNode, DSLPatch } from '../../types/dsl';
import { applyPatch } from '../patch';

// ── Test helpers ──

function minimalBoard(overrides?: Partial<BoardDSL>): BoardDSL {
  return {
    version: '0.1',
    board: { id: 'board_test', title: 'Test Board', viewport: { x: 0, y: 0, zoom: 1 } },
    nodes: [
      { id: 'n1', type: 'card', x: 100, y: 100, width: 200, height: 100, title: 'Node 1', body: '' },
      { id: 'n2', type: 'card', x: 400, y: 100, width: 200, height: 100, title: 'Node 2', body: '' },
    ],
    edges: [{ id: 'e1', from: 'n1', to: 'n2', type: 'arrow' }],
    groups: [],
    metadata: {},
    ...overrides,
  };
}

function newNode(id: string, overrides?: Partial<BoardNode>): BoardNode {
  return {
    id,
    type: 'card',
    x: 200,
    y: 300,
    width: 200,
    height: 100,
    title: 'New Node',
    body: '',
    ...overrides,
  };
}

function hasVisualGap(a: BoardNode, b: BoardNode, gap: number) {
  return (
    a.x + a.width + gap <= b.x ||
    b.x + b.width + gap <= a.x ||
    a.y + a.height + gap <= b.y ||
    b.y + b.height + gap <= a.y
  );
}

// ── Success cases ──

describe('applyPatch — success cases', () => {
  it('add_node: should add a valid node', () => {
    const board = minimalBoard();
    const patch: DSLPatch = {
      type: 'dsl_patch',
      summary: 'add a node',
      ops: [{ op: 'add_node', node: newNode('n3') }],
    };

    const { board: resultBoard, result } = applyPatch(board, patch);

    expect(result.applied).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.appliedOps).toBe(1);
    expect(resultBoard.nodes).toHaveLength(3);
    expect(resultBoard.nodes.find((n) => n.id === 'n3')).toBeDefined();
  });

  it('update_node: should update title and body', () => {
    const board = minimalBoard();
    const patch: DSLPatch = {
      type: 'dsl_patch',
      summary: 'update node title',
      ops: [{ op: 'update_node', nodeId: 'n1', changes: { title: 'Updated Title', body: 'New body' } }],
    };

    const { board: resultBoard, result } = applyPatch(board, patch);

    expect(result.applied).toBe(true);
    expect(result.appliedOps).toBe(1);
    const updated = resultBoard.nodes.find((n) => n.id === 'n1')!;
    expect(updated.title).toBe('Updated Title');
    expect(updated.body).toBe('New body');
    // unchanged fields preserved
    expect(updated.x).toBe(100);
    expect(updated.type).toBe('card');
  });

  it('update_node: should support partial changes (one field only)', () => {
    const board = minimalBoard();
    const patch: DSLPatch = {
      type: 'dsl_patch',
      summary: 'update only title',
      ops: [{ op: 'update_node', nodeId: 'n2', changes: { title: 'Only Title' } }],
    };

    const { board: resultBoard, result } = applyPatch(board, patch);

    expect(result.applied).toBe(true);
    const updated = resultBoard.nodes.find((n) => n.id === 'n2')!;
    expect(updated.title).toBe('Only Title');
    expect(updated.body).toBe('');
  });

  it('delete_node: should remove node and its connected edges', () => {
    const board = minimalBoard();
    const patch: DSLPatch = {
      type: 'dsl_patch',
      summary: 'delete n1',
      ops: [{ op: 'delete_node', nodeId: 'n1' }],
    };

    const { board: resultBoard, result } = applyPatch(board, patch);

    expect(result.applied).toBe(true);
    expect(result.appliedOps).toBe(1);
    expect(resultBoard.nodes).toHaveLength(1);
    expect(resultBoard.nodes.find((n) => n.id === 'n1')).toBeUndefined();
    // edge e1 (n1→n2) should also be removed
    expect(resultBoard.edges.find((e) => e.id === 'e1')).toBeUndefined();
  });

  it('add_edge: should add an edge between existing nodes', () => {
    const board = minimalBoard();
    const edge = { id: 'e2', from: 'n2', to: 'n1', type: 'arrow' as const };
    const patch: DSLPatch = {
      type: 'dsl_patch',
      summary: 'add reverse edge',
      ops: [{ op: 'add_edge', edge }],
    };

    const { board: resultBoard, result } = applyPatch(board, patch);

    expect(result.applied).toBe(true);
    expect(result.appliedOps).toBe(1);
    expect(resultBoard.edges).toHaveLength(2);
    expect(resultBoard.edges.find((e) => e.id === 'e2')).toBeDefined();
  });

  it('delete_edge: should remove an existing edge', () => {
    const board = minimalBoard();
    const patch: DSLPatch = {
      type: 'dsl_patch',
      summary: 'delete edge e1',
      ops: [{ op: 'delete_edge', edgeId: 'e1' }],
    };

    const { board: resultBoard, result } = applyPatch(board, patch);

    expect(result.applied).toBe(true);
    expect(result.appliedOps).toBe(1);
    expect(resultBoard.edges).toHaveLength(0);
  });

  it('layout: should rearrange nodes (horizontal)', () => {
    const board = minimalBoard();
    const patch: DSLPatch = {
      type: 'dsl_patch',
      summary: 'horizontal layout',
      ops: [{ op: 'layout', algorithm: 'horizontal' }],
    };

    const { board: resultBoard, result } = applyPatch(board, patch);

    expect(result.applied).toBe(true);
    expect(result.appliedOps).toBe(1);
    // All nodes should have same y after horizontal layout
    const yValues = resultBoard.nodes.map((n) => n.y);
    const uniqueY = new Set(yValues);
    expect(uniqueY.size).toBe(1);
    // x values should be different (nodes are spread horizontally)
    const xValues = resultBoard.nodes.map((n) => n.x);
    const uniqueX = new Set(xValues);
    expect(uniqueX.size).toBe(2);
  });

  it('layout: should rearrange nodes (vertical)', () => {
    const board = minimalBoard();
    const patch: DSLPatch = {
      type: 'dsl_patch',
      summary: 'vertical layout',
      ops: [{ op: 'layout', algorithm: 'vertical' }],
    };

    const { board: resultBoard, result } = applyPatch(board, patch);

    expect(result.applied).toBe(true);
    // All nodes should have same x after vertical layout
    const xValues = resultBoard.nodes.map((n) => n.x);
    const uniqueX = new Set(xValues);
    expect(uniqueX.size).toBe(1);
  });

  it('layout: should rearrange nodes (dagre-like grid)', () => {
    const board = minimalBoard();
    const patch: DSLPatch = {
      type: 'dsl_patch',
      summary: 'dagre layout',
      ops: [{ op: 'layout', algorithm: 'dagre' }],
    };

    const { board: resultBoard, result } = applyPatch(board, patch);

    expect(result.applied).toBe(true);
    expect(result.appliedOps).toBe(1);
    // Nodes spread across columns
    const xValues = resultBoard.nodes.map((n) => n.x);
    expect(new Set(xValues).size).toBeGreaterThanOrEqual(1);
  });

  it('layout: dagre should respect directed edge layers', () => {
    const board = minimalBoard({
      nodes: [
        newNode('n1'),
        newNode('n2'),
        newNode('n3'),
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2', type: 'arrow' },
        { id: 'e2', from: 'n2', to: 'n3', type: 'arrow' },
      ],
    });

    const { board: resultBoard, result } = applyPatch(board, {
      type: 'dsl_patch',
      summary: 'flow layout',
      ops: [{ op: 'layout', algorithm: 'dagre', scope: 'all' }],
    });
    const n1 = resultBoard.nodes.find((node) => node.id === 'n1')!;
    const n2 = resultBoard.nodes.find((node) => node.id === 'n2')!;
    const n3 = resultBoard.nodes.find((node) => node.id === 'n3')!;

    expect(result.applied).toBe(true);
    expect(n1.x).toBeLessThan(n2.x);
    expect(n2.x).toBeLessThan(n3.x);
  });

  it('layout: should support non-flow structure layouts', () => {
    const board = minimalBoard({
      nodes: [
        newNode('n1'),
        newNode('n2'),
        newNode('n3'),
        newNode('n4'),
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2', type: 'line' },
        { id: 'e2', from: 'n1', to: 'n3', type: 'line' },
      ],
      groups: [],
    });

    for (const algorithm of ['mindmap', 'matrix', 'cluster', 'timeline', 'swimlane'] as const) {
      const { board: resultBoard, result } = applyPatch(board, {
        type: 'dsl_patch',
        summary: `${algorithm} layout`,
        ops: [{ op: 'layout', algorithm }],
      });

      expect(result.applied).toBe(true);
      expect(resultBoard.nodes).toHaveLength(4);
      expect(new Set(resultBoard.nodes.map((node) => `${node.x},${node.y}`)).size).toBe(4);
    }
  });

  it('should separate overlapping generated nodes after add_node', () => {
    const board = minimalBoard({ nodes: [], edges: [] });
    const patch: DSLPatch = {
      type: 'dsl_patch',
      summary: 'add overlapping nodes',
      ops: [
        { op: 'add_node', node: newNode('n1', { x: 120, y: 120, width: 240, height: 120 }) },
        { op: 'add_node', node: newNode('n2', { x: 120, y: 120, width: 240, height: 120 }) },
      ],
    };

    const { board: resultBoard, result } = applyPatch(board, patch);
    const [a, b] = resultBoard.nodes;
    expect(result.applied).toBe(true);
    expect(hasVisualGap(a, b, 56)).toBe(true);
  });

  it('should add visual spacing even when generated nodes are near but not overlapping', () => {
    const board = minimalBoard({
      nodes: [
        newNode('n1', { x: 100, y: 100, width: 200, height: 100 }),
      ],
      edges: [],
    });
    const patch: DSLPatch = {
      type: 'dsl_patch',
      summary: 'add nearby node',
      ops: [
        { op: 'add_node', node: newNode('n2', { x: 100, y: 218, width: 200, height: 100 }) },
      ],
    };

    const { board: resultBoard, result } = applyPatch(board, patch);
    const n1 = resultBoard.nodes.find((node) => node.id === 'n1')!;
    const n2 = resultBoard.nodes.find((node) => node.id === 'n2')!;

    expect(result.applied).toBe(true);
    expect(n1.x).toBe(100);
    expect(n1.y).toBe(100);
    expect(hasVisualGap(n1, n2, 56)).toBe(true);
  });

  it('should preserve existing node positions when resolving new node overlaps', () => {
    const board = minimalBoard();
    const patch: DSLPatch = {
      type: 'dsl_patch',
      summary: 'add overlapping node',
      ops: [
        { op: 'add_node', node: newNode('n3', { x: 100, y: 100, width: 200, height: 100 }) },
      ],
    };

    const { board: resultBoard, result } = applyPatch(board, patch);
    const n1 = resultBoard.nodes.find((node) => node.id === 'n1')!;
    const n2 = resultBoard.nodes.find((node) => node.id === 'n2')!;
    const n3 = resultBoard.nodes.find((node) => node.id === 'n3')!;

    expect(result.applied).toBe(true);
    expect(n1.x).toBe(100);
    expect(n1.y).toBe(100);
    expect(n2.x).toBe(400);
    expect(n2.y).toBe(100);
    expect(n3.y).toBeGreaterThan(100);
    expect(hasVisualGap(n1, n3, 56)).toBe(true);
  });

  it('layout in a mixed patch should preserve the existing board unless scope is all', () => {
    const board = minimalBoard();
    const patch: DSLPatch = {
      type: 'dsl_patch',
      summary: 'add node with default scoped layout',
      ops: [
        { op: 'add_node', node: newNode('n3', { x: 100, y: 100, width: 200, height: 100 }) },
        { op: 'layout', algorithm: 'horizontal' },
      ],
    };

    const { board: resultBoard, result } = applyPatch(board, patch);
    const n1 = resultBoard.nodes.find((node) => node.id === 'n1')!;
    const n2 = resultBoard.nodes.find((node) => node.id === 'n2')!;

    expect(result.applied).toBe(true);
    expect(n1.x).toBe(100);
    expect(n1.y).toBe(100);
    expect(n2.x).toBe(400);
    expect(n2.y).toBe(100);
  });

  it('layout scope all should allow explicit full-board relayout in a mixed patch', () => {
    const board = minimalBoard();
    const patch: DSLPatch = {
      type: 'dsl_patch',
      summary: 'add node and relayout all',
      ops: [
        { op: 'add_node', node: newNode('n3', { x: 100, y: 100, width: 200, height: 100 }) },
        { op: 'layout', algorithm: 'horizontal', scope: 'all' },
      ],
    };

    const { board: resultBoard, result } = applyPatch(board, patch);
    const n1 = resultBoard.nodes.find((node) => node.id === 'n1')!;

    expect(result.applied).toBe(true);
    expect(n1.x).toBe(120);
    expect(n1.y).toBe(120);
  });

  it('layout: should default to horizontal when no algorithm specified', () => {
    const board = minimalBoard();
    const patch: DSLPatch = {
      type: 'dsl_patch',
      summary: 'default layout',
      ops: [{ op: 'layout' }],
    };

    const { board: resultBoard, result } = applyPatch(board, patch);

    expect(result.applied).toBe(true);
    const yValues = resultBoard.nodes.map((n) => n.y);
    expect(new Set(yValues).size).toBe(1); // horizontal = same y
  });

  it('should apply multiple valid ops in order', () => {
    const board = minimalBoard();
    const patch: DSLPatch = {
      type: 'dsl_patch',
      summary: 'batch ops',
      ops: [
        { op: 'add_node', node: newNode('n3') },
        { op: 'add_edge', edge: { id: 'e2', from: 'n3', to: 'n1', type: 'arrow' } },
        { op: 'update_node', nodeId: 'n2', changes: { title: 'Updated' } },
      ],
    };

    const { board: resultBoard, result } = applyPatch(board, patch);

    expect(result.applied).toBe(true);
    expect(result.appliedOps).toBe(3);
    expect(resultBoard.nodes).toHaveLength(3);
    expect(resultBoard.edges).toHaveLength(2);
    expect(resultBoard.nodes.find((n) => n.id === 'n2')!.title).toBe('Updated');
  });
});

// ── Failure protection cases ──

describe('applyPatch — failure protection', () => {
  it('should reject duplicate node id', () => {
    const board = minimalBoard();
    const patch: DSLPatch = {
      type: 'dsl_patch',
      summary: 'add duplicate',
      ops: [{ op: 'add_node', node: newNode('n1') }], // n1 already exists
    };

    const { board: resultBoard, result } = applyPatch(board, patch);

    expect(result.applied).toBe(false);
    expect(result.appliedOps).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('PATCH_DUPLICATE_NODE');
    // Board should be unchanged (same reference = atomic)
    expect(resultBoard).toBe(board);
    expect(resultBoard.nodes).toHaveLength(2);
  });

  it('should reject update of non-existent node', () => {
    const board = minimalBoard();
    const patch: DSLPatch = {
      type: 'dsl_patch',
      summary: 'update missing',
      ops: [{ op: 'update_node', nodeId: 'n_non_existent', changes: { title: 'Ghost' } }],
    };

    const { board: resultBoard, result } = applyPatch(board, patch);

    expect(result.applied).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('PATCH_NODE_NOT_FOUND');
    expect(resultBoard).toBe(board);
  });

  it('should reject edge referencing non-existent from node', () => {
    const board = minimalBoard();
    const patch: DSLPatch = {
      type: 'dsl_patch',
      summary: 'bad edge',
      ops: [{ op: 'add_edge', edge: { id: 'e_bad', from: 'n_ghost', to: 'n1', type: 'arrow' } }],
    };

    const { board: resultBoard, result } = applyPatch(board, patch);

    expect(result.applied).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('EDGE_INVALID_FROM');
    expect(resultBoard).toBe(board);
  });

  it('should reject edge referencing non-existent to node', () => {
    const board = minimalBoard();
    const patch: DSLPatch = {
      type: 'dsl_patch',
      summary: 'bad edge',
      ops: [{ op: 'add_edge', edge: { id: 'e_bad', from: 'n1', to: 'n_ghost', type: 'arrow' } }],
    };

    const { board: resultBoard, result } = applyPatch(board, patch);

    expect(result.applied).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('EDGE_INVALID_TO');
    expect(resultBoard).toBe(board);
  });

  it('should reject duplicate edge id', () => {
    const board = minimalBoard();
    const patch: DSLPatch = {
      type: 'dsl_patch',
      summary: 'duplicate edge',
      ops: [{ op: 'add_edge', edge: { id: 'e1', from: 'n1', to: 'n2', type: 'arrow' } }],
    };

    const { board: resultBoard, result } = applyPatch(board, patch);

    expect(result.applied).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('PATCH_DUPLICATE_EDGE');
    expect(resultBoard).toBe(board);
  });

  it('should reject delete of non-existent edge', () => {
    const board = minimalBoard();
    const patch: DSLPatch = {
      type: 'dsl_patch',
      summary: 'delete missing edge',
      ops: [{ op: 'delete_edge', edgeId: 'e_ghost' }],
    };

    const { board: resultBoard, result } = applyPatch(board, patch);

    expect(result.applied).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('PATCH_EDGE_NOT_FOUND');
    expect(resultBoard).toBe(board);
  });

  it('should reject delete of non-existent node', () => {
    const board = minimalBoard();
    const patch: DSLPatch = {
      type: 'dsl_patch',
      summary: 'delete missing node',
      ops: [{ op: 'delete_node', nodeId: 'n_ghost' }],
    };

    const { board: resultBoard, result } = applyPatch(board, patch);

    expect(result.applied).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('PATCH_NODE_NOT_FOUND');
    expect(resultBoard).toBe(board);
  });

  it('should reject node with invalid type', () => {
    const board = minimalBoard();
    const patch: DSLPatch = {
      type: 'dsl_patch',
      summary: 'bad node type',
      ops: [{ op: 'add_node', node: newNode('n3', { type: 'invalid_type' as BoardNode['type'] }) }],
    };

    const { board: resultBoard, result } = applyPatch(board, patch);

    expect(result.applied).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('NODE_INVALID_TYPE');
    expect(resultBoard).toBe(board);
  });
});

// ── Group operation tests ──

describe('applyPatch — group operations', () => {
  it('add_group: should add a group with valid node refs', () => {
    const board = minimalBoard();
    const patch: DSLPatch = {
      type: 'dsl_patch',
      summary: 'add group',
      ops: [{ op: 'add_group', group: { id: 'g1', title: 'Group A', nodeIds: ['n1', 'n2'] } }],
    };

    const { board: resultBoard, result } = applyPatch(board, patch);

    expect(result.applied).toBe(true);
    expect(result.appliedOps).toBe(1);
    expect(resultBoard.groups).toHaveLength(1);
    expect(resultBoard.groups[0].id).toBe('g1');
    expect(resultBoard.groups[0].nodeIds).toEqual(['n1', 'n2']);
  });

  it('update_group: should update title, nodeIds, and style', () => {
    const board = minimalBoard({
      groups: [{ id: 'g1', title: 'Old Title', nodeIds: ['n1'] }],
    });
    const patch: DSLPatch = {
      type: 'dsl_patch',
      summary: 'update group',
      ops: [
        {
          op: 'update_group',
          groupId: 'g1',
          changes: { title: 'New Title', nodeIds: ['n1', 'n2'], style: { fill: '#eee' } },
        },
      ],
    };

    const { board: resultBoard, result } = applyPatch(board, patch);

    expect(result.applied).toBe(true);
    expect(result.appliedOps).toBe(1);
    const updated = resultBoard.groups[0];
    expect(updated.title).toBe('New Title');
    expect(updated.nodeIds).toEqual(['n1', 'n2']);
    expect(updated.style).toEqual({ fill: '#eee' });
  });

  it('delete_group: should remove group but keep nodes', () => {
    const board = minimalBoard({
      groups: [{ id: 'g1', title: 'Group A', nodeIds: ['n1', 'n2'] }],
    });
    const patch: DSLPatch = {
      type: 'dsl_patch',
      summary: 'delete group',
      ops: [{ op: 'delete_group', groupId: 'g1' }],
    };

    const { board: resultBoard, result } = applyPatch(board, patch);

    expect(result.applied).toBe(true);
    expect(result.appliedOps).toBe(1);
    expect(resultBoard.groups).toHaveLength(0);
    // Nodes are untouched
    expect(resultBoard.nodes).toHaveLength(2);
    expect(resultBoard.nodes.find((n) => n.id === 'n1')).toBeDefined();
    expect(resultBoard.nodes.find((n) => n.id === 'n2')).toBeDefined();
  });

  it('add_group: should reject duplicate group id', () => {
    const board = minimalBoard({
      groups: [{ id: 'g1', title: 'Existing', nodeIds: ['n1'] }],
    });
    const patch: DSLPatch = {
      type: 'dsl_patch',
      summary: 'add duplicate group',
      ops: [{ op: 'add_group', group: { id: 'g1', title: 'Dup', nodeIds: ['n2'] } }],
    };

    const { board: resultBoard, result } = applyPatch(board, patch);

    expect(result.applied).toBe(false);
    expect(result.appliedOps).toBe(0);
    expect(result.errors.some((e) => e.code === 'PATCH_DUPLICATE_GROUP')).toBe(true);
    expect(resultBoard).toBe(board);
  });

  it('add_group: should reject invalid node ref', () => {
    const board = minimalBoard();
    const patch: DSLPatch = {
      type: 'dsl_patch',
      summary: 'add group with bad ref',
      ops: [{ op: 'add_group', group: { id: 'g1', title: 'Bad', nodeIds: ['n_ghost'] } }],
    };

    const { board: resultBoard, result } = applyPatch(board, patch);

    expect(result.applied).toBe(false);
    expect(result.appliedOps).toBe(0);
    expect(result.errors.some((e) => e.code === 'GROUP_INVALID_REF')).toBe(true);
    expect(resultBoard).toBe(board);
  });

  it('update_group: should reject missing group', () => {
    const board = minimalBoard();
    const patch: DSLPatch = {
      type: 'dsl_patch',
      summary: 'update missing group',
      ops: [{ op: 'update_group', groupId: 'g_ghost', changes: { title: 'X' } }],
    };

    const { board: resultBoard, result } = applyPatch(board, patch);

    expect(result.applied).toBe(false);
    expect(result.errors.some((e) => e.code === 'PATCH_GROUP_NOT_FOUND')).toBe(true);
    expect(resultBoard).toBe(board);
  });

  it('delete_group: should reject missing group', () => {
    const board = minimalBoard();
    const patch: DSLPatch = {
      type: 'dsl_patch',
      summary: 'delete missing group',
      ops: [{ op: 'delete_group', groupId: 'g_ghost' }],
    };

    const { board: resultBoard, result } = applyPatch(board, patch);

    expect(result.applied).toBe(false);
    expect(result.errors.some((e) => e.code === 'PATCH_GROUP_NOT_FOUND')).toBe(true);
    expect(resultBoard).toBe(board);
  });

  it('atomicity: valid add_group followed by invalid op rolls back entirely', () => {
    const board = minimalBoard();
    const patch: DSLPatch = {
      type: 'dsl_patch',
      summary: 'add group then fail',
      ops: [
        { op: 'add_group', group: { id: 'g1', title: 'Group A', nodeIds: ['n1', 'n2'] } }, // valid
        { op: 'delete_group', groupId: 'g_ghost' }, // invalid — group doesn't exist
      ],
    };

    const { board: resultBoard, result } = applyPatch(board, patch);

    expect(result.applied).toBe(false);
    expect(result.appliedOps).toBe(0);
    // Original board reference returned, no group added
    expect(resultBoard).toBe(board);
    expect(resultBoard.groups).toHaveLength(0);
  });
});

// ── Atomicity tests ──

describe('applyPatch — atomicity', () => {
  it('should return original board when a middle op fails (no partial application)', () => {
    const board = minimalBoard();
    const patch: DSLPatch = {
      type: 'dsl_patch',
      summary: 'batch with error in middle',
      ops: [
        { op: 'add_node', node: newNode('n3') },           // should succeed
        { op: 'add_node', node: newNode('n1') },           // DUPLICATE — fails
        { op: 'update_node', nodeId: 'n2', changes: { title: 'Changed' } }, // would succeed
      ],
    };

    const { board: resultBoard, result } = applyPatch(board, patch);

    expect(result.applied).toBe(false);
    expect(result.appliedOps).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('PATCH_DUPLICATE_NODE');
    // Atomic: returned board must be the original reference, not the partially modified clone
    expect(resultBoard).toBe(board);
    expect(resultBoard.nodes).toHaveLength(2);
    expect(resultBoard.nodes.find((n) => n.id === 'n3')).toBeUndefined();
    expect(resultBoard.nodes.find((n) => n.id === 'n2')!.title).toBe('Node 2');
  });

  it('should return original board when first op succeeds but last op fails', () => {
    const board = minimalBoard();
    const patch: DSLPatch = {
      type: 'dsl_patch',
      summary: 'last op fails',
      ops: [
        { op: 'add_node', node: newNode('n3') },
        { op: 'update_node', nodeId: 'n2', changes: { title: 'Updated' } },
        { op: 'delete_node', nodeId: 'n_ghost' }, // fails — node doesn't exist
      ],
    };

    const { board: resultBoard, result } = applyPatch(board, patch);

    expect(result.applied).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('PATCH_NODE_NOT_FOUND');
    // Atomic: no partial effects
    expect(resultBoard).toBe(board);
    expect(resultBoard.nodes).toHaveLength(2);
    expect(resultBoard.nodes.find((n) => n.id === 'n3')).toBeUndefined();
    expect(resultBoard.nodes.find((n) => n.id === 'n2')!.title).toBe('Node 2');
  });

  it('should remove deleted node from groups', () => {
    // Verify delete_node cleans up group.nodeIds
    const b = minimalBoard({
      nodes: [
        { id: 'n1', type: 'card', x: 100, y: 100, width: 200, height: 100, title: 'Node 1', body: '' },
        { id: 'n2', type: 'card', x: 400, y: 100, width: 200, height: 100, title: 'Node 2', body: '' },
      ],
      edges: [{ id: 'e1', from: 'n1', to: 'n2', type: 'arrow' }],
      groups: [
        { id: 'g1', title: 'Group', nodeIds: ['n1', 'n2'] },
      ],
    });

    // Delete n1 — group g1 should be updated (n1 removed from nodeIds), not deleted
    const patch: DSLPatch = {
      type: 'dsl_patch',
      summary: 'delete node in group',
      ops: [{ op: 'delete_node', nodeId: 'n1' }],
    };

    const { board: resultBoard, result } = applyPatch(b, patch);

    expect(result.applied).toBe(true);
    expect(resultBoard.groups[0].nodeIds).toEqual(['n2']);
  });

  it('should return original board when validation errors and board-level errors coexist', () => {
    const board = minimalBoard();
    const patch: DSLPatch = {
      type: 'dsl_patch',
      summary: 'multiple failures',
      ops: [
        { op: 'add_node', node: newNode('n1') },           // duplicate
        { op: 'update_node', nodeId: 'n_ghost', changes: { title: 'X' } }, // not found
      ],
    };

    const { board: resultBoard, result } = applyPatch(board, patch);

    expect(result.applied).toBe(false);
    expect(result.appliedOps).toBe(0);
    expect(result.errors).toHaveLength(2);
    expect(resultBoard).toBe(board);
    expect(resultBoard.nodes).toHaveLength(2);
  });
});
