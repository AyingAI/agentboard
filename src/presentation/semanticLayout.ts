import type { BoardDSL, BoardNode, SpatialItem, SpatialPlan } from '../types/dsl';
import type { RenderedNodeSize } from './layout';
import { inferSpatialPlan, readSpatialPlan } from './spatialPlan';

type Rect = { x: number; y: number; width: number; height: number };
export type MapRegion = Rect & { id: string; title: string; nodeIds: string[] };
type Box = { width: number; height: number; nodes: BoardNode[]; regions: MapRegion[] };
const GAP = 48;
const empty = (): Box => ({ width: 0, height: 0, nodes: [], regions: [] });
const collides = (a: Rect, b: Rect) => a.x < b.x + b.width + 20 && a.x + a.width + 20 > b.x && a.y < b.y + b.height + 20 && a.y + a.height + 20 > b.y;
function shift(box: Box, x: number, y: number): Box {
  return { ...box, nodes: box.nodes.map(node => ({ ...node, x: Math.round(node.x + x), y: Math.round(node.y + y) })), regions: box.regions.map(region => ({ ...region, x: region.x + x, y: region.y + y })) };
}

function pack(direction: 'row' | 'column' | 'orbit', children: Box[]): Box {
  const boxes = children.filter(child => child.nodes.length);
  if (!boxes.length) return empty();
  let placed: Box[];
  if (direction === 'orbit' && boxes.length > 2) {
    const center = boxes[0], rest = boxes.slice(1);
    let rx = Math.max(center.width + GAP, ...rest.map(box => box.width + GAP), rest.length * Math.max(...rest.map(box => box.width)) / Math.PI);
    let ry = Math.max(center.height + GAP, ...rest.map(box => box.height + GAP), rest.length * Math.max(...rest.map(box => box.height)) / Math.PI);
    let positions: Rect[] = [];
    for (let pass = 0; pass < 40; pass++) {
      positions = [{ x: -center.width / 2, y: -center.height / 2, width: center.width, height: center.height }, ...rest.map((box, i) => {
        const angle = -Math.PI / 2 + i * Math.PI * 2 / rest.length;
        return { x: Math.cos(angle) * rx - box.width / 2, y: Math.sin(angle) * ry - box.height / 2, width: box.width, height: box.height };
      })];
      if (!positions.some((box, i) => positions.slice(i + 1).some(other => collides(box, other)))) break;
      rx *= 1.15; ry *= 1.15;
    }
    const minX = Math.min(...positions.map(p => p.x)), minY = Math.min(...positions.map(p => p.y));
    placed = boxes.map((box, i) => shift(box, positions[i].x - minX, positions[i].y - minY));
  } else {
    const horizontal = direction !== 'column';
    const maxWidth = Math.max(...boxes.map(box => box.width));
    let offset = 0;
    placed = boxes.map(box => {
      const positioned = shift(box, horizontal ? offset : (maxWidth - box.width) / 2, horizontal ? 0 : offset);
      offset += (horizontal ? box.width : box.height) + GAP;
      return positioned;
    });
  }
  const nodes = placed.flatMap(box => box.nodes), regions = placed.flatMap(box => box.regions);
  return { nodes, regions, width: Math.max(...nodes.map(node => node.x + node.width), ...regions.map(region => region.x + region.width)), height: Math.max(...nodes.map(node => node.y + node.height), ...regions.map(region => region.y + region.height)) };
}

/** The same semantic plan supports full content geometry and a compact, readable map. */
export function layoutSemanticBoard(board: BoardDSL, compact = false, explicitPlan?: SpatialPlan, compactOptions?: { nodeHeight: number; headingHeight: number }) {
  const plan = explicitPlan ?? readSpatialPlan(board) ?? inferSpatialPlan(board);
  const consumed = new Set<string>();
  const byId = new Map(board.nodes.map(node => [node.id, node]));
  let serial = 0;
  function one(id: string): Box {
    const node = byId.get(id);
    if (!node || consumed.has(id)) return empty();
    consumed.add(id);
    const height = compact ? compactOptions?.nodeHeight ?? 174 : node.height;
    return { nodes: [{ ...node, x: 0, y: 0, width: compact ? 300 : node.width, height }], regions: [], width: compact ? 300 : node.width, height };
  }
  function visit(item: SpatialItem): Box {
    if ('nodeId' in item) return one(item.nodeId);
    if ('groupId' in item) {
      const group = board.groups.find(group => group.id === item.groupId);
      if (!group) return empty();
      const content = pack(item.direction ?? 'column', group.nodeIds.map(one));
      if (!content.nodes.length) return content;
      const heading = compact ? compactOptions?.headingHeight ?? 52 : 52;
      const padded = shift(content, 24, heading);
      return { ...padded, width: content.width + 48, height: content.height + heading + 24, regions: [...padded.regions, { id: group.id, title: group.title, nodeIds: padded.nodes.map(node => node.id), x: 0, y: 0, width: content.width + 48, height: content.height + heading + 24 }] };
    }
    const content = pack(item.direction, item.children.map(visit));
    if (!item.label || !content.nodes.length) return content;
    const heading = compact ? compactOptions?.headingHeight ?? 52 : 52;
    const padded = shift(content, 24, heading);
    return { ...padded, width: content.width + 48, height: content.height + heading + 24, regions: [...padded.regions, { id: `spatial-region-${serial++}`, title: item.label, nodeIds: content.nodes.map(node => node.id), x: 0, y: 0, width: content.width + 48, height: content.height + heading + 24 }] };
  }
  let result = visit(plan.root);
  const unplaced = board.nodes.filter(node => !consumed.has(node.id));
  if (unplaced.length) {
    // Additions remain visible even when an older plan predates them.
    const rows: Box[] = [];
    const columns = Math.max(1, Math.ceil(Math.sqrt(unplaced.length)));
    for (let i = 0; i < unplaced.length; i += columns) rows.push(pack('row', unplaced.slice(i, i + columns).map(node => one(node.id))));
    result = pack('column', [result, pack('column', rows)]);
  }
  const positioned = shift(result, 80, 80);
  const positions = new Map(positioned.nodes.map(node => [node.id, node]));
  return { board: { ...board, nodes: board.nodes.map(node => positions.get(node.id) ?? node) }, regions: positioned.regions, plan };
}

export function measuredSemanticBoard(board: BoardDSL, sizes: RenderedNodeSize[]) {
  const measured = new Map(sizes.map(size => [size.id, size]));
  return layoutSemanticBoard({ ...board, nodes: board.nodes.map(node => ({ ...node, height: Math.max(node.height, measured.get(node.id)?.height ?? node.height) })) }).board;
}

export function mapEdgePath(from: BoardNode, to: BoardNode, nodes: BoardNode[]) {
  const horizontal = Math.abs(to.x - from.x) >= Math.abs(to.y - from.y);
  const forward = horizontal ? to.x >= from.x : to.y >= from.y;
  const start = horizontal ? { x: from.x + (forward ? from.width : 0), y: from.y + from.height / 2 } : { x: from.x + from.width / 2, y: from.y + (forward ? from.height : 0) };
  const end = horizontal ? { x: to.x + (forward ? 0 : to.width), y: to.y + to.height / 2 } : { x: to.x + to.width / 2, y: to.y + (forward ? 0 : to.height) };
  const obstacles = nodes.filter(node => node.id !== from.id && node.id !== to.id);
  const xs = [(start.x + end.x) / 2, ...nodes.flatMap(node => [node.x - 22, node.x + node.width + 22])];
  const ys = [(start.y + end.y) / 2, ...nodes.flatMap(node => [node.y - 22, node.y + node.height + 22])];
  const candidates = [...xs.map(x => [start, { x, y: start.y }, { x, y: end.y }, end]), ...ys.map(y => [start, { x: start.x, y }, { x: end.x, y }, end])];
  const cost = (points: typeof candidates[number]) => points.slice(1).reduce((sum, point, i) => {
    const before = points[i];
    const blocked = obstacles.some(node => before.x === point.x
      ? point.x > node.x - 6 && point.x < node.x + node.width + 6 && Math.max(before.y, point.y) > node.y - 6 && Math.min(before.y, point.y) < node.y + node.height + 6
      : point.y > node.y - 6 && point.y < node.y + node.height + 6 && Math.max(before.x, point.x) > node.x - 6 && Math.min(before.x, point.x) < node.x + node.width + 6);
    return sum + Math.abs(point.x - before.x) + Math.abs(point.y - before.y) + (blocked ? 1e7 : 0);
  }, 0);
  const points = candidates.reduce((best, candidate) => cost(candidate) < cost(best) ? candidate : best);
  return { path: points.map((point, i) => `${i ? 'L' : 'M'}${point.x},${point.y}`).join(' '), label: { x: (points[1].x + points[2].x) / 2, y: (points[1].y + points[2].y) / 2 } };
}
