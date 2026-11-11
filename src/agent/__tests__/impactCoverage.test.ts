import { expect, it } from 'vitest';
import type { BoardDSL, BoardNode, CollaborationState } from '../../types/dsl';
import { buildDiscoveryContext, buildImpactContext, impactCoverage, impactProjectContext, nodePrints, resolveImpactItems } from '../discoveries';

const card = (id: string, body: string, tags?: string[]): BoardNode => ({ id, title: id, body, tags, type: 'card', x: 0, y: 0, width: 300, height: 160 });
function fixture() {
  const board: BoardDSL = { version: '0.1', board: { id: 'workshop', title: '工作坊', viewport: { x: 0, y: 0, zoom: 1 } },
    nodes: [card('rule', '工作坊需要留照。', ['evidence']), card('offline', '工作坊断网时登记照换纸质入场码。'), card('unrelated', '另一项目的独立安排。')], edges: [], groups: [], metadata: {} };
  const state: CollaborationState = { discoveries: [], checkedNodes: nodePrints(board), checkedContext: impactProjectContext(board, { discoveries: [] }) };
  board.nodes[0].body = '工作坊拍照完全自愿，不影响入场。';
  return { board, state };
}

it('includes untagged execution cards while protecting original materials and user edits', () => {
  const { board, state } = fixture();
  const context = buildImpactContext(board, state)!;
  expect(context.targets.map(n => n.id)).toContain('offline');
  expect(context.targets.map(n => n.id)).not.toContain('rule');
  board.nodes[1].body = '用户刚改好的执行安排。';
  expect(buildImpactContext(board, state)?.targets.map(n => n.id)).not.toContain('offline');
});

it('includes a newly added dependent outcome without requiring a prior checked entry', () => {
  const { board, state } = fixture();
  board.nodes.push(card('new-target', '备用执行流程使用上游条件。'));
  board.edges.push({ id: 'dependency', from: 'rule', to: 'new-target' });
  expect(buildImpactContext(board, state)?.targets[0].id).toBe('new-target');
});

it.each([false, true])('protects an edited rule with a changed dependency when project conditions changed: %s', contextChanged => {
  const { board, state } = fixture();
  board.nodes[0].tags = ['output'];
  board.nodes.push(card('guideline', '报名不以提交照片为条件。', ['evidence']));
  board.edges.push({ id: 'rule-dep', from: 'guideline', to: 'rule' });
  if (contextChanged) state.constraints = '保留纸质备选流程。';
  const context = buildImpactContext(board, state)!;
  expect(context.targets.map(node => node.id)).toContain('offline');
  expect(context.targets.map(node => node.id)).not.toContain('rule');
  expect(context.changes).toContainEqual(expect.objectContaining({ id: 'rule', kind: 'edited' }));
});

it('reports candidate overflow and incomplete judgments without clearing the board', () => {
  const { board, state } = fixture();
  for (let i = 0; i < 10; i++) {
    const n = card(`required-${i}`, '必须按上游规则修改的执行流程。'); board.nodes.push(n);
    state.checkedNodes![n.id] = nodePrints({ ...board, nodes: [n] })[n.id];
    board.edges.push({ id: `dep-${i}`, from: 'rule', to: n.id });
  }
  const context = buildImpactContext(board, state)!;
  expect(context.targets).toHaveLength(6); expect(context.omittedTargetCount).toBe(6);
  expect(impactCoverage(board, state, context, []).unreviewedCount).toBe(12);
  expect(resolveImpactItems(context, [], []).every(item => item.status === 'verify')).toBe(true);
});

it('keeps a candidate read-only if its proposed revision has no applicable source', () => {
  const { board, state } = fixture();
  const context = buildImpactContext(board, state)!;
  const unsupported = { nodeId: 'unrelated', status: 'revise' as const, reason: '另一项目用了相似措辞。', sourceIds: ['unrelated'] };
  const related = { nodeId: 'offline', status: 'revise' as const, reason: '发码仍要求拍照。', sourceIds: ['rule'] };
  const result = resolveImpactItems(context, [unsupported, related], []);
  expect(result.find(item => item.nodeId === 'unrelated')).toMatchObject({ status: 'verify', sourceIds: [] });
  expect(result.find(item => item.nodeId === 'offline')).toEqual(related);
});

it('allows a revision based on an explicitly changed board-wide condition', () => {
  const { board, state } = fixture();
  state.constraints = '所有工作坊流程须保留纸质入场方式。';
  const context = buildImpactContext(board, state)!;
  const item = { nodeId: 'offline', status: 'revise' as const, reason: '加入纸质入场方式。', sourceIds: [] };
  expect(resolveImpactItems(context, [item], [])).toContainEqual(item);
});

it('keeps a tail condition readable and reserves room for targets after many long changes', () => {
  const { board, state } = fixture();
  board.nodes[1].body = '执行说明。'.repeat(800) + '尾部规则：不留照不给入场码。';
  state.checkedNodes!.offline = nodePrints(board).offline;
  const context = buildImpactContext(board, state)!;
  const input = buildDiscoveryContext(board, state, context);
  expect(input.nodes.find(n => n.id === 'offline')?.body).toContain('尾部规则');
  for (let i = 0; i < 8; i++) board.nodes.push(card(`source-${i}`, '长资料。'.repeat(2000), ['evidence']));
  const large = buildImpactContext(board, state)!;
  const largeInput = buildDiscoveryContext(board, state, large);
  expect(largeInput.nodes.find(n => n.id === 'offline')?.body.length).toBeGreaterThan(0);
  expect(impactCoverage(board, state, large, []).truncatedCount).toBeGreaterThan(0);
});
