import { expect, it } from 'vitest';
import { patchConflicts } from '../../visuals/patch';
import type { BoardDSL, DSLPatch } from '../../types/dsl';

const board: BoardDSL = { version: '0.1', board: { id: 'b', title: '项目', viewport: { x: 0, y: 0, zoom: 1 } },
  nodes: ['rule', 'target', 'other'].map(id => ({ id, title: id, body: '现有正文。', type: 'card', x: 0, y: 0, width: 200, height: 100 })),
  edges: [{ id: 'depends', from: 'rule', to: 'target' }], groups: [{ id: 'project', title: '项目 A', nodeIds: ['rule', 'target'] }], metadata: {} };
const patch: DSLPatch = { type: 'dsl_patch', summary: '同步执行卡', ops: [{ op: 'update_node', nodeId: 'target', changes: { body: '新正文。' } }] };

it('rejects a revision after a source relationship or project boundary changes', () => {
  const changed = structuredClone(board); changed.groups[0].nodeIds = ['rule'];
  expect(patchConflicts(board, changed, patch, ['rule'])).toContain('references');
  const unlinked = { ...board, edges: [] };
  expect(patchConflicts(board, unlinked, patch, ['rule'])).toContain('references');
  const retagged = structuredClone(board); retagged.nodes[0].tags = ['output'];
  expect(patchConflicts(board, retagged, patch, ['rule'])).toContain('rule');
});

it('allows unrelated content edits and source movement without invalidating the revision', () => {
  const changed = structuredClone(board); changed.nodes[0].x = 800; changed.nodes[2].body = '另一项目的新内容。';
  changed.groups.push({ id: 'other-project', title: '独立项目', nodeIds: ['other'] });
  expect(patchConflicts(board, changed, patch, ['rule'])).toEqual([]);
});
