import type { BoardDSL, DSLPatch, PatchOp } from '../types/dsl';

export interface PatchChangeSummary {
  counts: Record<PatchOp['op'], number>;
  labels: string[];
  affectedNodeIds: string[];
  affectedEdgeIds: string[];
  affectedGroupIds: string[];
}

const OP_LABELS: Record<PatchOp['op'], string> = {
  add_node: '新增节点',
  update_node: '修改节点',
  delete_node: '删除节点',
  add_edge: '新增连线',
  delete_edge: '删除连线',
  add_group: '新增分组',
  update_group: '修改分组',
  delete_group: '删除分组',
  layout: '布局调整',
};

function emptyCounts(): Record<PatchOp['op'], number> {
  return {
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
}

export function summarizePatchChanges(patch: DSLPatch, resultBoard: BoardDSL): PatchChangeSummary {
  const counts = emptyCounts();
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  const groupIds = new Set<string>();

  for (const op of patch.ops) {
    counts[op.op] += 1;
    if (op.op === 'add_node') nodeIds.add(op.node.id);
    if (op.op === 'update_node' || op.op === 'delete_node') nodeIds.add(op.nodeId);
    if (op.op === 'add_edge') edgeIds.add(op.edge.id);
    if (op.op === 'delete_edge') edgeIds.add(op.edgeId);
    if (op.op === 'add_group') groupIds.add(op.group.id);
    if (op.op === 'update_group' || op.op === 'delete_group') groupIds.add(op.groupId);
    if (op.op === 'layout' && op.scope === 'all') {
      resultBoard.nodes.forEach((node) => nodeIds.add(node.id));
    }
  }

  return {
    counts,
    labels: Object.entries(counts)
      .filter(([, count]) => count > 0)
      .map(([op, count]) => `${OP_LABELS[op as PatchOp['op']]} ${count}`),
    affectedNodeIds: [...nodeIds],
    affectedEdgeIds: [...edgeIds],
    affectedGroupIds: [...groupIds],
  };
}
