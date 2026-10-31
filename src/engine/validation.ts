import type { BoardDSL, BoardNode, BoardEdge, BoardGroup, ValidationError } from '../types/dsl';

/** Validate a complete board DSL - checks structural integrity */
export function validateBoard(board: BoardDSL): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!board || typeof board !== 'object' || Array.isArray(board)) {
    return [{ code: 'INVALID_BOARD', message: '白板必须是对象' }];
  }

  // ── Basic structure ──
  if (typeof board.version !== 'string' || !board.version.trim()) {
    errors.push({ code: 'MISSING_VERSION', message: 'DSL 缺少 version 字段' });
  }
  if (!board.board || typeof board.board !== 'object' || Array.isArray(board.board)) {
    errors.push({ code: 'MISSING_BOARD', message: 'DSL 缺少 board 元数据' });
  } else {
    if (typeof board.board.id !== 'string' || !board.board.id.trim() || typeof board.board.title !== 'string') {
      errors.push({ code: 'INVALID_BOARD_META', message: '白板 id 和标题必须是有效文本' });
    }
    const viewport = board.board.viewport;
    if (!viewport || !Number.isFinite(viewport.x) || !Number.isFinite(viewport.y) || !Number.isFinite(viewport.zoom) || viewport.zoom <= 0) {
      errors.push({ code: 'INVALID_VIEWPORT', message: '白板视口必须包含有效坐标和正数缩放' });
    }
  }
  if (!Array.isArray(board.nodes)) {
    errors.push({ code: 'NODES_NOT_ARRAY', message: 'nodes 必须是数组' });
    return errors; // can't continue without nodes array
  }
  if (!Array.isArray(board.edges)) {
    errors.push({ code: 'EDGES_NOT_ARRAY', message: 'edges 必须是数组' });
    return errors;
  }
  if (!board.metadata || typeof board.metadata !== 'object' || Array.isArray(board.metadata)) {
    errors.push({ code: 'INVALID_METADATA', message: 'metadata 必须是对象' });
  }

  // ── Node validations ──
  const nodeIds = new Set<string>();
  for (const node of board.nodes) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
      errors.push({ code: 'INVALID_NODE', message: '节点必须是对象' });
      continue;
    }
    // Must have id
    if (typeof node.id !== 'string' || !node.id.trim()) {
      errors.push({ code: 'NODE_MISSING_ID', message: '节点缺少 id', refId: node.id || '(unknown)' });
      continue;
    }
    // Duplicate id
    if (nodeIds.has(node.id)) {
      errors.push({ code: 'NODE_DUPLICATE_ID', message: `节点 id "${node.id}" 重复`, refId: node.id });
    }
    nodeIds.add(node.id);

    // Type must be valid
    if (!['card', 'note'].includes(node.type)) {
      errors.push({ code: 'NODE_INVALID_TYPE', message: `节点 "${node.id}" 类型无效: ${node.type}`, refId: node.id });
    }

    // Title required
    if (typeof node.title !== 'string' || !node.title.trim()) {
      errors.push({ code: 'NODE_MISSING_TITLE', message: `节点 "${node.id}" 缺少标题`, refId: node.id });
    }

    // Positive dimensions
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) {
      errors.push({ code: 'NODE_INVALID_POSITION', message: `节点 "${node.id}" 坐标必须是有效数字`, refId: node.id });
    }
    if (typeof node.body !== 'string') {
      errors.push({ code: 'NODE_INVALID_BODY', message: `节点 "${node.id}" 正文必须是文本`, refId: node.id });
    }
    if (node.tags !== undefined && (!Array.isArray(node.tags) || node.tags.some(tag => typeof tag !== 'string'))) {
      errors.push({ code: 'NODE_INVALID_TAGS', message: `节点 "${node.id}" 标签必须是文本数组`, refId: node.id });
    }
    if (!Number.isFinite(node.width) || node.width <= 0) {
      errors.push({ code: 'NODE_INVALID_WIDTH', message: `节点 "${node.id}" 宽度必须 > 0`, refId: node.id });
    }
    if (!Number.isFinite(node.height) || node.height <= 0) {
      errors.push({ code: 'NODE_INVALID_HEIGHT', message: `节点 "${node.id}" 高度必须 > 0`, refId: node.id });
    }
  }

  if (!Array.isArray(board.groups)) {
    errors.push({ code: 'GROUPS_NOT_ARRAY', message: 'groups 必须是数组' });
  } else {
    const groupIds = new Set<string>();
    for (const group of board.groups) {
      if (!group || typeof group !== 'object' || Array.isArray(group)) {
        errors.push({ code: 'INVALID_GROUP', message: '分组必须是对象' });
        continue;
      }
      if (typeof group.id !== 'string' || !group.id.trim()) {
        errors.push({ code: 'GROUP_MISSING_ID', message: '分组缺少 id' });
        continue;
      }
      if (groupIds.has(group.id)) {
        errors.push({ code: 'GROUP_DUPLICATE_ID', message: `分组 id "${group.id}" 重复`, refId: group.id });
      }
      groupIds.add(group.id);
      if (typeof group.title !== 'string' || !group.title.trim()) {
        errors.push({ code: 'GROUP_MISSING_TITLE', message: `分组 "${group.id}" 缺少标题`, refId: group.id });
      }
      if (!Array.isArray(group.nodeIds)) {
        errors.push({ code: 'GROUP_NODE_IDS_NOT_ARRAY', message: `分组 "${group.id}" 的 nodeIds 必须是数组`, refId: group.id });
        continue;
      }
      for (const containedId of group.nodeIds) {
        if (!nodeIds.has(containedId)) {
          errors.push({
            code: 'GROUP_INVALID_REF',
            message: `分组 "${group.id}" 引用了不存在的节点 "${containedId}"`,
            refId: group.id,
          });
        }
      }
    }
  }

  // ── Edge validations ──
  const edgeIds = new Set<string>();
  for (const edge of board.edges) {
    if (!edge || typeof edge !== 'object' || Array.isArray(edge)) {
      errors.push({ code: 'INVALID_EDGE', message: '连线必须是对象' });
      continue;
    }
    if (typeof edge.id !== 'string' || !edge.id.trim()) {
      errors.push({ code: 'EDGE_MISSING_ID', message: '连线缺少 id' });
      continue;
    }
    if (edgeIds.has(edge.id)) {
      errors.push({ code: 'EDGE_DUPLICATE_ID', message: `连线 id "${edge.id}" 重复`, refId: edge.id });
    }
    edgeIds.add(edge.id);
    if (edge.label !== undefined && typeof edge.label !== 'string') {
      errors.push({ code: 'EDGE_INVALID_LABEL', message: `连线 "${edge.id}" 标签必须是文本`, refId: edge.id });
    }

    // from/to must exist
    if (!edge.from) {
      errors.push({ code: 'EDGE_MISSING_FROM', message: `连线 "${edge.id}" 缺少 from`, refId: edge.id });
    } else if (!nodeIds.has(edge.from)) {
      errors.push({ code: 'EDGE_INVALID_FROM', message: `连线 "${edge.id}" 的 from "${edge.from}" 不存在`, refId: edge.id });
    }

    if (!edge.to) {
      errors.push({ code: 'EDGE_MISSING_TO', message: `连线 "${edge.id}" 缺少 to`, refId: edge.id });
    } else if (!nodeIds.has(edge.to)) {
      errors.push({ code: 'EDGE_INVALID_TO', message: `连线 "${edge.id}" 的 to "${edge.to}" 不存在`, refId: edge.id });
    }
  }

  return errors;
}

/** Validate a single node (for add/update) */
export function validateNode(node: Partial<BoardNode> & { id?: string }, checkId = true): ValidationError[] {
  const errors: ValidationError[] = [];
  if (checkId && !node.id) {
    errors.push({ code: 'NODE_MISSING_ID', message: '节点缺少 id' });
  }
  if (node.type && !['card', 'note'].includes(node.type)) {
    errors.push({ code: 'NODE_INVALID_TYPE', message: `节点类型无效: ${node.type}`, refId: node.id });
  }
  if (node.title !== undefined && !node.title.trim()) {
    errors.push({ code: 'NODE_MISSING_TITLE', message: `节点 "${node.id}" 缺少标题`, refId: node.id });
  }
  if (node.width !== undefined && node.width <= 0) {
    errors.push({ code: 'NODE_INVALID_WIDTH', message: `节点 "${node.id}" 宽度必须 > 0`, refId: node.id });
  }
  if (node.height !== undefined && node.height <= 0) {
    errors.push({ code: 'NODE_INVALID_HEIGHT', message: `节点 "${node.id}" 高度必须 > 0`, refId: node.id });
  }
  return errors;
}

/** Validate a single edge (for add) */
export function validateEdge(edge: Partial<BoardEdge> & { id?: string }, nodeIds: Set<string>): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!edge.id) {
    errors.push({ code: 'EDGE_MISSING_ID', message: '连线缺少 id' });
  }
  if (!edge.from) {
    errors.push({ code: 'EDGE_MISSING_FROM', message: `连线 "${edge.id}" 缺少 from`, refId: edge.id });
  } else if (!nodeIds.has(edge.from)) {
    errors.push({ code: 'EDGE_INVALID_FROM', message: `连线 "${edge.id}" 的 from "${edge.from}" 不存在`, refId: edge.id });
  }
  if (!edge.to) {
    errors.push({ code: 'EDGE_MISSING_TO', message: `连线 "${edge.id}" 缺少 to`, refId: edge.id });
  } else if (!nodeIds.has(edge.to)) {
    errors.push({ code: 'EDGE_INVALID_TO', message: `连线 "${edge.id}" 的 to "${edge.to}" 不存在`, refId: edge.id });
  }
  return errors;
}

/** Validate a single group (for add/update). Checks id, title, nodeIds array, and node refs. */
export function validateGroup(
  group: Partial<BoardGroup> & { id?: string },
  nodeIds: Set<string>,
  checkId = true,
): ValidationError[] {
  const errors: ValidationError[] = [];
  if (checkId && !group.id) {
    errors.push({ code: 'GROUP_MISSING_ID', message: '分组缺少 id' });
  }
  if (group.title !== undefined && !group.title.trim()) {
    errors.push({ code: 'GROUP_MISSING_TITLE', message: `分组 "${group.id}" 缺少标题`, refId: group.id });
  }
  if (group.nodeIds !== undefined) {
    if (!Array.isArray(group.nodeIds)) {
      errors.push({ code: 'GROUP_NODE_IDS_NOT_ARRAY', message: `分组 "${group.id}" 的 nodeIds 必须是数组`, refId: group.id });
    } else {
      for (const containedId of group.nodeIds) {
        if (!nodeIds.has(containedId)) {
          errors.push({
            code: 'GROUP_INVALID_REF',
            message: `分组 "${group.id}" 引用了不存在的节点 "${containedId}"`,
            refId: group.id,
          });
        }
      }
    }
  }
  return errors;
}
