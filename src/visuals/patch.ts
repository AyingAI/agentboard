import type { BoardDSL, DSLPatch } from '../types/dsl';
import { applyPatch } from '../engine/patch';
import { resetContentMinimums, updateContentMinimums } from '../presentation/metrics';
import { boardVisualErrors } from './contract';
import { spatialPlanError, spatialNodeIds, withSpatialPlan, withoutSpatialPlan, inferSpatialPlan } from '../presentation/spatialPlan';

/** Extend validation without changing the established atomic patch engine. */
export function applyVisualPatch(board: BoardDSL, patch: DSLPatch) {
  const outcome = applyPatch(board, resetContentMinimums(board, patch));
  if (!outcome.result.applied) return outcome;
  const errors = boardVisualErrors(outcome.board);
  const plan = patch.presentation?.plan;
  const planError = plan ? patch.presentation?.layout === 'preserve' ? '空间方案使用 auto；需要保留自定义坐标时，请省略 plan。' : spatialPlanError(plan, outcome.board) : null;
  if (planError) errors.push({ code: 'INVALID_SPATIAL_PLAN', message: planError, refId: 'presentation' });
  const content = updateContentMinimums(outcome.board, patch);
  const next = !plan && (patch.presentation?.layout === 'preserve' || patch.ops.some(op => op.op === 'layout')) ? withoutSpatialPlan(content) : content;
  const complexNewBoard = !board.nodes.length && (next.nodes.length >= 10 || next.nodes.length >= 5 && next.nodes.some(node => node.visual));
  const inferPlan = !plan && complexNewBoard && patch.presentation?.layout !== 'preserve' && !patch.ops.some(op => op.op === 'layout');
  return errors.length ? { board, result: { applied: false, errors, appliedOps: 0 } } : { ...outcome, board: plan ? withSpatialPlan(next, plan) : inferPlan ? withSpatialPlan(next, inferSpatialPlan(next), 'local') : next };
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
  if (patch.presentation?.plan) {
    const ids = spatialNodeIds(patch.presentation.plan, base);
    if (ids.some(id => JSON.stringify(base.nodes.find(node => node.id === id)) !== JSON.stringify(current.nodes.find(node => node.id === id)))
      || JSON.stringify(base.groups) !== JSON.stringify(current.groups) || JSON.stringify(base.edges) !== JSON.stringify(current.edges)) conflicts.push('spatial-plan');
  }
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
