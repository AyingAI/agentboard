import type { BoardDSL, BoardEdge, BoardGroup, BoardNode, DSLPatch, LayoutAlgorithm, PatchResult, ValidationError } from '../types/dsl';
import { validateBoard, validateEdge, validateGroup, validateNode } from './validation';

function cloneBoard(board: BoardDSL): BoardDSL {
  return structuredClone(board);
}

const START_X = 120;
const START_Y = 120;
const GAP_X = 96;
const GAP_Y = 78;
const MIN_VISUAL_GAP = 56;

function positionNode(node: BoardNode, x: number, y: number): BoardNode {
  return { ...node, x: Math.round(x), y: Math.round(y) };
}

function nodeStepX(node: BoardNode) {
  return node.width + GAP_X;
}

function nodeStepY(node: BoardNode) {
  return node.height + GAP_Y;
}

function doRectsOverlap(a: BoardNode, b: BoardNode, gap = MIN_VISUAL_GAP) {
  return !(
    a.x + a.width + gap <= b.x ||
    b.x + b.width + gap <= a.x ||
    a.y + a.height + gap <= b.y ||
    b.y + b.height + gap <= a.y
  );
}

function resolveOverlaps(nodes: BoardNode[], movableNodeIds?: Set<string>): BoardNode[] {
  if (movableNodeIds && movableNodeIds.size === 0) return nodes;

  const placed: BoardNode[] = movableNodeIds
    ? nodes.filter((node) => !movableNodeIds.has(node.id)).sort((a, b) => a.y - b.y || a.x - b.x)
    : [];
  const candidates = movableNodeIds
    ? nodes.filter((node) => movableNodeIds.has(node.id))
    : nodes;

  for (const node of [...candidates].sort((a, b) => a.y - b.y || a.x - b.x)) {
    let candidate = { ...node };
    let attempts = 0;

    while (placed.some((existing) => doRectsOverlap(candidate, existing)) && attempts < 200) {
      const blockers = placed.filter((existing) => doRectsOverlap(candidate, existing));
      const nextY = Math.max(...blockers.map((existing) => existing.y + existing.height + GAP_Y));
      candidate = positionNode(candidate, candidate.x, Math.max(candidate.y + 24, nextY));
      attempts += 1;

      if (attempts % 24 === 0) {
        candidate = positionNode(candidate, candidate.x + nodeStepX(candidate), START_Y);
      }
    }

    placed.push(candidate);
  }

  const byId = new Map(placed.map((node) => [node.id, node]));
  return nodes.map((node) => byId.get(node.id) ?? node);
}

function layoutHorizontal(nodes: BoardNode[]) {
  const startX = 120;
  const startY = 120;
  let cursorX = startX;
  return nodes.map((node) => {
    const next = positionNode(node, cursorX, startY);
    cursorX += nodeStepX(node);
    return next;
  });
}

function layoutVertical(nodes: BoardNode[]) {
  let cursorY = START_Y;
  return nodes.map((node) => {
    const next = positionNode(node, START_X, cursorY);
    cursorY += nodeStepY(node);
    return next;
  });
}

function layoutGrid(nodes: BoardNode[], columns = 3) {
  const columnWidths = Array.from({ length: columns }, (_, column) =>
    Math.max(240, ...nodes.filter((_, index) => index % columns === column).map((node) => node.width)),
  );
  const rowHeights: number[] = [];
  for (let row = 0; row < Math.ceil(nodes.length / columns); row += 1) {
    rowHeights[row] = Math.max(110, ...nodes.slice(row * columns, row * columns + columns).map((node) => node.height));
  }

  return nodes.map((node, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = START_X + columnWidths.slice(0, column).reduce((sum, width) => sum + width + GAP_X, 0);
    const y = START_Y + rowHeights.slice(0, row).reduce((sum, height) => sum + height + GAP_Y, 0);
    return positionNode(node, x, y);
  });
}

function layoutTimeline(nodes: BoardNode[]) {
  return layoutHorizontal(nodes).map((node, index) => ({
    ...node,
    y: START_Y + (index % 2) * 34,
  }));
}

function layoutMindmap(nodes: BoardNode[], edges: BoardEdge[]) {
  if (nodes.length <= 2) return layoutHorizontal(nodes);

  const degree = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of edges) {
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
  }

  const hub = [...nodes].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0))[0];
  const others = nodes.filter((node) => node.id !== hub.id);
  const centerX = 520;
  const centerY = 340;
  const radiusX = Math.max(420, others.length * 42);
  const radiusY = Math.max(230, others.length * 28);

  return nodes.map((node) => {
    if (node.id === hub.id) return positionNode(node, centerX, centerY);
    const index = others.findIndex((item) => item.id === node.id);
    const angle = (-Math.PI / 2) + (index / Math.max(1, others.length)) * Math.PI * 2;
    return positionNode(
      node,
      centerX + Math.cos(angle) * radiusX,
      centerY + Math.sin(angle) * radiusY,
    );
  });
}

function layoutCluster(nodes: BoardNode[], groups: BoardGroup[]) {
  if (groups.length === 0) return layoutGrid(nodes, 3);

  const assigned = new Set(groups.flatMap((group) => group.nodeIds));
  const ungrouped = nodes.filter((node) => !assigned.has(node.id));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const positioned = new Map<string, BoardNode>();

  groups.forEach((group, groupIndex) => {
    const groupNodes = group.nodeIds.map((id) => byId.get(id)).filter(Boolean) as BoardNode[];
    const baseX = START_X + groupIndex * 420;
    let cursorY = START_Y + 70;
    groupNodes.forEach((node) => {
      positioned.set(node.id, positionNode(node, baseX, cursorY));
      cursorY += nodeStepY(node);
    });
  });

  layoutGrid(ungrouped, 3).forEach((node) => {
    positioned.set(node.id, positionNode(node, node.x, node.y + 360));
  });

  return nodes.map((node) => positioned.get(node.id) ?? node);
}

function layoutSwimlane(nodes: BoardNode[], groups: BoardGroup[]) {
  if (groups.length === 0) return layoutVertical(nodes);

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const positioned = new Map<string, BoardNode>();

  groups.forEach((group, groupIndex) => {
    let cursorX = START_X + 40;
    const baseY = START_Y + groupIndex * 260 + 70;
    group.nodeIds.forEach((id) => {
      const node = byId.get(id);
      if (!node) return;
      positioned.set(node.id, positionNode(node, cursorX, baseY));
      cursorX += nodeStepX(node);
    });
  });

  const unassigned = nodes.filter((node) => !positioned.has(node.id));
  layoutHorizontal(unassigned).forEach((node) => positioned.set(node.id, positionNode(node, node.x, node.y + groups.length * 260)));

  return nodes.map((node) => positioned.get(node.id) ?? node);
}

function layoutNodes(
  nodes: BoardNode[],
  algorithm: LayoutAlgorithm = 'horizontal',
  edges: BoardEdge[] = [],
  groups: BoardGroup[] = [],
): BoardNode[] {
  if (nodes.length <= 1) return nodes;

  const laidOut = (() => {
    if (algorithm === 'vertical') return layoutVertical(nodes);
    if (algorithm === 'dagre') return layoutGrid(nodes, 3);
    if (algorithm === 'matrix') return layoutGrid(nodes, 2);
    if (algorithm === 'timeline') return layoutTimeline(nodes);
    if (algorithm === 'mindmap') return layoutMindmap(nodes, edges);
    if (algorithm === 'cluster') return layoutCluster(nodes, groups);
    if (algorithm === 'swimlane') return layoutSwimlane(nodes, groups);
    return layoutHorizontal(nodes);
  })();

  return resolveOverlaps(laidOut);
}

export function applyPatch(board: BoardDSL, patch: DSLPatch): { board: BoardDSL; result: PatchResult } {
  const next = cloneBoard(board);
  const errors: ValidationError[] = [];
  let appliedOps = 0;
  let shouldResolveLayout = false;
  const changedNodeIds = new Set<string>();
  const patchHasNonLayoutOps = patch.ops.some((op) => op.op !== 'layout');

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
      shouldResolveLayout = true;
      changedNodeIds.add(op.node.id);
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
      if (
        op.changes.x !== undefined ||
        op.changes.y !== undefined ||
        op.changes.width !== undefined ||
        op.changes.height !== undefined
      ) {
        shouldResolveLayout = true;
        changedNodeIds.add(op.nodeId);
      }
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
      changedNodeIds.delete(op.nodeId);
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

    if (op.op === 'add_group') {
      const nodeIds = new Set(next.nodes.map((node) => node.id));
      const groupErrors = validateGroup(op.group, nodeIds).map((error) => ({ ...error, opIndex: index }));
      if (next.groups.some((group) => group.id === op.group.id)) {
        groupErrors.push({
          code: 'PATCH_DUPLICATE_GROUP',
          message: `patch 试图新增重复分组 "${op.group.id}"`,
          opIndex: index,
          refId: op.group.id,
        });
      }
      if (groupErrors.length > 0) {
        errors.push(...groupErrors);
        continue;
      }
      next.groups.push(op.group);
      appliedOps += 1;
    }

    if (op.op === 'update_group') {
      const groupIndex = next.groups.findIndex((group) => group.id === op.groupId);
      if (groupIndex === -1) {
        errors.push({
          code: 'PATCH_GROUP_NOT_FOUND',
          message: `patch 试图更新不存在的分组 "${op.groupId}"`,
          opIndex: index,
          refId: op.groupId,
        });
        continue;
      }
      const candidate = { ...next.groups[groupIndex], ...op.changes, id: op.groupId };
      const nodeIds = new Set(next.nodes.map((node) => node.id));
      const groupErrors = validateGroup(candidate, nodeIds).map((error) => ({ ...error, opIndex: index }));
      if (groupErrors.length > 0) {
        errors.push(...groupErrors);
        continue;
      }
      next.groups[groupIndex] = candidate;
      appliedOps += 1;
    }

    if (op.op === 'delete_group') {
      const before = next.groups.length;
      next.groups = next.groups.filter((group) => group.id !== op.groupId);
      if (next.groups.length === before) {
        errors.push({
          code: 'PATCH_GROUP_NOT_FOUND',
          message: `patch 试图删除不存在的分组 "${op.groupId}"`,
          opIndex: index,
          refId: op.groupId,
        });
        continue;
      }
      appliedOps += 1;
    }

    if (op.op === 'layout') {
      if (op.scope === 'all' || !patchHasNonLayoutOps) {
        next.nodes = layoutNodes(next.nodes, op.algorithm, next.edges, next.groups);
        changedNodeIds.clear();
      } else {
        next.nodes = resolveOverlaps(next.nodes, changedNodeIds);
      }
      appliedOps += 1;
      shouldResolveLayout = false;
    }
  }

  if (shouldResolveLayout) {
    next.nodes = resolveOverlaps(next.nodes, changedNodeIds);
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
