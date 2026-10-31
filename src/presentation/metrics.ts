import type { BoardDSL, DSLPatch } from '../types/dsl';

const KEY = 'agentboard.presentation';
export function intrinsicHeights(board: BoardDSL): Record<string, number> {
  const stored = (board.metadata[KEY] as { minHeights?: Record<string, unknown> } | undefined)?.minHeights;
  if (!stored || typeof stored !== 'object') return Object.create(null);
  return Object.assign(Object.create(null), Object.fromEntries(Object.entries(stored).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] > 0)));
}
export function withIntrinsicHeights(board: BoardDSL, heights: Record<string, number>): BoardDSL {
  const valid = Object.fromEntries(Object.entries(heights).filter(([id]) => board.nodes.some(node => node.id === id)));
  if (!Object.keys(valid).length && !board.metadata[KEY]) return board;
  return { ...board, metadata: { ...board.metadata, [KEY]: { minHeights: valid } } };
}
/** Measured height is geometry, not a new permanent content minimum. */
export function resetContentMinimums(board: BoardDSL, patch: DSLPatch): DSLPatch {
  const heights = intrinsicHeights(board);
  return { ...patch, ops: patch.ops.map(op => {
    if (op.op !== 'update_node' || op.changes.height !== undefined || !heights[op.nodeId]) return op;
    if (op.changes.body === undefined && op.changes.title === undefined && op.changes.visual === undefined) return op;
    return { ...op, changes: { ...op.changes, height: heights[op.nodeId] } };
  }) };
}
export function updateContentMinimums(board: BoardDSL, patch: DSLPatch): BoardDSL {
  const heights = intrinsicHeights(board);
  for (const op of patch.ops) {
    if (op.op === 'add_node') heights[op.node.id] = op.node.height;
    if (op.op === 'update_node' && op.changes.height !== undefined) heights[op.nodeId] = op.changes.height;
  }
  return withIntrinsicHeights(board, heights);
}
