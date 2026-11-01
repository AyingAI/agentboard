import type { BoardDSL, BoardNode, LayoutAlgorithm } from '../types/dsl';
import { applyPatch } from '../engine/patch';
import { intrinsicHeights, withIntrinsicHeights } from './metrics';

export interface RenderedNodeSize { id: string; width: number; height: number }
type Rect = { x: number; y: number; width: number; height: number };
const GAP = 32;

export function intersects(a: Rect, b: Rect, gap = 0) {
  return a.x < b.x + b.width + gap && a.x + a.width + gap > b.x && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
}

function bounds(nodes: BoardNode[], grouped = false): Rect {
  const left = Math.min(...nodes.map(node => node.x)) - (grouped ? 28 : 0);
  const top = Math.min(...nodes.map(node => node.y)) - (grouped ? 52 : 0);
  return { x: left, y: top, width: Math.max(...nodes.map(node => node.x + node.width)) + (grouped ? 28 : 0) - left, height: Math.max(...nodes.map(node => node.y + node.height)) + (grouped ? 28 : 0) - top };
}

function clearBelow(rect: Rect, obstacles: Rect[]) {
  let y = rect.y;
  // Every step passes at least one obstacle's bottom; there is no fixed model/node-count limit.
  for (let pass = 0; pass <= obstacles.length; pass++) {
    const collisions = obstacles.filter(other => intersects({ ...rect, y }, other, GAP));
    if (!collisions.length) break;
    y = Math.max(...collisions.map(other => other.y + other.height + GAP));
  }
  return y;
}

/** Respect model ordering and group membership, using actual DOM sizes instead of guessed heights. */
export function arrangeMeasuredBoard(board: BoardDSL, sizes: RenderedNodeSize[], movableIds?: ReadonlySet<string>, preferredPositions?: ReadonlyMap<string, { x: number; y: number }>): BoardDSL {
  if (!board.nodes.length) return board;
  const minimums = intrinsicHeights(board);
  const measurements = new Map(sizes.map(size => [size.id, size]));
  const nodes = board.nodes.map(node => ({ ...node, ...preferredPositions?.get(node.id), height: Math.max(node.height, Math.ceil(measurements.get(node.id)?.height ?? node.height)) }));
  const movable = (node: BoardNode) => !movableIds || movableIds.has(node.id);
  const fixed = nodes.filter(node => !movable(node));
  const byId = new Map(nodes.map(node => [node.id, node]));
  const parent = new Map(nodes.map(node => [node.id, node.id]));
  const root = (id: string): string => { const next = parent.get(id)!; if (next === id) return id; const found = root(next); parent.set(id, found); return found; };
  for (const group of board.groups) {
    const ids = group.nodeIds.filter(id => parent.has(id));
    for (const id of ids.slice(1)) parent.set(root(id), root(ids[0]));
  }
  const components = new Map<string, BoardNode[]>();
  for (const node of nodes) { const id = root(node.id); components.set(id, [...(components.get(id) ?? []), node]); }
  const groupedIds = new Set(board.groups.flatMap(group => group.nodeIds));
  const blocks = [...components.values()].map(members => {
    const placed = [...fixed];
    for (const node of [...members].filter(movable).sort((a, b) => a.y - b.y || a.x - b.x)) {
      node.y = clearBelow(node, placed);
      placed.push(node);
    }
    return { members, grouped: members.some(node => groupedIds.has(node.id)), locked: members.some(node => !movable(node)) };
  });
  const obstacles: Rect[] = blocks.filter(block => block.locked).map(block => bounds(block.members, block.grouped));
  for (const block of blocks.filter(block => !block.locked).sort((a, b) => {
    const left = bounds(a.members, a.grouped), right = bounds(b.members, b.grouped);
    return left.y - right.y || left.x - right.x;
  })) {
    const rect = bounds(block.members, block.grouped);
    const shift = clearBelow(rect, obstacles) - rect.y;
    if (shift) for (const node of block.members) node.y += shift;
    obstacles.push(bounds(block.members, block.grouped));
  }
  let changed = false;
  const result = board.nodes.map(before => {
    const after = byId.get(before.id)!;
    if (before.x === after.x && before.y === after.y && before.height === after.height) return before;
    if (after.height !== before.height && minimums[before.id] === undefined) minimums[before.id] = before.height;
    changed = true; return after;
  });
  return changed ? withIntrinsicHeights({ ...board, nodes: result }, minimums) : board;
}

/** Apply an explicit spatial pattern to its measured selection, without changing other objects. */
export function arrangeSpatialBoard(board: BoardDSL, sizes: RenderedNodeSize[], algorithm: LayoutAlgorithm, movableIds?: ReadonlySet<string>): BoardDSL {
  const ids = movableIds ?? new Set(board.nodes.map(node => node.id));
  const measured = new Map(sizes.map(size => [size.id, size]));
  const subset: BoardDSL = { ...board,
    nodes: board.nodes.filter(node => ids.has(node.id)).map(node => ({ ...node, height: Math.max(node.height, measured.get(node.id)?.height ?? node.height) })),
    edges: board.edges.filter(edge => ids.has(edge.from) && ids.has(edge.to)),
    groups: board.groups.map(group => ({ ...group, nodeIds: group.nodeIds.filter(id => ids.has(id)) })).filter(group => group.nodeIds.length),
  };
  if (!subset.nodes.length) return arrangeMeasuredBoard(board, sizes, movableIds);
  const laidOut = applyPatch(subset, { type: 'dsl_patch', summary: '', ops: [{ op: 'layout', algorithm, scope: 'all' }] });
  if (!laidOut.result.applied) return arrangeMeasuredBoard(board, sizes, movableIds);
  const positions = new Map(laidOut.board.nodes.map(node => [node.id, { x: node.x, y: node.y }]));
  return arrangeMeasuredBoard(board, sizes, movableIds, positions);
}
