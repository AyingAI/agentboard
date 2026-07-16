import { describe, expect, it } from 'vitest';
import type { DSLPatch } from '../../types/dsl';
import { assessPatchRisk } from '../patchRisk';

function patch(ops: DSLPatch['ops']): DSLPatch {
  return { type: 'dsl_patch', summary: 'test', ops };
}

describe('assessPatchRisk', () => {
  it('allows additive patches to apply automatically', () => {
    const result = assessPatchRisk(patch([
      {
        op: 'add_node',
        node: { id: 'n1', type: 'card', x: 0, y: 0, width: 200, height: 100, title: 'New', body: '' },
      },
      { op: 'layout', algorithm: 'horizontal', scope: 'changed' },
    ]));

    expect(result.requiresConfirmation).toBe(false);
    expect(result.counts.add_node).toBe(1);
  });

  it('requires confirmation before deleting nodes or groups', () => {
    const result = assessPatchRisk(patch([
      { op: 'delete_node', nodeId: 'n1' },
      { op: 'delete_group', groupId: 'g1' },
    ]));

    expect(result.requiresConfirmation).toBe(true);
    expect(result.reasons).toEqual(['delete_node', 'delete_group']);
  });

  it('requires confirmation before rewriting visible node content', () => {
    const result = assessPatchRisk(patch([
      { op: 'update_node', nodeId: 'n1', changes: { body: 'Replacement' } },
    ]));

    expect(result.requiresConfirmation).toBe(true);
    expect(result.reasons).toContain('rewrite_content');
  });

  it('does not treat a position-only update as a content rewrite', () => {
    const result = assessPatchRisk(patch([
      { op: 'update_node', nodeId: 'n1', changes: { x: 120, y: 80 } },
    ]));

    expect(result.requiresConfirmation).toBe(false);
  });

  it('requires confirmation for a full-board layout', () => {
    const result = assessPatchRisk(patch([
      { op: 'layout', algorithm: 'dagre', scope: 'all' },
    ]));

    expect(result.requiresConfirmation).toBe(true);
    expect(result.reasons).toContain('full_board_layout');
  });
});
