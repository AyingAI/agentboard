import type { BoardDSL, BoardNode, LayoutAlgorithm } from '../types/dsl';
import { arrangeMeasuredBoard, type RenderedNodeSize } from './layout';
import { intrinsicHeights, PRESENTATION_KEY, withIntrinsicHeights } from './metrics';
import { readSpatialPlan } from './spatialPlan';
import { measuredSemanticBoard } from './semanticLayout';

const CARD_GAP = 32;
const SECTION_GAP = 48;
const SIDE = 28;
const TOP = 52;
type Rect = { x: number; y: number; width: number; height: number };
type Block = Rect & { id: string; nodes: BoardNode[]; grouped: boolean };
type Composition = {
  version: 1;
  width: number;
  mode: 'sections' | 'flow' | 'spatial';
  positions: Record<string, { x: number; y: number; width: number }>;
};
export type CompositionOptions = { availableWidth?: number; algorithm?: LayoutAlgorithm; movableIds?: ReadonlySet<string> };

export function compositionWidth(viewportWidth = 1280) {
  // A phone is a window onto the board, not a reason to crush model-authored visuals.
  return Math.round(Math.max(960, Math.min(1360, viewportWidth - 80)));
}

function savedComposition(board: BoardDSL): Composition | undefined {
  const value = (board.metadata[PRESENTATION_KEY] as { composition?: Composition } | undefined)?.composition;
  return value?.version === 1 && ['sections', 'flow', 'spatial'].includes(value.mode) && Number.isFinite(value.width) && value.positions && typeof value.positions === 'object' ? value : undefined;
}

/** A drag or resize opts the board out of automatic reflow; ordinary content edits do not. */
export function hasManagedComposition(board: BoardDSL) {
  const value = savedComposition(board);
  return !hasFreePlacement(board) && !!value && Object.keys(value.positions).length === board.nodes.length && board.nodes.every(node => {
    const position = value.positions[node.id];
    return position && position.x === node.x && position.y === node.y && position.width === node.width;
  });
}

function hasFreePlacement(board: BoardDSL) {
  return (board.metadata[PRESENTATION_KEY] as { freePlacement?: boolean } | undefined)?.freePlacement === true;
}

export function preserveBoardPlacement(board: BoardDSL): BoardDSL {
  if (hasFreePlacement(board)) return board;
  return { ...board, metadata: { ...board.metadata, [PRESENTATION_KEY]: { ...(board.metadata[PRESENTATION_KEY] as object), freePlacement: true } } };
}

function rectOf(nodes: BoardNode[], grouped = false): Rect {
  const x = Math.min(...nodes.map(node => node.x)) - (grouped ? SIDE : 0);
  const y = Math.min(...nodes.map(node => node.y)) - (grouped ? TOP : 0);
  return { x, y, width: Math.max(...nodes.map(node => node.x + node.width)) + (grouped ? SIDE : 0) - x, height: Math.max(...nodes.map(node => node.y + node.height)) + (grouped ? SIDE : 0) - y };
}

/** Shared memberships form one placement unit, so a card is never laid out twice. */
function sectionBlocks(board: BoardDSL, nodes: BoardNode[]): Block[] {
  const parent = new Map(nodes.map(node => [node.id, node.id]));
  const root = (id: string): string => {
    let found = id;
    while (parent.get(found) !== found) found = parent.get(found)!;
    while (parent.get(id) !== found) { const next = parent.get(id)!; parent.set(id, found); id = next; }
    return found;
  };
  const grouped = new Set<string>();
  for (const group of board.groups) {
    const ids = group.nodeIds.filter(id => parent.has(id));
    ids.forEach(id => grouped.add(id));
    for (const id of ids.slice(1)) parent.set(root(id), root(ids[0]));
  }
  const members = new Map<string, BoardNode[]>();
  for (const node of nodes) {
    const key = grouped.has(node.id) ? `group:${root(node.id)}` : 'free';
    members.set(key, [...(members.get(key) ?? []), node]);
  }
  // The model's group/node sequence is the reading order; scattered coordinates aren't.
  const order = new Map(board.groups.flatMap(group => group.nodeIds).map((id, i) => [id, i]));
  return [...members].map(([id, nodes]) => {
    if (id !== 'free') nodes.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    return { id, nodes, grouped: id !== 'free', ...rectOf(nodes, id !== 'free') };
  });
}

/** Longest-path layers with deterministic cycle breaking. No node-count or output cap. */
function layers<T extends { id: string }>(items: T[], links: { from: string; to: string }[]): T[][] {
  const ids = new Set(items.map(item => item.id));
  const edges = links.filter(edge => ids.has(edge.from) && ids.has(edge.to) && edge.from !== edge.to);
  const incoming = new Map(items.map(item => [item.id, edges.filter(edge => edge.to === item.id).length]));
  const outgoing = new Map(items.map(item => [item.id, edges.filter(edge => edge.from === item.id).map(edge => edge.to)]));
  const rank = new Map(items.map(item => [item.id, 0]));
  const pending = new Set(items.map(item => item.id));
  while (pending.size) {
    const ready = items.find(item => pending.has(item.id) && incoming.get(item.id) === 0) ?? items.find(item => pending.has(item.id))!;
    pending.delete(ready.id);
    for (const id of outgoing.get(ready.id) ?? []) if (pending.has(id)) {
      incoming.set(id, incoming.get(id)! - 1);
      rank.set(id, Math.max(rank.get(id)!, rank.get(ready.id)! + 1));
    }
  }
  const result: T[][] = [];
  for (const item of items) (result[rank.get(item.id)!] ??= []).push(item);
  // Order siblings by their parents to reduce crossings, retaining stable ties.
  for (let i = 1; i < result.length; i++) {
    const positions = new Map(result[i - 1].map((item, index) => [item.id, index]));
    const center = (item: T) => {
      const parents = edges.filter(edge => edge.to === item.id && positions.has(edge.from)).map(edge => positions.get(edge.from)!);
      return parents.length ? parents.reduce((sum, value) => sum + value, 0) / parents.length : items.indexOf(item);
    };
    result[i].sort((a, b) => center(a) - center(b));
  }
  return result;
}

function flowCards(nodes: BoardNode[], board: BoardDSL) {
  const rows = layers(nodes, board.edges.filter(edge => edge.type !== 'line'));
  const widths = rows.map(row => row.reduce((sum, node) => sum + node.width, 0) + (row.length - 1) * CARD_GAP);
  const width = Math.max(...widths);
  let y = 0;
  rows.forEach((row, i) => {
    let x = (width - widths[i]) / 2;
    for (const node of row) { node.x = x; node.y = y; x += node.width + CARD_GAP; }
    y += Math.max(...row.map(node => node.height)) + 72;
  });
}

/** A large visual and its short notes form one spread, instead of a staircase. */
function sectionCards(nodes: BoardNode[], width: number) {
  let y = 0, index = 0;
  while (index < nodes.length) {
    const first = nodes[index];
    const remaining = nodes.slice(index + 1);
    const asideWidth = width - first.width - CARD_GAP;
    if (first.width >= width * .48 && remaining[0] && remaining[0].width <= asideWidth) {
      first.x = 0; first.y = y; index++;
      let asideY = y;
      while (index < nodes.length && nodes[index].width <= asideWidth && (asideY === y || asideY + nodes[index].height <= y + first.height + CARD_GAP)) {
        const note = nodes[index++]; note.x = first.width + CARD_GAP; note.y = asideY;
        asideY += note.height + CARD_GAP;
      }
      y = Math.max(y + first.height, asideY - CARD_GAP) + CARD_GAP;
      continue;
    }
    const row: BoardNode[] = [];
    let used = 0;
    while (index < nodes.length) {
      const node = nodes[index];
      if (row.length && used + CARD_GAP + node.width > width) break;
      node.x = row.length ? used + CARD_GAP : 0; node.y = y;
      used = node.x + node.width; row.push(node); index++;
      // A wide next item starts its own spread, keeping its annotations nearby.
      if (nodes[index]?.width >= width * .48) break;
    }
    y += Math.max(...row.map(node => node.height)) + CARD_GAP;
  }
}

function directedBoard(board: BoardDSL, nodes: BoardNode[]) {
  const ids = new Set(nodes.map(node => node.id));
  const connected = new Set(board.edges.filter(edge => edge.type !== 'line' && ids.has(edge.from) && ids.has(edge.to) && edge.from !== edge.to).flatMap(edge => [edge.from, edge.to]));
  return nodes.length > 1 && connected.size >= nodes.length * .6;
}

function finish(board: BoardDSL, nodes: BoardNode[], width: number, mode: Composition['mode'], managed: boolean): BoardDSL {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const minimums = intrinsicHeights(board);
  let changed = false;
  const nextNodes = board.nodes.map(before => {
    const after = byId.get(before.id) ?? before;
    if (before.x === after.x && before.y === after.y && before.height === after.height) return before;
    if (after.height !== before.height && minimums[before.id] === undefined) minimums[before.id] = before.height;
    changed = true; return after;
  });
  let next = changed ? withIntrinsicHeights({ ...board, nodes: nextNodes }, minimums) : board;
  if (managed) {
    const composition: Composition = { version: 1, width, mode, positions: Object.fromEntries(nextNodes.map(node => [node.id, { x: node.x, y: node.y, width: node.width }])) };
    if (hasFreePlacement(next) || JSON.stringify(savedComposition(next)) !== JSON.stringify(composition)) next = { ...next, metadata: { ...next.metadata, [PRESENTATION_KEY]: { ...(next.metadata[PRESENTATION_KEY] as object), freePlacement: false, composition } } };
  }
  return next;
}

/** Semantic sections -> measured card packing -> section packing. Rich content stays intact. */
export function composeMeasuredBoard(board: BoardDSL, sizes: RenderedNodeSize[], options: CompositionOptions = {}): BoardDSL {
  if (!board.nodes.length) return board;
  const width = options.availableWidth ?? savedComposition(board)?.width ?? compositionWidth();
  if (!options.movableIds && readSpatialPlan(board) && !options.algorithm) return finish(board, measuredSemanticBoard(board, sizes).nodes, width, 'spatial', true);
  const measurements = new Map(sizes.map(size => [size.id, size]));
  const nodes = board.nodes.map(node => ({ ...node, height: Math.max(node.height, Math.ceil(measurements.get(node.id)?.height ?? node.height)) }));
  const fixed = options.movableIds ? nodes.filter(node => !options.movableIds!.has(node.id)) : [];
  const movable = options.movableIds ? nodes.filter(node => options.movableIds!.has(node.id)) : nodes;
  if (!movable.length) return arrangeMeasuredBoard(board, sizes, options.movableIds);
  // A partially edited group has anchors. Keep its established geometry and user placement.
  const mixedGroup = board.groups.some(group => group.nodeIds.some(id => movable.some(node => node.id === id)) && group.nodeIds.some(id => fixed.some(node => node.id === id)));
  if (mixedGroup) return arrangeMeasuredBoard(board, sizes, options.movableIds);
  const blocks = sectionBlocks(board, movable);
  let mode: Composition['mode'] = !board.groups.length && directedBoard(board, movable) ? 'flow' : 'sections';
  if (options.algorithm) mode = options.algorithm === 'dagre' ? 'flow' : 'sections';
  else if (options.availableWidth === undefined) mode = savedComposition(board)?.mode ?? mode;
  for (const block of blocks) {
    const innerWidth = Math.max(...block.nodes.map(node => node.width), width - (block.grouped ? SIDE * 2 : 0));
    if (mode === 'flow') flowCards(block.nodes, board);
    else sectionCards(block.nodes, innerWidth);
    Object.assign(block, rectOf(block.nodes, block.grouped));
  }
  const owner = new Map(blocks.flatMap(block => block.nodes.map(node => [node.id, block.id] as const)));
  const ordered = layers(blocks, board.edges.filter(edge => edge.type !== 'line').map(edge => ({ from: owner.get(edge.from) ?? '', to: owner.get(edge.to) ?? '' }))).flat();
  const obstacles = sectionBlocks(board, fixed);
  const originX = fixed.length ? Math.min(...obstacles.map(block => block.x)) : 80;
  const originY = fixed.length ? Math.max(...obstacles.map(block => block.y + block.height)) + SECTION_GAP : 80;
  let x = 0, y = 0, rowHeight = 0;
  for (const block of ordered) {
    if (x && x + block.width > width) { x = 0; y += rowHeight + SECTION_GAP; rowHeight = 0; }
    const dx = originX + x - block.x, dy = originY + y - block.y;
    for (const node of block.nodes) { node.x = Math.round(node.x + dx); node.y = Math.round(node.y + dy); }
    x += block.width + SECTION_GAP; rowHeight = Math.max(rowHeight, block.height);
  }
  return finish(board, nodes, width, mode, !options.movableIds);
}

/** Repair legacy staircases, while leaving deliberate small/manual arrangements alone. */
export function needsCompositionRepair(board: BoardDSL) {
  if (hasFreePlacement(board) || savedComposition(board) || board.groups.length < 2) return false;
  const blocks = sectionBlocks(board, board.nodes);
  if (blocks.length < 2 || blocks.some(block => !block.grouped)) return false;
  const area = blocks.reduce((sum, block) => sum + block.width * block.height, 0);
  const extent = rectOf(board.nodes, true);
  const staircase = blocks.every((block, i) => !i || block.x > blocks[i - 1].x + 100 && block.y >= blocks[i - 1].y + blocks[i - 1].height - 10);
  return staircase && area / (extent.width * extent.height) < .6;
}
