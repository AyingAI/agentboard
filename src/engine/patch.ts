import type { BoardDSL, BoardNode, DSLPatch, PatchResult, ValidationError } from '../types/dsl';
import { validateBoard, validateEdge, validateNode } from './validation';

function cloneBoard(board: BoardDSL): BoardDSL {
  return structuredClone(board);
}

function layoutNodes(nodes: BoardNode[], algorithm: 'horizontal' | 'vertical' | 'dagre' = 'horizontal'): BoardNode[] {
  const startX = 120;
  const startY = 120;
  const gapX = 320;
  const gapY = 190;

  return nodes.map((node, index) => {
    if (algorithm === 'vertical') {
      return { ...node, x: startX, y: startY + index * gapY };
    }
    if (algorithm === 'dagre') {
      const column = index % 3;
      const row = Math.floor(index / 3);
      return { ...node, x: startX + column * gapX, y: startY + row * gapY };
    }
    return { ...node, x: startX + index * gapX, y: startY };
  });
}

export function applyPatch(board: BoardDSL, patch: DSLPatch): { board: BoardDSL; result: PatchResult } {
  const next = cloneBoard(board);
  const errors: ValidationError[] = [];
  let appliedOps = 0;

  for (const [index, op] of patch.ops.entries()) {
    if (op.op === 'add_node') {
      const nodeErrors = validateNode(op.node).map((error) => ({ ...error, opIndex: index }));
      if (next.nodes.some((node) => node.id === op.node.id)) {
        nodeErrors.push({
          code: 'PATCH_DUPLICATE_NODE',
          message: `patch 试图新增重复节点 "${op.node.id}"`,
          opIndex: index,
          refId: op.node.id,
        });
      }
      if (nodeErrors.length > 0) {
        errors.push(...nodeErrors);
        continue;
      }
      next.nodes.push(op.node);
      appliedOps += 1;
    }

    if (op.op === 'update_node') {
      const nodeIndex = next.nodes.findIndex((node) => node.id === op.nodeId);
      if (nodeIndex === -1) {
        errors.push({
          code: 'PATCH_NODE_NOT_FOUND',
          message: `patch 试图更新不存在的节点 "${op.nodeId}"`,
          opIndex: index,
          refId: op.nodeId,
        });
        continue;
      }
      const candidate = { ...next.nodes[nodeIndex], ...op.changes, id: op.nodeId };
      const nodeErrors = validateNode(candidate).map((error) => ({ ...error, opIndex: index }));
      if (nodeErrors.length > 0) {
        errors.push(...nodeErrors);
        continue;
      }
      next.nodes[nodeIndex] = candidate;
      appliedOps += 1;
    }

    if (op.op === 'delete_node') {
      const before = next.nodes.length;
      next.nodes = next.nodes.filter((node) => node.id !== op.nodeId);
      next.edges = next.edges.filter((edge) => edge.from !== op.nodeId && edge.to !== op.nodeId);
      next.groups = next.groups.map((group) => ({
        ...group,
        nodeIds: group.nodeIds.filter((nodeId) => nodeId !== op.nodeId),
      }));
      if (next.nodes.length === before) {
        errors.push({
          code: 'PATCH_NODE_NOT_FOUND',
          message: `patch 试图删除不存在的节点 "${op.nodeId}"`,
          opIndex: index,
          refId: op.nodeId,
        });
        continue;
      }
      appliedOps += 1;
    }

    if (op.op === 'add_edge') {
      const nodeIds = new Set(next.nodes.map((node) => node.id));
      const edgeErrors = validateEdge(op.edge, nodeIds).map((error) => ({ ...error, opIndex: index }));
      if (next.edges.some((edge) => edge.id === op.edge.id)) {
        edgeErrors.push({
          code: 'PATCH_DUPLICATE_EDGE',
          message: `patch 试图新增重复连线 "${op.edge.id}"`,
          opIndex: index,
          refId: op.edge.id,
        });
      }
      if (edgeErrors.length > 0) {
        errors.push(...edgeErrors);
        continue;
      }
      next.edges.push(op.edge);
      appliedOps += 1;
    }

    if (op.op === 'delete_edge') {
      const before = next.edges.length;
      next.edges = next.edges.filter((edge) => edge.id !== op.edgeId);
      if (next.edges.length === before) {
        errors.push({
          code: 'PATCH_EDGE_NOT_FOUND',
          message: `patch 试图删除不存在的连线 "${op.edgeId}"`,
          opIndex: index,
          refId: op.edgeId,
        });
        continue;
      }
      appliedOps += 1;
    }

    if (op.op === 'layout') {
      next.nodes = layoutNodes(next.nodes, op.algorithm);
      appliedOps += 1;
    }
  }

  const boardErrors = validateBoard(next);
  if (boardErrors.length > 0) {
    return {
      board,
      result: {
        applied: false,
        errors: [...errors, ...boardErrors],
        appliedOps: 0,
      },
    };
  }

  if (errors.length > 0) {
    return {
      board,
      result: {
        applied: false,
        errors,
        appliedOps: 0,
      },
    };
  }

  return {
    board: next,
    result: {
      applied: true,
      errors: [],
      appliedOps,
    },
  };
}
