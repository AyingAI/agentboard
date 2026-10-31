import { describe, expect, it } from 'vitest';
import type { BoardDSL, BoardNode } from '../../types/dsl';
import { arrangeMeasuredBoard, intersects } from '../layout';
const node = (id: string, x: number, y: number): BoardNode => ({ id, type: 'card', title: id, body: '', width: 280, height: 120, x, y });
const board = (nodes: BoardNode[], groups: BoardDSL['groups'] = []): BoardDSL => ({ version: '0.1', board: { id: 'b', title: '', viewport: { x: 0, y: 0, zoom: 1 } }, nodes, groups, edges: [], metadata: {} });
const collisions = (nodes: BoardNode[]) => nodes.flatMap((node, index) => nodes.slice(index + 1).filter(other => intersects(node, other)));
describe('measured presentation layout', () => {
  it('uses rendered height and clears overlapping siblings and following groups', () => {
    const before = board([node('a', 40, 80), node('b', 40, 250), node('c', 400, 80), node('d', 40, 500)], [{ id: 'g1', title: '探索', nodeIds: ['a', 'b', 'c'] }, { id: 'g2', title: '验证', nodeIds: ['d'] }]);
    const after = arrangeMeasuredBoard(before, [{ id: 'a', width: 280, height: 540 }]);
    expect(after.nodes[0].height).toBe(540); expect(collisions(after.nodes)).toEqual([]);
    expect(after.nodes[1].y).toBeGreaterThan(620); expect(after.nodes[3].y).toBeGreaterThan(after.nodes[1].y + 200);
    expect(before.nodes[1].y).toBe(250); expect(after.groups).toBe(before.groups);
    expect(arrangeMeasuredBoard(after, [{ id: 'a', width: 280, height: 540 }])).toBe(after);
  });
  it('moves additions out of occupied space without moving existing user objects', () => {
    const before = board([node('fixed', 40, 40), node('new', 40, 40), node('other', 40, 300)]);
    const after = arrangeMeasuredBoard(before, [], new Set(['new']));
    expect(collisions(after.nodes)).toEqual([]);
    expect(after.nodes[0]).toBe(before.nodes[0]); expect(after.nodes[2]).toBe(before.nodes[2]);
    expect(after.nodes[1].y).toBeGreaterThan(before.nodes[2].y + before.nodes[2].height);
  });
  it('keeps non-overlapping model placements unchanged', () => {
    const before = board([node('a', 0, 0), node('b', 400, 0)]);
    expect(arrangeMeasuredBoard(before, [])).toBe(before);
  });
  it('handles groups with shared members without duplicate movement', () => {
    const before = board([node('a', 0, 0), node('b', 0, 50), node('c', 0, 100)], [{ id: 'g1', title: '', nodeIds: ['a', 'b'] }, { id: 'g2', title: '', nodeIds: ['b', 'c'] }]);
    const after = arrangeMeasuredBoard(before, []);
    expect(collisions(after.nodes)).toEqual([]); expect(new Set(after.nodes.map(node => node.id)).size).toBe(3);
  });
});

it('restores the model row intent before using actual heights to clear collisions', () => {
  const before = board([node('a', 0, 0), node('b', 330, 200)]);
  const after = arrangeMeasuredBoard(before, [{ id: 'a', width: 280, height: 480 }], undefined, new Map([['b', { x: 330, y: 0 }]]));
  expect(after.nodes[1].y).toBe(0); expect(collisions(after.nodes)).toEqual([]);
});
