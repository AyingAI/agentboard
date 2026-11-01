import { describe, expect, it } from 'vitest';
import type { BoardDSL, BoardNode } from '../../types/dsl';
import { composeMeasuredBoard, compositionWidth, hasManagedComposition, needsCompositionRepair, preserveBoardPlacement } from '../composition';
import { intersects } from '../layout';
import { updateContentMinimums } from '../metrics';

const node = (id: string, width = 300, height = 160, x = 80, y = 80): BoardNode => ({ id, type: 'card', title: id, body: '', x, y, width, height });
const board = (nodes: BoardNode[], groups: BoardDSL['groups'] = [], edges: BoardDSL['edges'] = []): BoardDSL => ({ version: '0.1', board: { id: 'b', title: '', viewport: { x: 0, y: 0, zoom: 1 } }, nodes, groups, edges, metadata: {} });
const bounds = (nodes: BoardNode[], grouped = false) => {
  const x = Math.min(...nodes.map(n => n.x)) - (grouped ? 28 : 0), y = Math.min(...nodes.map(n => n.y)) - (grouped ? 52 : 0);
  return { x, y, width: Math.max(...nodes.map(n => n.x + n.width)) + (grouped ? 28 : 0) - x, height: Math.max(...nodes.map(n => n.y + n.height)) + (grouped ? 28 : 0) - y };
};
const overlaps = (rects: ReturnType<typeof bounds>[]) => rects.flatMap((r, i) => rects.slice(i + 1).filter(other => intersects(r, other)));

describe('section composition', () => {
  it('replaces diagonal group staircases with aligned visual/annotation spreads', () => {
    const nodes = [node('visual-a', 700, 500), node('note-a', 320, 160, 80, 700), node('visual-b', 700, 600, 900, 1100), node('note-b', 320, 170, 900, 1900), node('note-c', 320, 180, 900, 2100), node('visual-c', 700, 500, 1720, 2400)];
    const groups = [{ id: 'g1', title: '第一步', nodeIds: ['visual-a', 'note-a'] }, { id: 'g2', title: '第二步', nodeIds: ['visual-b', 'note-b', 'note-c'] }, { id: 'g3', title: '第三步', nodeIds: ['visual-c'] }];
    const before = board(nodes, groups);
    const after = composeMeasuredBoard(before, [], { availableWidth: 1200 });
    const byId = new Map(after.nodes.map(n => [n.id, n]));
    expect(byId.get('visual-a')!.x).toBe(byId.get('visual-b')!.x);
    expect(byId.get('visual-b')!.x).toBe(byId.get('visual-c')!.x);
    expect(byId.get('note-a')!.y).toBe(byId.get('visual-a')!.y);
    expect(byId.get('note-b')!.y).toBe(byId.get('visual-b')!.y);
    expect(byId.get('note-c')!.x).toBe(byId.get('note-b')!.x);
    expect(overlaps(after.nodes)).toEqual([]);
    expect(overlaps(groups.map(g => bounds(after.nodes.filter(n => g.nodeIds.includes(n.id)), true)))).toEqual([]);
    expect(bounds(after.nodes).width).toBeLessThan(1200);
    expect(bounds(after.nodes).height).toBeLessThan(bounds(before.nodes).height * .7);
    expect(bounds(after.nodes).width * bounds(after.nodes).height).toBeLessThan(bounds(before.nodes).width * bounds(before.nodes).height * .4);
    expect(before.nodes[2].x).toBe(900);
    expect(after.groups).toBe(before.groups);
    expect(composeMeasuredBoard(after, [])).toBe(after);
  });

  it('packs small cards in reading rows using the tallest measured card for row clearance', () => {
    const before = board(Array.from({ length: 12 }, (_, i) => node(`n${i}`)));
    const after = composeMeasuredBoard(before, [{ id: 'n0', width: 300, height: 430 }], { availableWidth: 1000 });
    expect(new Set(after.nodes.slice(0, 3).map(n => n.y)).size).toBe(1);
    expect(after.nodes[3].y).toBeGreaterThanOrEqual(after.nodes[0].y + 430 + 32);
    expect(overlaps(after.nodes)).toEqual([]);
    expect(after.nodes.map(n => n.width)).toEqual(before.nodes.map(n => n.width));
  });

  it('packs compact sections in shared rows and gives subsequent sections a common left edge', () => {
    const nodes = Array.from({ length: 5 }, (_, i) => node(`n${i}`, 320, 140 + i * 30));
    const groups = nodes.map(n => ({ id: `g-${n.id}`, title: n.title, nodeIds: [n.id] }));
    const after = composeMeasuredBoard(board(nodes, groups), [], { availableWidth: 1300 });
    expect(after.nodes[0].y).toBe(after.nodes[1].y);
    expect(after.nodes[0].y).toBe(after.nodes[2].y);
    expect(after.nodes[3].x).toBe(after.nodes[0].x);
    expect(overlaps(groups.map(g => bounds(after.nodes.filter(n => g.nodeIds.includes(n.id)), true)))).toEqual([]);
  });

  it('handles many mixed sections, wide visuals, negative positions and shared memberships', () => {
    const nodes = Array.from({ length: 90 }, (_, i) => node(`n${i}`, i % 6 === 0 ? 740 : i % 6 === 1 ? 380 : 290, 100 + i % 7 * 110, -i * 210, i * 60));
    const groups = Array.from({ length: 15 }, (_, i) => ({ id: `g${i}`, title: `阶段 ${i}`, nodeIds: nodes.slice(i * 6, i * 6 + 6).map(n => n.id) }));
    const before = board(nodes, groups);
    const after = composeMeasuredBoard(before, [], { availableWidth: 1220 });
    expect(overlaps(after.nodes)).toEqual([]);
    expect(overlaps(groups.map(g => bounds(after.nodes.filter(n => g.nodeIds.includes(n.id)), true)))).toEqual([]);
    expect(bounds(after.nodes).width).toBeLessThanOrEqual(1220);
    expect(composeMeasuredBoard(after, [])).toBe(after);
    const shared = composeMeasuredBoard(board(nodes.slice(0, 3), [{ id: 'a', title: '', nodeIds: ['n0', 'n1'] }, { id: 'b', title: '', nodeIds: ['n1', 'n2'] }]), []);
    expect(shared.nodes).toHaveLength(3); expect(overlaps(shared.nodes)).toEqual([]);
  });

  it('respects anchored user objects when adding a separate new section', () => {
    const before = board([node('fixed-a', 700, 500, 240, 100), node('fixed-b', 320, 180, 1000, 100), node('new-a', 700, 500, 2600, 1800), node('new-b', 320, 160, 2600, 2500)], [{ id: 'a', title: '', nodeIds: ['fixed-a', 'fixed-b'] }, { id: 'b', title: '', nodeIds: ['new-a', 'new-b'] }]);
    const after = composeMeasuredBoard(before, [], { availableWidth: 1200, movableIds: new Set(['new-a', 'new-b']) });
    expect(after.nodes[0]).toBe(before.nodes[0]); expect(after.nodes[1]).toBe(before.nodes[1]);
    expect(after.nodes[2].x).toBe(before.nodes[0].x);
    expect(after.nodes[2].y).toBeGreaterThan(before.nodes[0].y + before.nodes[0].height);
    expect(after.nodes[2].y).toBe(after.nodes[3].y);
    expect(hasManagedComposition(after)).toBe(false);
    expect(overlaps(after.nodes)).toEqual([]);
  });

  it('retains manual positions inside a partially updated group', () => {
    const before = board([node('fixed', 300, 160, 500, 100), node('new', 300, 160, 500, 100)], [{ id: 'g', title: '', nodeIds: ['fixed', 'new'] }]);
    const after = composeMeasuredBoard(before, [], { movableIds: new Set(['new']) });
    expect(after.nodes[0]).toBe(before.nodes[0]); expect(overlaps(after.nodes)).toEqual([]);
  });

  it('preserves model code and state, and detects subsequent manual drags', () => {
    const visual = { html: '<div>自由表达</div>', state: { count: 12 }, height: 400 };
    const before = board([{ ...node('visual', 700, 500), visual }, node('note', 320, 160)]);
    const after = composeMeasuredBoard(before, []);
    expect(after.nodes[0].visual).toBe(visual);
    expect(hasManagedComposition(after)).toBe(true);
    const resized = { ...after, nodes: after.nodes.map(n => ({ ...n, height: n.height + 100 })) };
    expect(hasManagedComposition(resized)).toBe(true);
    expect(hasManagedComposition({ ...after, nodes: after.nodes.map(n => ({ ...n, x: n.x + 50 })) })).toBe(false);
    const updated = updateContentMinimums(after, { type: 'dsl_patch', summary: '', ops: [{ op: 'update_node', nodeId: 'visual', changes: { height: 250 } }] });
    expect(hasManagedComposition(updated)).toBe(true);
  });

  it('only migrates sparse legacy staircases once, keeping deliberate manual layouts', () => {
    const before = board([node('a', 700, 600, 80, 80), node('b', 700, 600, 1000, 1100), node('c', 700, 600, 1900, 2200)], ['a', 'b', 'c'].map(id => ({ id, title: id, nodeIds: [id] })));
    expect(needsCompositionRepair(before)).toBe(true);
    expect(needsCompositionRepair(preserveBoardPlacement(before))).toBe(false);
    expect(hasManagedComposition(preserveBoardPlacement(composeMeasuredBoard(before, [])))).toBe(false);
    expect(hasManagedComposition(composeMeasuredBoard(preserveBoardPlacement(before), []))).toBe(true);
    expect(needsCompositionRepair(composeMeasuredBoard(before, []))).toBe(false);
    expect(needsCompositionRepair({ ...before, nodes: before.nodes.map((n, i) => ({ ...n, x: 80, y: i * 750 })) })).toBe(false);
    expect(needsCompositionRepair(board([node('a'), node('b', 300, 160, 900, 600)]))).toBe(false);
    expect(compositionWidth(390)).toBe(960); expect(compositionWidth(2000)).toBe(1360);
  });
});

describe('measured directional composition', () => {
  it('keeps branching dependency direction, aligns siblings and leaves room for actual heights', () => {
    const before = board([node('start', 380, 140), node('left', 300, 120), node('right', 300, 360), node('end', 380, 120)], [], [['start', 'left'], ['start', 'right'], ['left', 'end'], ['right', 'end']].map(([from, to], i) => ({ id: `e${i}`, from, to, type: 'arrow' })));
    const after = composeMeasuredBoard(before, [{ id: 'left', width: 300, height: 500 }]);
    expect(after.nodes[1].y).toBe(after.nodes[2].y);
    for (const edge of after.edges) {
      const source = after.nodes.find(n => n.id === edge.from)!, target = after.nodes.find(n => n.id === edge.to)!;
      expect(target.y).toBeGreaterThan(source.y + source.height);
    }
    expect(overlaps(after.nodes)).toEqual([]);
    expect(after.edges).toBe(before.edges);
    expect(composeMeasuredBoard(after, [])).toBe(after);
  });

  it('handles cycles, disconnected nodes and line-only relationships without losing content', () => {
    const nodes = Array.from({ length: 8 }, (_, i) => node(`n${i}`));
    const edges = Array.from({ length: 7 }, (_, i) => ({ id: `e${i}`, from: `n${i}`, to: `n${(i + 1) % 7}`, type: 'arrow' as const }));
    const after = composeMeasuredBoard(board(nodes, [], edges), []);
    expect(after.nodes).toHaveLength(8); expect(overlaps(after.nodes)).toEqual([]);
    expect(after.nodes.every(n => Number.isFinite(n.x) && Number.isFinite(n.y))).toBe(true);
    const lines = composeMeasuredBoard(board(nodes, [], edges.map(e => ({ ...e, type: 'line' }))), []);
    expect(lines.nodes[0].y).toBe(lines.nodes[1].y);
  });

  it('keeps the chosen flow mode during later measured reflow even with sparse edges', () => {
    const before = board([node('a'), node('b'), node('c'), node('d')], [], [{ id: 'e', from: 'a', to: 'd' }]);
    const flow = composeMeasuredBoard(before, [], { algorithm: 'dagre' });
    expect(flow.nodes[3].y).toBeGreaterThan(flow.nodes[0].y);
    const taller = composeMeasuredBoard(flow, [{ id: 'a', width: 300, height: 550 }]);
    expect(taller.nodes[3].y).toBeGreaterThan(taller.nodes[0].y + 550);
    expect(overlaps(taller.nodes)).toEqual([]);
  });
});
