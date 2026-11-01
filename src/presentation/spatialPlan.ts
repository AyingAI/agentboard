import { SPATIAL_DIRECTIONS, type BoardDSL, type BoardNode, type SpatialItem, type SpatialPlan } from '../types/dsl';
import { PRESENTATION_KEY } from './metrics';

export function spatialPlanError(value: unknown, board?: BoardDSL): string | null {
  if (!value || typeof value !== 'object' || typeof (value as SpatialPlan).description !== 'string' || !(value as SpatialPlan).description.trim()) return '空间布局需要说明内容关系。';
  const seen = new Set<string>();
  function visit(value: unknown, depth = 0): string | null {
    if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 32) return '空间布局结构无效。';
    const item = value as Record<string, unknown>;
    const discriminants = [item.nodeId !== undefined, item.groupId !== undefined, item.children !== undefined].filter(Boolean).length;
    if (discriminants !== 1) return '每个布局项只能引用节点、分组，或组合其他布局项。';
    if (item.direction !== undefined && !(SPATIAL_DIRECTIONS as readonly unknown[]).includes(item.direction)) return '未知的空间组合方向。';
    let ids: string[] = [];
    if (item.nodeId !== undefined) {
      if (typeof item.nodeId !== 'string' || !item.nodeId.trim()) return '布局节点引用无效。';
      if (board && !board.nodes.some(node => node.id === item.nodeId)) return `布局引用了不存在的节点：${item.nodeId}`;
      ids = [item.nodeId];
    } else if (item.groupId !== undefined) {
      if (typeof item.groupId !== 'string' || !item.groupId.trim()) return '布局分组引用无效。';
      const group = board?.groups.find(group => group.id === item.groupId);
      if (board && !group) return `布局引用了不存在的分组：${item.groupId}`;
      ids = group?.nodeIds ?? [];
    } else {
      if (!item.direction || !Array.isArray(item.children) || !item.children.length || item.label !== undefined && typeof item.label !== 'string') return '空间组合需要方向和内容。';
      for (const child of item.children) { const error = visit(child, depth + 1); if (error) return error; }
    }
    for (const id of ids) { if (seen.has(id)) return `布局重复放置了节点：${id}`; seen.add(id); }
    return null;
  }
  return visit((value as SpatialPlan).root);
}

export function spatialNodeIds(plan: SpatialPlan, board: BoardDSL): string[] {
  const ids = new Set<string>();
  function visit(item: SpatialItem) {
    if ('nodeId' in item) ids.add(item.nodeId);
    else if ('groupId' in item) board.groups.find(group => group.id === item.groupId)?.nodeIds.forEach(id => ids.add(id));
    else item.children.forEach(visit);
  }
  visit(plan.root); return [...ids];
}

export function readSpatialPlan(board: BoardDSL): SpatialPlan | undefined {
  const value = (board.metadata[PRESENTATION_KEY] as { spatialPlan?: SpatialPlan } | undefined)?.spatialPlan;
  // Stored plans may outlive deleted cards. Prune stale references at render time.
  return value && !spatialPlanError(value) ? value : undefined;
}

export function withSpatialPlan(board: BoardDSL, plan: SpatialPlan, source: 'agent' | 'local' = 'agent'): BoardDSL {
  return { ...board, metadata: { ...board.metadata, [PRESENTATION_KEY]: { ...(board.metadata[PRESENTATION_KEY] as object), spatialPlan: plan, spatialSource: source } } };
}

export function withoutSpatialPlan(board: BoardDSL): BoardDSL {
  const metadata = board.metadata[PRESENTATION_KEY] as { spatialPlan?: unknown; spatialSource?: unknown } | undefined;
  if (!metadata?.spatialPlan) return board;
  const { spatialPlan: _plan, spatialSource: _source, ...rest } = metadata;
  return { ...board, metadata: { ...board.metadata, [PRESENTATION_KEY]: rest } };
}

const leaf = (node: BoardNode): SpatialItem => ({ nodeId: node.id });
const combine = (direction: 'row' | 'column' | 'orbit', children: SpatialItem[], label?: string): SpatialItem => children.length === 1 && !label ? children[0] : { direction, children, ...(label ? { label } : {}) };

/** Local fallback uses explicit groups/edges/tags; the model can supply a more nuanced plan. */
export function inferSpatialPlan(board: BoardDSL): SpatialPlan {
  const nodes = board.nodes;
  if (!nodes.length) return { description: '从一个想法开始。', root: { direction: 'row', children: [] } };
  const grouped = new Set<string>();
  const groups: SpatialItem[] = [];
  for (const group of board.groups) {
    if (!group.nodeIds.length || group.nodeIds.some(id => grouped.has(id))) continue;
    group.nodeIds.forEach(id => grouped.add(id));
    groups.push({ groupId: group.id, direction: 'column' });
  }
  const free = nodes.filter(node => !grouped.has(node.id));
  if (groups.length > 1) {
    const headline = free.filter(node => node.tags?.some(tag => ['decision', 'concept', 'question'].includes(tag)));
    const others = free.filter(node => !headline.includes(node));
    const phases = board.groups.filter(group => /阶段|步骤|第.+步|\bphase\b|\bstep\b|DAY\s*\d/i.test(group.title)).length > 1;
    return { description: phases ? '阶段横向推进，相关说明留在各自阶段内。' : '相关内容聚成板块，并列展示各个方向，便于来回比较。', root: combine('column', [
      ...(headline.length ? [combine('row', headline.map(leaf))] : []), combine('row', groups), ...(others.length ? [combine('row', others.map(leaf))] : []),
    ]) };
  }
  const ids = new Set(nodes.map(node => node.id));
  const links = board.edges.filter(edge => ids.has(edge.from) && ids.has(edge.to) && edge.from !== edge.to);
  if (links.length) {
    const degrees = nodes.map(node => ({ node, degree: links.filter(edge => edge.from === node.id || edge.to === node.id).length })).sort((a, b) => b.degree - a.degree);
    if (nodes.length > 3 && degrees[0].degree >= nodes.length - 1) {
      return { description: '核心主题居中，相关分支环绕，连线保留已有关系。', root: { direction: 'orbit', children: [leaf(degrees[0].node), ...nodes.filter(node => node !== degrees[0].node).map(leaf)] } };
    }
    const placed = new Set<string>(); const ranks: SpatialItem[] = [];
    if (links.some(edge => edge.type !== 'line')) {
    while (placed.size < nodes.length) {
      const ready = nodes.filter(node => !placed.has(node.id) && !links.some(edge => edge.type !== 'line' && edge.to === node.id && !placed.has(edge.from)));
      const layer = ready.length ? ready : [nodes.find(node => !placed.has(node.id))!];
      ranks.push(combine('column', layer.map(leaf))); layer.forEach(node => placed.add(node.id));
    }
    return { description: '按已有依赖从左到右推进，同一步的分支放在一起。', root: combine('row', ranks) };
    }
  }
  const decision = nodes.filter(node => node.tags?.includes('decision'));
  const evidence = nodes.filter(node => node.tags?.includes('evidence'));
  const caution = nodes.filter(node => node.tags?.some(tag => ['risk', 'assumption', 'question'].includes(tag)));
  if (decision.length && evidence.length && caution.length) {
    const rest = nodes.filter(node => ![...decision, ...evidence, ...caution].includes(node));
    return { description: '把判断放在中心，两侧分别呈现支持证据和待验证之处。', root: combine('column', [combine('row', [combine('column', evidence.map(leaf), '支持证据'), combine('column', decision.map(leaf)), combine('column', caution.map(leaf), '待验证')]), ...(rest.length ? [combine('row', rest.map(leaf), '下一步')] : [])]) };
  }
  if (groups.length) return { description: '围绕同一主题聚合，保留内容之间的邻近关系。', root: combine('row', [...groups, ...free.map(leaf)]) };
  const mainCandidates = nodes.filter(node => node.tags?.some(tag => ['question', 'decision'].includes(tag)));
  const concepts = nodes.filter(node => node.tags?.includes('concept'));
  const main = mainCandidates.length === 1 ? mainCandidates[0] : !mainCandidates.length && concepts.length === 1 ? concepts[0] : undefined;
  if (main && nodes.length > 3) return { description: '以核心问题为中心，周围展开相关内容。', root: { direction: 'orbit', children: [leaf(main), ...nodes.filter(node => node !== main).map(leaf)] } };
  const columns = Math.max(1, Math.ceil(Math.sqrt(nodes.length * 1.5)));
  const rows: SpatialItem[] = [];
  for (let i = 0; i < nodes.length; i += columns) rows.push(combine('row', nodes.slice(i, i + columns).map(leaf)));
  return { description: '暂未找到明确的主次或依赖关系，先以紧凑的内容地图呈现。', root: combine('column', rows) };
}
