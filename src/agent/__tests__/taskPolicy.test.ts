import { describe, expect, it } from 'vitest';
import type { DSLPatch } from '../../types/dsl';
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
});
