import { describe, expect, it } from 'vitest';
import type { BoardDSL, DSLPatch } from '../../types/dsl';
import { defaultTaskPolicy, describeTaskPolicy, validatePatchPolicy } from '../taskPolicy';

function patch(ops: DSLPatch['ops']): DSLPatch {
  return { type: 'dsl_patch', summary: 'test', ops };
}

describe('task policy', () => {
  it('defaults selected nodes to selection scope with destructive actions disabled', () => {
    expect(defaultTaskPolicy(['n1'])).toEqual({
      scope: 'selection',
      selectedNodeIds: ['n1'],
      allowExistingEdits: true,
      allowDelete: false,
      allowFullBoardLayout: false,
    });
  });

  it('blocks deletion and full-board layout unless explicitly allowed', () => {
    const policy = defaultTaskPolicy([]);
    const violations = validatePatchPolicy(patch([
      { op: 'delete_node', nodeId: 'n1' },
      { op: 'layout', algorithm: 'dagre', scope: 'all' },
    ]), policy);

    expect(violations.map((item) => item.op)).toEqual(['delete_node', 'layout']);
  });

  it('blocks edits outside the selected-node scope', () => {
    const policy = defaultTaskPolicy(['n1']);
    const violations = validatePatchPolicy(patch([
      { op: 'update_node', nodeId: 'n2', changes: { title: 'Outside' } },
      { op: 'update_node', nodeId: 'n1', changes: { title: 'Inside' } },
    ]), policy);

    expect(violations).toHaveLength(1);
    expect(violations[0].message).toContain('n2');
  });

  it('blocks existing-content edits in add-only mode', () => {
    const policy = { ...defaultTaskPolicy([]), allowExistingEdits: false };
    const violations = validatePatchPolicy(patch([
      { op: 'update_node', nodeId: 'n1', changes: { body: 'Rewrite' } },
    ]), policy);

    expect(violations[0].message).toContain('只允许新增内容');
  });

  it('describes restrictions for the agent prompt', () => {
    const description = describeTaskPolicy(defaultTaskPolicy(['n1', 'n2']));
    expect(description).toContain('n1, n2');
    expect(description).toContain('Do not emit delete_node');
    expect(description).toContain('scope "all"');
  });

  it('blocks changing groups and connections that include unselected content', () => {
    const board = { groups: [{ id: 'g1', title: 'shared', nodeIds: ['n1', 'n2'] }], edges: [{ id: 'e1', from: 'n1', to: 'n2' }] } as BoardDSL;
    const policy = { ...defaultTaskPolicy(['n1']), allowDelete: true };
    const violations = validatePatchPolicy(patch([
      { op: 'update_group', groupId: 'g1', changes: { title: 'Changed' } },
      { op: 'delete_group', groupId: 'g1' },
      { op: 'delete_edge', edgeId: 'e1' },
      { op: 'add_group', group: { id: 'g2', title: 'Mixed', nodeIds: ['n1', 'n2'] } },
      { op: 'add_edge', edge: { id: 'e2', from: 'n1', to: 'n2' } },
    ]), policy, board);
    expect(violations.map(item => item.opIndex)).toEqual([0, 1, 2, 3, 4]);
  });

  it('allows an agent to connect and group newly added content with selected nodes', () => {
    const policy = defaultTaskPolicy(['n1']);
    expect(validatePatchPolicy(patch([
      { op: 'add_node', node: { id: 'new', type: 'note', title: 'New', body: '', x: 0, y: 0, width: 240, height: 120 } },
      { op: 'add_edge', edge: { id: 'e2', from: 'n1', to: 'new' } },
      { op: 'add_group', group: { id: 'g2', title: 'Together', nodeIds: ['n1', 'new'] } },
    ]), policy)).toEqual([]);
  });

  it('rejects expanding a selected group to include an unselected node', () => {
    const board = { groups: [{ id: 'g1', title: 'selected', nodeIds: ['n1'] }], edges: [] } as unknown as BoardDSL;
    expect(validatePatchPolicy(patch([
      { op: 'update_group', groupId: 'g1', changes: { nodeIds: ['n1', 'n2'] } },
    ]), defaultTaskPolicy(['n1']), board)).toHaveLength(1);
  });
});
