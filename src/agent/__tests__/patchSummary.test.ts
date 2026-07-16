import { describe, expect, it } from 'vitest';
import type { BoardDSL, DSLPatch } from '../../types/dsl';
import { summarizePatchChanges } from '../patchSummary';

const board: BoardDSL = {
  version: '0.1',
  board: { id: 'b1', title: 'Board', viewport: { x: 0, y: 0, zoom: 1 } },
  nodes: [
    { id: 'n1', type: 'card', x: 0, y: 0, width: 200, height: 100, title: 'One', body: '' },
    { id: 'n2', type: 'card', x: 240, y: 0, width: 200, height: 100, title: 'Two', body: '' },
  ],
  edges: [],
  groups: [],
  metadata: {},
};

function patch(ops: DSLPatch['ops']): DSLPatch {
  return { type: 'dsl_patch', summary: 'test', ops };
}

describe('summarizePatchChanges', () => {
  it('counts operations and returns affected object ids', () => {
    const result = summarizePatchChanges(patch([
      { op: 'update_node', nodeId: 'n1', changes: { title: 'Updated' } },
      {
        op: 'add_node',
        node: { id: 'n3', type: 'note', x: 0, y: 140, width: 200, height: 100, title: 'Three', body: '' },
      },
      { op: 'add_edge', edge: { id: 'e1', from: 'n1', to: 'n3', type: 'arrow' } },
    ]), board);

    expect(result.labels).toEqual(['新增节点 1', '修改节点 1', '新增连线 1']);
    expect(result.affectedNodeIds).toEqual(['n1', 'n3']);
    expect(result.affectedEdgeIds).toEqual(['e1']);
  });

  it('marks all resulting nodes as affected for full-board layout', () => {
    const result = summarizePatchChanges(patch([
      { op: 'layout', algorithm: 'dagre', scope: 'all' },
    ]), board);

    expect(result.affectedNodeIds).toEqual(['n1', 'n2']);
  });
});
