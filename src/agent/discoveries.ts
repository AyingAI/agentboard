import { DISCOVERY_KINDS, DISCOVERY_CONCERNS, IMPACT_STATUSES, type BoardDSL, type CollaborationState, type Discovery, type DiscoveryDraft, type DiscoveryResponse, type DiscoveryReview, type ImpactContext, type ImpactItem } from '../types/dsl';
import { getJsonCandidates } from './response';
import { readExploration } from '../data/exploration';

export const EMPTY_COLLABORATION: CollaborationState = { discoveries: [] };

function fingerprint(value: unknown): string {
  const text = JSON.stringify(value);
  let a = 2166136261, b = 5381;
  for (let i = 0; i < text.length; i++) { a = Math.imul(a ^ text.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ text.charCodeAt(i); }
  return `${(a >>> 0).toString(36)}-${(b >>> 0).toString(36)}-${text.length}`;
}

export function projectGoal(board: BoardDSL, state: CollaborationState): string {
  return state.goal?.trim() || board.nodes.find(node => node.tags?.includes('question'))?.title || board.board.title;
}

export function impactProjectContext(board: BoardDSL, state: CollaborationState): ImpactContext['current'] {
  return { goal: projectGoal(board, state).slice(0, 500), constraints: (state.constraints ?? '').slice(0, 5000) };
}

/** Scope checks to previously seen outcomes and a small set of changed sources. */
export function buildImpactContext(board: BoardDSL, state: CollaborationState): ImpactContext | undefined {
  const checkedNodes = state.checkedNodes;
  if (!checkedNodes) return;
  const current = impactProjectContext(board, state);
  const previous = state.checkedContext;
  const prints = nodePrints(board);
  const knownIds = new Set(Object.keys(checkedNodes));
  const currentIds = new Set(Object.keys(prints));
  const removedIds = [...knownIds].filter(id => !currentIds.has(id));
  const changed = board.nodes.filter(node => state.checkedNodes?.[node.id] !== prints[node.id]);
  const contextChanged = !previous || current.goal !== previous.goal || current.constraints !== previous.constraints;
  if (!contextChanged && !changed.length && !removedIds.length) return;

  const saved = new Map(state.discoveries.filter(d => d.status === 'saved' && d.savedNodeId).map(d => [d.savedNodeId, d]));
  const changedIds = new Set([...changed.map(node => node.id), ...removedIds]);
  const targets = board.nodes.flatMap(node => {
    const adopted = saved.get(node.id);
    const isOutcome = node.tags?.some(tag => tag === 'output' || tag === 'decision' || tag === 'assumption');
    if (!knownIds.has(node.id) || (!adopted && !isOutcome)) return [];
    const sourceIds = [...new Set([...(adopted?.nodeIds ?? []), ...board.edges.filter(edge => edge.to === node.id).map(edge => edge.from)])]
      .sort((a, b) => Number(changedIds.has(b)) - Number(changedIds.has(a))).slice(0, 12);
    if (!contextChanged && changedIds.has(node.id) && !sourceIds.some(id => changedIds.has(id))) return [];
    return [{ id: node.id, title: node.title.slice(0, 240), body: node.body.slice(0, 2400), truncated: node.body.length > 2400, sourceIds,
      rank: sourceIds.some(id => changedIds.has(id)) ? 2 : adopted ? 1 : 0 }];
  }).sort((a, b) => b.rank - a.rank).slice(0, 6).map(({ rank: _rank, ...target }) => target);
  if (!targets.length) return;

  const linked = new Set(targets.flatMap(target => target.sourceIds));
  const changes: ImpactContext['changes'] = [...changed].reverse().sort((a, b) => Number(linked.has(b.id)) - Number(linked.has(a.id)))
    .slice(0, 8).map(node => ({ id: node.id, title: node.title.slice(0, 240), body: node.body.slice(0, 2000), truncated: node.body.length > 2000,
      kind: knownIds.has(node.id) ? 'edited' : 'added' }));
  return { previous, current, targets, changes, removedIds: removedIds.filter(id => linked.has(id)).slice(0, 12) };
}

export function resolveImpactItems(context: ImpactContext, agent: ImpactItem[], jev: ImpactItem[]): ImpactItem[] {
  const changedIds = new Set(context.changes.map(change => change.id));
  return context.targets.flatMap<ImpactItem>(target => {
    const explanation = agent.find(item => item.nodeId === target.id);
    const review = jev.find(item => item.nodeId === target.id);
    const item = explanation ?? review;
    const sources = new Set([...target.sourceIds, ...changedIds]);
    if (target.sourceIds.some(id => context.removedIds.includes(id))) {
      return [{ nodeId: target.id, status: 'verify', reason: '有一条关联资料已移除，沿用前需要核对依据。', sourceIds: [] }];
    }
    if (!item) return [];
    if (explanation && review && explanation.status !== review.status) {
      return [{ nodeId: target.id, status: 'verify', reason: '两次判断有分歧，建议打开卡片核对依据。', sourceIds: item.sourceIds.filter(id => sources.has(id)) }];
    }
    return [{ ...item, sourceIds: item.sourceIds.filter(id => sources.has(id) && id !== target.id) }];
  });
}

export function contextPrint(board: BoardDSL, state: CollaborationState): string {
  return fingerprint([board.board.id, board.board.title, readExploration(board)?.kind, projectGoal(board, state), state.constraints ?? '']);
}

export function nodePrints(board: BoardDSL): Record<string, string> {
  return Object.fromEntries(board.nodes.map(node => [node.id, fingerprint([node.title, node.body, node.tags, node.visual?.html, node.visual?.state])]));
}

export function semanticPrint(board: BoardDSL, state: CollaborationState): string {
  return fingerprint([contextPrint(board, state), Object.entries(nodePrints(board)).sort(),
    board.edges.map(e => [e.id, e.from, e.to, e.label]).sort(), board.groups.map(g => [g.id, g.title, [...g.nodeIds].sort()]).sort()]);
}

export function isDiscoveryCurrent(discovery: Discovery, board: BoardDSL, state: CollaborationState): boolean {
  const prints = nodePrints(board);
  return discovery.contextPrint === contextPrint(board, state)
    && discovery.relationPrint === relationPrint(board, discovery.nodeIds)
    && discovery.nodeIds.length > 0 && discovery.nodeIds.every(id => prints[id] && prints[id] === discovery.sourcePrints[id]);
}

function relationPrint(board: BoardDSL, ids: string[]): string {
  return fingerprint([
    board.edges.filter(e => ids.includes(e.from) && ids.includes(e.to)).map(e => [e.id, e.from, e.to, e.label]).sort(),
    board.groups.filter(g => g.nodeIds.some(id => ids.includes(id))).map(g => [g.id, g.title, [...g.nodeIds].sort()]).sort(),
  ]);
}

export function collaborationEnabled(board: BoardDSL, state: CollaborationState): boolean {
  return state.enabled ?? !readExploration(board)?.example;
}

export function dailyLimit(state: CollaborationState): number | null {
  if (state.dailyLimit === null) return null;
  return Math.max(1, Math.min(50, Math.round(state.dailyLimit ?? 12)));
}

export function budgetDay(now = new Date()): string {
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

export function hasBudget(state: CollaborationState): boolean {
  const limit = dailyLimit(state);
  return limit === null || state.budget?.day !== budgetDay() || state.budget.calls < limit;
}

export function consumeBudget(state: CollaborationState): CollaborationState {
  return { ...state, budget: { day: budgetDay(), calls: state.budget?.day === budgetDay() ? state.budget.calls + 1 : 1 } };
}

function shortString(value: unknown, field: string, limit: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) throw new Error(`发现的 ${field} 缺失或过长`);
  return value.trim();
}

function readImpactItems(raw: unknown, allowed?: Set<string>): ImpactItem[] {
  if (!Array.isArray(raw)) return [];
  const items = new Map<string, ImpactItem>();
  for (const item of raw.slice(0, 6)) {
    if (!item || typeof item.nodeId !== 'string' || (allowed && !allowed.has(item.nodeId)) || !IMPACT_STATUSES.includes(item.status)) continue;
    if (typeof item.reason !== 'string' || !item.reason.trim() || item.reason.length > 500) continue;
    const sourceIds: string[] = Array.isArray(item.sourceIds) ? item.sourceIds.filter((id: unknown): id is string => typeof id === 'string' && (!allowed || allowed.has(id))) : [];
    items.set(item.nodeId, { nodeId: item.nodeId, status: item.status, reason: item.reason.trim(), sourceIds: [...new Set(sourceIds)].slice(0, 8) });
  }
  return [...items.values()];
}

export function parseDiscoveryResponse(text: string, board: BoardDSL): DiscoveryResponse {
  let lastError: unknown;
  for (const candidate of getJsonCandidates(text)) {
    try {
      const raw = JSON.parse(candidate);
      if (raw?.type !== 'discovery' || !Array.isArray(raw.discoveries) || raw.discoveries.length > 3) throw new Error('Agent 未返回有效的发现结果');
      const understanding = shortString(raw.understanding, '任务理解', 1200);
      const discoveries: DiscoveryDraft[] = [];
      let itemError: unknown;
      for (const item of raw.discoveries) {
        try {
          if (!item || !DISCOVERY_KINDS.includes(item.kind)) throw new Error('未知的发现类型');
          if (!Array.isArray(item.nodeIds) || !item.nodeIds.length || item.nodeIds.some((id: unknown) => typeof id !== 'string' || !board.nodes.some(n => n.id === id))) throw new Error('发现引用了不存在的资料');
          discoveries.push({ kind: item.kind, title: shortString(item.title, '标题', 160), reason: shortString(item.reason, '依据', 1500),
            prepared: shortString(item.prepared, '准备成果', 6000), nodeIds: [...new Set<string>(item.nodeIds)],
            action: { label: shortString(item.action?.label, '下一步名称', 80), prompt: shortString(item.action?.prompt, '下一步', 2400) } });
        } catch (error) {
          itemError = error;
        }
      }
      const impacts = readImpactItems(raw.impacts, new Set(board.nodes.map(node => node.id)));
      if (raw.discoveries.length && !discoveries.length && !impacts.length) throw itemError;
      return { type: 'discovery', understanding, discoveries, ...(impacts.length ? { impacts } : {}) };
    } catch (error) { lastError = error; }
  }
  throw lastError instanceof Error ? lastError : new Error('无法读取发现结果');
}

export function discoveryKey(draft: DiscoveryDraft): string {
  return fingerprint([draft.kind, draft.title.replace(/\s/g, ''), [...draft.nodeIds].sort()]);
}

export function discoveryDecision(discovery: Discovery, board: BoardDSL): Discovery['status'] | 'removed' {
  return discovery.status === 'saved' && !board.nodes.some(node => node.id === discovery.savedNodeId) ? 'removed' : discovery.status;
}

export function mergeDiscoveries(state: CollaborationState, drafts: DiscoveryDraft[], board: BoardDSL, reviews?: Record<string, DiscoveryReview>): Discovery[] {
  const prints = nodePrints(board);
  const refreshed: Discovery[] = [];
  const seen = new Set<string>();
  for (const draft of drafts) {
    const key = discoveryKey(draft);
    if (seen.has(key)) continue;
    seen.add(key);
    const old = state.discoveries.find(d => discoveryKey(d) === key && isDiscoveryCurrent(d, board, state));
    if (old) {
      if (old.status === 'new') refreshed.push({ ...old, ...draft, ...(reviews ? { jevReview: reviews[key] } : {}) });
    } else refreshed.push({ ...draft, ...(reviews?.[key] ? { jevReview: reviews[key] } : {}), id: `discovery_${crypto.randomUUID()}`, createdAt: Date.now(), status: 'new', sourcePrints: Object.fromEntries(draft.nodeIds.map(id => [id, prints[id]])), contextPrint: contextPrint(board, state), relationPrint: relationPrint(board, draft.nodeIds) });
  }
  return [...refreshed, ...state.discoveries.filter(old => !refreshed.some(d => d.id === old.id))].slice(0, 40);
}

export function buildDiscoveryContext(board: BoardDSL, state: CollaborationState) {
  const prints = nodePrints(board);
  const changedIds = board.nodes.filter(n => state.checkedNodes?.[n.id] !== prints[n.id]).map(n => n.id);
  const removedIds = Object.keys(state.checkedNodes ?? {}).filter(id => !prints[id]);
  const changed = new Set(changedIds);
  const nearby = new Set(board.edges.flatMap(e => changed.has(e.from) ? [e.to] : changed.has(e.to) ? [e.from] : []));
  let budget = 52000;
  const nodes = [...board.nodes].sort((a, b) => (changed.has(b.id) ? 2 : nearby.has(b.id) ? 1 : 0) - (changed.has(a.id) ? 2 : nearby.has(a.id) ? 1 : 0))
    .map(node => {
      const limit = Math.max(0, Math.min(7000, budget));
      const body = node.body.slice(0, limit); budget -= body.length + node.title.length;
      return { id: node.id, title: node.title, body, tags: node.tags, truncated: body.length < node.body.length,
        ...(node.visual?.state ? { visualState: JSON.stringify(node.visual.state).slice(0, 1500) } : {}) };
    });
  return { scene: readExploration(board)?.kind ?? 'exploration', goal: projectGoal(board, state), constraints: state.constraints || '未补充，不能擅自假定',
    changedIds, removedIds, nodes, edges: board.edges.map(({ from, to, label }) => ({ from, to, label })),
    groups: board.groups.map(({ title, nodeIds }) => ({ title, nodeIds })),
    previousDecisions: state.discoveries.slice(0, 12).map(d => ({ title: d.title, status: discoveryDecision(d, board), reason: d.reason, nodeIds: d.nodeIds,
      current: isDiscoveryCurrent(d, board, state) })) };
}

/** Damaged optional companion state must not lose a board. */
export function restoreCollaboration(raw: unknown): CollaborationState | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const value = raw as CollaborationState;
  const discoveries = Array.isArray(value.discoveries) ? value.discoveries.filter(d => d && typeof d.id === 'string'
    && DISCOVERY_KINDS.includes(d.kind) && ['new', 'saved', 'dismissed'].includes(d.status)
    && typeof d.title === 'string' && typeof d.reason === 'string' && typeof d.prepared === 'string'
    && Array.isArray(d.nodeIds) && d.nodeIds.every(id => typeof id === 'string') && d.sourcePrints && typeof d.sourcePrints === 'object'
    && typeof d.contextPrint === 'string' && typeof d.relationPrint === 'string' && typeof d.createdAt === 'number' && typeof d.action?.label === 'string' && typeof d.action?.prompt === 'string').slice(0, 40).map(d => ({ ...d,
      jevReview: Array.isArray(d.jevReview?.concerns) ? { concerns: d.jevReview.concerns.filter(c => DISCOVERY_CONCERNS.includes(c)) } : undefined })) : [];
  return { discoveries, ...(typeof value.enabled === 'boolean' ? { enabled: value.enabled } : {}),
    ...(typeof value.goal === 'string' ? { goal: value.goal } : {}), ...(typeof value.constraints === 'string' ? { constraints: value.constraints } : {}),
    ...(typeof value.understanding === 'string' ? { understanding: value.understanding } : {}),
    ...(typeof value.checkedPrint === 'string' ? { checkedPrint: value.checkedPrint } : {}),
    ...(typeof value.checkedAt === 'number' ? { checkedAt: value.checkedAt } : {}),
    ...(value.checkedNodes && typeof value.checkedNodes === 'object' ? { checkedNodes: Object.fromEntries(Object.entries(value.checkedNodes).filter(([, v]) => typeof v === 'string')) } : {}),
    ...(typeof value.checkedContext?.goal === 'string' && typeof value.checkedContext.constraints === 'string' ? { checkedContext: { goal: value.checkedContext.goal.slice(0, 500), constraints: value.checkedContext.constraints.slice(0, 5000) } } : {}),
    ...(typeof value.impactReport?.print === 'string' ? { impactReport: { print: value.impactReport.print, items: readImpactItems(value.impactReport.items) } } : {}),
    ...(value.budget && typeof value.budget.day === 'string' && Number.isFinite(value.budget.calls) ? { budget: { day: value.budget.day, calls: Math.max(0, value.budget.calls) } } : {}),
    ...(value.dailyLimit === null || Number.isFinite(value.dailyLimit) ? { dailyLimit: dailyLimit(value) } : {}) };
}
