import { describe, expect, it } from 'vitest';
import { createExplorationBoard } from '../../data/exploration';
import { DISCOVERY_KINDS, type CollaborationState, type DiscoveryDraft } from '../../types/dsl';
import { buildDiscoverySystemPrompt } from '../prompts';
import { buildDiscoveryContext, buildImpactContext, consumeBudget, discoveryKey, hasBudget, impactProjectContext, isDiscoveryCurrent, mergeDiscoveries, nodePrints, parseDiscoveryResponse, resolveImpactItems, restoreCollaboration, semanticPrint } from '../discoveries';

const board = () => createExplorationBoard('research', '谁可以留下来？', '店主说周末客流增多');
const state = (): CollaborationState => ({ discoveries: [] });
const draft: DiscoveryDraft = { kind: 'gap', title: '客流与公共使用需要区分', reason: '一家店不能代表所有人。', prepared: '补访不消费的使用者，询问停留规则。', nodeIds: ['question', 'material-a'], action: { label: '准备补访问题', prompt: '沿着证据缺口准备问题。' } };

describe('proactive collaboration', () => {
  it('ignores geometry and viewport but notices content and constraints', () => {
    const original = board(), moved = structuredClone(original);
    moved.nodes[0].x += 100; moved.nodes[0].height = 500; moved.board.viewport.zoom = .5;
    expect(semanticPrint(moved, state())).toBe(semanticPrint(original, state()));
    moved.nodes[1].body = '居民说没有公共座位';
    expect(semanticPrint(moved, state())).not.toBe(semanticPrint(original, state()));
    expect(semanticPrint(original, { ...state(), constraints: '受众是本地居民' })).not.toBe(semanticPrint(original, state()));
  });
  it('never parses patch operations as discoveries', () => {
    expect(() => parseDiscoveryResponse('{"type":"dsl_patch","summary":"改写","ops":[]}', board())).toThrow();
    expect(parseDiscoveryResponse(JSON.stringify({ type: 'discovery', understanding: '资料还少', discoveries: [] }), board()).discoveries).toEqual([]);
  });
  it('rejects fabricated sources and empty prepared results', () => {
    const response = (item: unknown) => JSON.stringify({ type: 'discovery', understanding: '研究使用方式', discoveries: [item] });
    expect(() => parseDiscoveryResponse(response({ ...draft, nodeIds: ['invented'] }), board())).toThrow(/资料/);
    expect(() => parseDiscoveryResponse(response({ ...draft, prepared: '' }), board())).toThrow(/准备成果/);
    expect(parseDiscoveryResponse('```json\n' + response(draft) + '\n```', board()).discoveries[0]).toEqual(draft);
  });
  it('retains grounded findings alongside a finding with an invalid source', () => {
    const invalid = { ...draft, title: '引用了不存在的条件卡', nodeIds: ['material-a', 'constraints'] };
    const response = JSON.stringify({ type: 'discovery', understanding: '研究使用方式', discoveries: [invalid, draft] });
    expect(parseDiscoveryResponse(response, board()).discoveries).toEqual([draft]);
  });
  it('does not treat a removed source or conflicting impact judgment as clearance to reuse', () => {
    const b = board();
    b.nodes.push({ ...b.nodes[0], id: 'outcome', tags: ['output'] }, { ...b.nodes[0], id: 'outline', tags: ['output'] });
    const saved = { ...mergeDiscoveries(state(), [draft], b)[0], status: 'saved' as const, savedNodeId: 'outcome' };
    const previous = { discoveries: [saved], checkedNodes: nodePrints(b), checkedContext: impactProjectContext(b, state()) };
    b.nodes = b.nodes.filter(node => node.id !== 'material-a');
    const impact = buildImpactContext(b, previous)!;
    const result = resolveImpactItems(impact, [
      { nodeId: 'outcome', status: 'keep', reason: '可以用', sourceIds: [] },
      { nodeId: 'outline', status: 'keep', reason: '可以用', sourceIds: [] },
    ], [{ nodeId: 'outline', status: 'revise', reason: '需要调整', sourceIds: [] }]);
    expect(result.map(item => item.status)).toEqual(['verify', 'verify']);
    expect(result[0].reason).toContain('关联资料已移除');
  });
  it('invalidates findings when a source, constraint or cited relationship changes', () => {
    const b = board(); b.edges.push({ id: 'relation', from: 'material-a', to: 'question', label: '支持' });
    const discovery = mergeDiscoveries(state(), [draft], b)[0];
    expect(isDiscoveryCurrent(discovery, b, state())).toBe(true);
    const changed = structuredClone(b); changed.nodes[1].body = '新的访谈';
    expect(isDiscoveryCurrent(discovery, changed, state())).toBe(false);
    expect(isDiscoveryCurrent(discovery, b, { ...state(), constraints: '改为儿童受众' })).toBe(false);
    changed.nodes[1].body = b.nodes[1].body; changed.edges = [];
    expect(isDiscoveryCurrent(discovery, changed, state())).toBe(false);
  });
  it('does not invalidate a finding when unrelated content is added', () => {
    const b = board(); const discovery = mergeDiscoveries(state(), [draft], b)[0];
    b.nodes.push({ ...b.nodes[0], id: 'unrelated', title: '另一条观察' });
    expect(isDiscoveryCurrent(discovery, b, state())).toBe(true);
  });
  it('includes group meaning and invalidates findings when their source grouping changes', () => {
    const b = board();
    b.groups.push({ id: 'perspective', title: '待核实的说法', nodeIds: ['material-a'] });
    const discovery = mergeDiscoveries(state(), [draft], b)[0];
    expect(buildDiscoveryContext(b, state()).groups).toEqual([{ title: '待核实的说法', nodeIds: ['material-a'] }]);
    b.groups[0].title = '已经核实的观察';
    expect(isDiscoveryCurrent(discovery, b, state())).toBe(false);
  });
  it('remembers dismissed decisions without repeating unchanged discoveries', () => {
    const b = board(); const first = mergeDiscoveries(state(), [draft], b);
    first[0].status = 'dismissed';
    const saved = { discoveries: first };
    expect(mergeDiscoveries(saved, [draft], b)).toHaveLength(1);
    expect(buildDiscoveryContext(b, saved).previousDecisions[0].status).toBe('dismissed');
    b.nodes[1].body += '；加入居民反例';
    expect(mergeDiscoveries(saved, [draft], b)).toHaveLength(2);
  });
  it('does not describe an undone or deleted adopted card as a retained decision', () => {
    const b = board(); const discoveries = mergeDiscoveries(state(), [draft], b);
    discoveries[0].status = 'saved'; discoveries[0].savedNodeId = 'adopted-card';
    expect(buildDiscoveryContext(b, { discoveries }).previousDecisions[0].status).toBe('removed');
    b.nodes.push({ ...b.nodes[0], id: 'adopted-card' });
    expect(buildDiscoveryContext(b, { discoveries }).previousDecisions[0].status).toBe('saved');
  });
  it('applies a later review to an existing pending finding without duplicating it', () => {
    const b = board(); const discoveries = mergeDiscoveries(state(), [draft], b);
    const reviewed = mergeDiscoveries({ discoveries }, [draft, draft], b, { [discoveryKey(draft)]: { concerns: ['evidence'] } });
    expect(reviewed).toHaveLength(1); expect(reviewed[0].id).toBe(discoveries[0].id);
    expect(reviewed[0].jevReview?.concerns).toEqual(['evidence']);
    expect(restoreCollaboration({ discoveries: reviewed })?.discoveries[0].jevReview?.concerns).toEqual(['evidence']);
    expect(mergeDiscoveries({ discoveries: reviewed }, [draft], b, {})[0].jevReview).toBeUndefined();
  });
  it('bounds calls and restores optional state defensively', () => {
    let s: CollaborationState = { ...state(), dailyLimit: 2 };
    s = consumeBudget(consumeBudget(s)); expect(hasBudget(s)).toBe(false);
    expect(hasBudget({ ...s, budget: { day: 'yesterday', calls: 10 } })).toBe(true);
    expect(restoreCollaboration({ discoveries: [null, {}], goal: '我的目标', dailyLimit: 200 })?.discoveries).toEqual([]);
    expect(restoreCollaboration({ dailyLimit: 200 })?.dailyLimit).toBe(50);
    expect(restoreCollaboration('damaged')).toBeUndefined();
  });
  it('keeps the model contract aligned with discovery types', () => {
    const prompt = buildDiscoverySystemPrompt();
    for (const kind of DISCOVERY_KINDS) expect(prompt).toContain(`"${kind}"`);
    for (const field of ['understanding', 'discoveries', 'kind', 'title', 'reason', 'prepared', 'nodeIds', 'action', 'label', 'prompt']) expect(prompt).toContain(`"${field}"`);
    for (const field of ['impacts', 'nodeId', 'status', 'sourceIds', 'revise', 'verify', 'keep']) expect(prompt).toContain(`"${field}"`);
    expect(prompt).toContain('A URL alone is not read evidence');
    expect(prompt).toContain('Do not use tools');
  });
});
