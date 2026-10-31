import { expect, it } from 'vitest';
import type { BoardDSL } from '../../types/dsl';
import { arrangeMeasuredBoard } from '../layout';
import { applyVisualPatch } from '../../visuals/patch';
it('a shorter visual can shrink after an earlier measured layout expanded its card', () => {
  const board: BoardDSL = { version: '0.1', board: { id: 'b', title: '', viewport: { x: 0, y: 0, zoom: 1 } }, nodes: [{ id: 'v', type: 'card', title: '视觉', body: '', x: 0, y: 0, width: 700, height: 120, visual: { html: '<p>原来的内容</p>', height: 600 } }], groups: [], edges: [], metadata: {} };
  const measured = arrangeMeasuredBoard(board, [{ id: 'v', width: 700, height: 800 }]);
  expect(measured.nodes[0].height).toBe(800);
  const revised = applyVisualPatch(measured, { type: 'dsl_patch', summary: '更简洁', ops: [{ op: 'update_node', nodeId: 'v', changes: { visual: { html: '<p>极简内容</p>', height: 160 } } }] });
  expect(revised.result.applied).toBe(true); expect(revised.board.nodes[0].height).toBe(120);
  const shorter = arrangeMeasuredBoard(revised.board, [{ id: 'v', width: 700, height: 320 }]);
  expect(shorter.nodes[0].height).toBe(320);
  const explicit = applyVisualPatch(shorter, { type: 'dsl_patch', summary: '指定高度', ops: [{ op: 'update_node', nodeId: 'v', changes: { height: 400 } }] });
  const again = applyVisualPatch(explicit.board, { type: 'dsl_patch', summary: '改写正文', ops: [{ op: 'update_node', nodeId: 'v', changes: { body: '短说明' } }] });
  expect(again.board.nodes[0].height).toBe(400);
});
