import type { BoardDSL, DSLPatch } from '../types/dsl';
import { applyPatch } from '../engine/patch';
import { resetContentMinimums, updateContentMinimums } from '../presentation/metrics';
import { boardVisualErrors } from './contract';

/** Extend validation without changing the established atomic patch engine. */
export function applyVisualPatch(board: BoardDSL, patch: DSLPatch) {
  const outcome = applyPatch(board, resetContentMinimums(board, patch));
  if (!outcome.result.applied) return outcome;
  const errors = boardVisualErrors(outcome.board);
  return errors.length ? { board, result: { applied: false, errors, appliedOps: 0 } } : { ...outcome, board: updateContentMinimums(outcome.board, patch) };
}

/** Preserve user state unless the model explicitly replaces it. */
export function preserveVisualState(board: BoardDSL, patch: DSLPatch): DSLPatch {
  return {
    ...patch,
    ops: patch.ops.map(op => {
      if (op.op !== 'update_node' || !op.changes.visual) return op;
      const current = board.nodes.find(n => n.id === op.nodeId)?.visual;
      return { ...op, changes: { ...op.changes, visual: {
        ...op.changes.visual,
        state: op.changes.visual.state ?? current?.state,
      } } };
    }),
  };
}

export function patchConflicts(base: BoardDSL, current: BoardDSL, patch: DSLPatch): string[] {
  const conflicts: string[] = [];
  for (const op of patch.ops) {
    if (op.op === 'update_node' || op.op === 'delete_node') {
      const before = base.nodes.find(n => n.id === op.nodeId);
      // A node created earlier in this same transaction has no base record.
      if (!before && patch.ops.some(p => p.op === 'add_node' && p.node.id === op.nodeId)) continue;
      const now = current.nodes.find(n => n.id === op.nodeId);
      if (!before || !now) { conflicts.push(op.nodeId); continue; }
      const keys = op.op === 'update_node' ? Object.keys(op.changes) as (keyof typeof before)[] : Object.keys(before) as (keyof typeof before)[];
      if (keys.some(key => JSON.stringify(before[key]) !== JSON.stringify(now[key]))) conflicts.push(op.nodeId);
    }
    if (op.op === 'update_group' || op.op === 'delete_group') {
      if (JSON.stringify(base.groups.find(g => g.id === op.groupId)) !== JSON.stringify(current.groups.find(g => g.id === op.groupId))) conflicts.push(op.groupId);
    }
    if (op.op === 'delete_edge' && JSON.stringify(base.edges.find(e => e.id === op.edgeId)) !== JSON.stringify(current.edges.find(e => e.id === op.edgeId))) conflicts.push(op.edgeId);
    if (op.op === 'layout' && (op.scope === 'all' || patch.ops.length === 1)
      && JSON.stringify(base.nodes) !== JSON.stringify(current.nodes)) conflicts.push('layout');
  }
  return [...new Set(conflicts)];
}
