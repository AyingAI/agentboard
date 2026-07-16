import type { DSLPatch, PatchOp } from '../types/dsl';

export type PatchRiskReason =
  | 'delete_node'
  | 'delete_group'
  | 'rewrite_content'
  | 'full_board_layout';

export interface PatchRiskAssessment {
  requiresConfirmation: boolean;
  reasons: PatchRiskReason[];
  counts: Record<PatchOp['op'], number>;
}

const EMPTY_COUNTS: Record<PatchOp['op'], number> = {
  add_node: 0,
  update_node: 0,
  delete_node: 0,
  add_edge: 0,
  delete_edge: 0,
  add_group: 0,
  update_group: 0,
  delete_group: 0,
  layout: 0,
};

function rewritesContent(op: PatchOp) {
  return op.op === 'update_node'
    && (Object.prototype.hasOwnProperty.call(op.changes, 'title')
      || Object.prototype.hasOwnProperty.call(op.changes, 'body'));
}

export function assessPatchRisk(patch: DSLPatch): PatchRiskAssessment {
  const counts = { ...EMPTY_COUNTS };
  const reasons = new Set<PatchRiskReason>();

  for (const op of patch.ops) {
    counts[op.op] += 1;
    if (op.op === 'delete_node') reasons.add('delete_node');
    if (op.op === 'delete_group') reasons.add('delete_group');
    if (rewritesContent(op)) reasons.add('rewrite_content');
    if (op.op === 'layout' && op.scope === 'all') reasons.add('full_board_layout');
  }

  return {
    requiresConfirmation: reasons.size > 0,
    reasons: [...reasons],
    counts,
  };
}
