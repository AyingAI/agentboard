import type { AgentTaskPolicy, BoardDSL, DSLPatch, PatchOp } from '../types/dsl';

export interface PolicyViolation {
  opIndex: number;
  op: PatchOp['op'];
  message: string;
}

export function defaultTaskPolicy(selectedNodeIds: string[]): AgentTaskPolicy {
  return {
    scope: selectedNodeIds.length > 0 ? 'selection' : 'board',
    selectedNodeIds,
    allowExistingEdits: true,
    allowDelete: false,
    allowFullBoardLayout: false,
  };
}

export function validatePatchPolicy(patch: DSLPatch, policy: AgentTaskPolicy, board?: BoardDSL): PolicyViolation[] {
  const selectedIds = new Set(policy.selectedNodeIds);
  const addedIds = new Set(patch.ops.flatMap(op => op.op === 'add_node' ? [op.node.id] : []));
  const inScope = (id: string) => selectedIds.has(id) || addedIds.has(id);
  const violations: PolicyViolation[] = [];

  patch.ops.forEach((op, opIndex) => {
    if (!policy.allowDelete && (op.op === 'delete_node' || op.op === 'delete_edge' || op.op === 'delete_group')) {
      violations.push({ opIndex, op: op.op, message: '当前权限不允许删除白板内容。' });
    }

    if (!policy.allowExistingEdits && (op.op === 'update_node' || op.op === 'update_group')) {
      violations.push({ opIndex, op: op.op, message: '当前权限只允许新增内容，不允许修改现有内容。' });
    }

    if (!policy.allowFullBoardLayout && op.op === 'layout' && op.scope === 'all') {
      violations.push({ opIndex, op: op.op, message: '当前权限不允许重新整理整张白板。' });
    }

    if (policy.scope === 'selection') {
      if ((op.op === 'update_node' || op.op === 'delete_node') && !inScope(op.nodeId)) {
        violations.push({ opIndex, op: op.op, message: `节点 ${op.nodeId} 不在当前选择范围内。` });
      }
      if (op.op === 'add_edge' && (!inScope(op.edge.from) || !inScope(op.edge.to))) {
        violations.push({ opIndex, op: op.op, message: '连线包含当前选择范围之外的节点。' });
      }
      if (op.op === 'delete_edge') {
        const edge = board?.edges.find(edge => edge.id === op.edgeId)
          ?? patch.ops.flatMap(item => item.op === 'add_edge' ? [item.edge] : []).find(edge => edge.id === op.edgeId);
        if (!edge || !inScope(edge.from) || !inScope(edge.to)) violations.push({ opIndex, op: op.op, message: `连线 ${op.edgeId} 不在当前选择范围内。` });
      }
      if (op.op === 'add_group' && op.group.nodeIds.some(id => !inScope(id))) {
        violations.push({ opIndex, op: op.op, message: '新分组包含当前选择范围之外的节点。' });
      }
      if (op.op === 'update_group' || op.op === 'delete_group') {
        const group = board?.groups.find(group => group.id === op.groupId)
          ?? patch.ops.flatMap(item => item.op === 'add_group' ? [item.group] : []).find(group => group.id === op.groupId);
        const members = [...(group?.nodeIds ?? []), ...(op.op === 'update_group' ? op.changes.nodeIds ?? [] : [])];
        if (!group || members.some(id => !inScope(id))) violations.push({ opIndex, op: op.op, message: `分组 ${op.groupId} 不在当前选择范围内。` });
      }
      if (op.op === 'layout' && op.scope === 'all') {
        violations.push({ opIndex, op: op.op, message: '选中节点模式不能应用全图布局。' });
      }
    }
  });

  return violations;
}

export function describeTaskPolicy(policy: AgentTaskPolicy) {
  const scope = policy.scope === 'selection'
    ? `Only work around the selected nodes: ${policy.selectedNodeIds.join(', ')}.`
    : 'The whole board is in scope.';
  const permissions = [
    policy.allowExistingEdits
      ? 'You may update existing content when needed.'
      : 'Do not update existing nodes or groups; only add new content and connections.',
    policy.allowDelete
      ? 'Deletion is allowed when clearly necessary.'
      : 'Do not emit delete_node, delete_edge, or delete_group operations.',
    policy.allowFullBoardLayout
      ? 'A full-board layout is allowed when it serves the request.'
      : 'Do not emit a layout operation with scope "all".',
  ];

  return `Task scope and permissions:\n- ${scope}\n- ${permissions.join('\n- ')}`;
}
