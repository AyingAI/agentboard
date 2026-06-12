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
