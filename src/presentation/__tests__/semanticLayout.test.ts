import { describe, expect, it } from 'vitest';
import type { BoardDSL, BoardNode, SpatialPlan } from '../../types/dsl';
import { inferSpatialPlan, spatialPlanError, withSpatialPlan } from '../spatialPlan';
import { layoutSemanticBoard, measuredSemanticBoard, mapEdgePath } from '../semanticLayout';
import { intersects } from '../layout';
import { applyVisualPatch, patchConflicts } from '../../visuals/patch';
import { validatePatchPolicy, defaultTaskPolicy } from '../../agent/taskPolicy';
import { buildUserMessage } from '../../agent/prompts';

const node = (id: string, tags: string[] = [], width = 300, height = 150): BoardNode => ({ id, type: 'card', title: id, body: `关于 ${id} 的实际内容。`, x: 10, y: 10, width, height, tags });
const board = (nodes: BoardNode[], groups: BoardDSL['groups'] = [], edges: BoardDSL['edges'] = []): BoardDSL => ({ version: '0.1', board: { id: 'b', title: '空间也是内容', viewport: { x: 0, y: 0, zoom: 1 } }, nodes, groups, edges, metadata: {} });
const noCollisions = (nodes: BoardNode[]) => expect(nodes.some((node, i) => nodes.slice(i + 1).some(other => intersects(node, other)))).toBe(false);
const plan: SpatialPlan = { description: '三个方案并列比较，各自保留依据与风险。', root: { direction: 'row', children: [{ groupId: 'a', direction: 'column' }, { groupId: 'b', direction: 'column' }, { groupId: 'c', direction: 'column' }] } };
function comparison() {
  const nodes = Array.from({ length: 9 }, (_, i) => node(`n${i}`, [], i % 3 === 0 ? 740 : 320, i % 3 === 0 ? 720 : 180));
  const groups = ['a', 'b', 'c'].map((id, i) => ({ id, title: `方案 ${id}`, nodeIds: nodes.slice(i * 3, i * 3 + 3).map(node => node.id) }));
  return board(nodes, groups);
}

describe('semantic spatial planning', () => {
  it('places comparable groups in parallel, with measured contents retained inside their lane', () => {
    const before = withSpatialPlan(comparison(), plan);
    const after = measuredSemanticBoard(before, [{ id: 'n1', width: 320, height: 400 }]);
    expect(after.nodes[0].y).toBe(after.nodes[3].y); expect(after.nodes[3].y).toBe(after.nodes[6].y);
    expect(after.nodes[3].x).toBeGreaterThan(after.nodes[0].x + after.nodes[0].width);
    expect(after.nodes[2].y).toBeGreaterThan(after.nodes[1].y + 400);
    noCollisions(after.nodes); expect(after.nodes.map(n => n.body)).toEqual(before.nodes.map(n => n.body));
    expect(after.edges).toBe(before.edges); expect(after.groups).toBe(before.groups);
  });
  it('supports nested arguments with a decision between evidence and risks', () => {
    const before = board([node('e1', ['evidence']), node('e2', ['evidence']), node('decision', ['decision']), node('risk', ['risk']), node('next', ['action'])]);
    const after = layoutSemanticBoard(before, true);
    const map = new Map(after.board.nodes.map(n => [n.id, n]));
    expect(map.get('e1')!.x).toBeLessThan(map.get('decision')!.x);
    expect(map.get('decision')!.x).toBeLessThan(map.get('risk')!.x);
    expect(map.get('next')!.y).toBeGreaterThan(map.get('decision')!.y);
    noCollisions(after.board.nodes); expect(after.plan.description).toContain('判断放在中心');
  });
  it('uses a hub for a star and horizontal dependency layers for a branching process', () => {
    const hub = board([node('hub'), ...Array.from({ length: 7 }, (_, i) => node(`n${i}`))], [], Array.from({ length: 7 }, (_, i) => ({ id: `e${i}`, from: 'hub', to: `n${i}`, type: 'line' })));
    const orbit = layoutSemanticBoard(hub, true); noCollisions(orbit.board.nodes);
    expect(inferSpatialPlan(hub).root).toHaveProperty('direction', 'orbit');
    const flow = board(['start', 'a', 'b', 'end'].map(id => node(id)), [], [['start', 'a'], ['start', 'b'], ['a', 'end'], ['b', 'end']].map(([from, to], i) => ({ id: `${i}`, from, to })));
    const arranged = layoutSemanticBoard(flow, true).board;
    for (const edge of flow.edges) expect(arranged.nodes.find(n => n.id === edge.to)!.x).toBeGreaterThan(arranged.nodes.find(n => n.id === edge.from)!.x);
    expect(arranged.nodes[1].x).toBe(arranged.nodes[2].x); noCollisions(arranged.nodes);
  });
  it('provides a compact map for large interactive cards without mutating their HTML, state or geometry', () => {
    const before = withSpatialPlan(comparison(), plan);
    before.nodes[0].visual = { html: '<button>任意表达</button>', state: { count: 7 }, height: 1000 };
    const compact = layoutSemanticBoard(before, true);
    expect(compact.board.nodes[0].height).toBeLessThan(before.nodes[0].height);
    expect(compact.board.nodes[0].visual).toBe(before.nodes[0].visual);
    expect(compact.board.nodes[0].width).toBe(300); expect(before.nodes[0].width).toBe(740);
    const top = Math.min(...compact.board.nodes.map(n => n.y)), bottom = Math.max(...compact.board.nodes.map(n => n.y + n.height));
    expect(bottom - top).toBeLessThan(800); noCollisions(compact.board.nodes);
  });
  it('rejects invalid plans, duplicate ownership and unknown references atomically', () => {
    const before = comparison();
    expect(spatialPlanError(plan, before)).toBeNull();
    expect(spatialPlanError({ ...plan, root: { nodeId: 'missing' } }, before)).toContain('不存在');
    expect(spatialPlanError({ ...plan, root: { direction: 'row', children: [{ nodeId: 'n0' }, { groupId: 'a' }] } }, before)).toContain('重复');
    const outcome = applyVisualPatch(before, { type: 'dsl_patch', summary: '', ops: [], presentation: { layout: 'auto', plan: { ...plan, root: { nodeId: 'missing' } } } });
    expect(outcome.result.applied).toBe(false); expect(outcome.board).toBe(before);
  });
  it('keeps new and deleted nodes visible without duplicating stale plan references', () => {
    const source = withSpatialPlan(comparison(), plan);
    const modified = { ...source, nodes: [...source.nodes.slice(1), node('new')], groups: source.groups.map(g => ({ ...g, nodeIds: g.nodeIds.filter(id => id !== 'n0') })) };
    const map = layoutSemanticBoard(modified, true);
    expect(map.board.nodes.map(n => n.id)).toEqual(modified.nodes.map(n => n.id)); noCollisions(map.board.nodes);
  });
  it('enforces layout-only permission and detects edits made during spatial planning', () => {
    const before = comparison(), patch = { type: 'dsl_patch' as const, summary: '', ops: [], presentation: { layout: 'auto' as const, plan } };
    const policy = { ...defaultTaskPolicy([]), allowFullBoardLayout: true, layoutOnly: true };
    expect(validatePatchPolicy(patch, policy, before)).toEqual([]);
    expect(validatePatchPolicy({ ...patch, presentation: { layout: 'auto', plan: { description: '不完整的方案', root: { nodeId: 'n0' } } } }, policy, before).length).toBeGreaterThan(0);
    expect(validatePatchPolicy({ ...patch, ops: [{ op: 'update_node', nodeId: 'n0', changes: { body: '偷偷修改' } }] }, policy, before).length).toBeGreaterThan(0);
    expect(validatePatchPolicy(patch, defaultTaskPolicy([]), before).length).toBeGreaterThan(0);
    expect(validatePatchPolicy(patch, { ...policy, scope: 'selection', selectedNodeIds: ['n0'] }, before).length).toBeGreaterThan(0);
    const changed = { ...before, nodes: before.nodes.map(n => n.id === 'n0' ? { ...n, body: '工作期间的人类编辑' } : n) };
    expect(patchConflicts(before, changed, patch)).toContain('spatial-plan');
  });
  it('gives the planner actual content and sizes without resending executable visual code', () => {
    const before = comparison(); before.nodes[0].visual = { html: '<script>secret-code-marker</script>', state: { choice: 'A' } };
    const message = buildUserMessage(before, '智能布局', { taskPolicy: { ...defaultTaskPolicy([]), allowFullBoardLayout: true, layoutOnly: true }, recentEditEvents: [{ id: 'e', type: 'node_updated', timestamp: 1, summary: '编辑' }] });
    expect(message).toContain(before.nodes[0].body); expect(message).toContain('740');
    expect(message).toContain('ops: []'); expect(message).not.toContain('secret-code-marker'); expect(message).not.toContain('Context packet (delta)');
  });
  it('provides a structural fallback for complex new boards and honors preserved/custom layouts', () => {
    const content = comparison();
    content.nodes[0].visual = { html: '<h2>可见内容</h2>', state: {} };
    const emptyBoard = board([]);
    const patch = { type: 'dsl_patch' as const, summary: '', ops: [...content.nodes.map(node => ({ op: 'add_node' as const, node })), ...content.groups.map(group => ({ op: 'add_group' as const, group }))] };
    const automatic = applyVisualPatch(emptyBoard, patch);
    expect(automatic.result.applied).toBe(true); expect(automatic.board.metadata['agentboard.presentation']).toHaveProperty('spatialSource', 'local');
    expect(applyVisualPatch(emptyBoard, { ...patch, presentation: { layout: 'preserve' } }).board.metadata['agentboard.presentation']).not.toHaveProperty('spatialPlan');
    expect(applyVisualPatch(emptyBoard, { ...patch, ops: [...patch.ops, { op: 'layout', algorithm: 'mindmap', scope: 'changed' }] }).board.metadata['agentboard.presentation']).not.toHaveProperty('spatialPlan');
  });
  it('routes a direct relationship around an intervening card', () => {
    const a = { ...node('a'), x: 0, y: 0 }, b = { ...node('b'), x: 800, y: 0 }, obstruction = { ...node('middle'), x: 400, y: 0 };
    const route = mapEdgePath(a, b, [a, obstruction, b]);
    expect(route.path).not.toContain('NaN');
    const points = [...route.path.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map(m => ({ x: Number(m[1]), y: Number(m[2]) }));
    expect(points.some(p => p.y < 0 || p.y > 150)).toBe(true);
  });
});
