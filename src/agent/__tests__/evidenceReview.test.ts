import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareEvidenceReview, researchSourceReferences, reviewEvidence } from '../evidenceReview';
import type { AgentAdapter } from '../types';
import type { BoardDSL, BoardNode, DSLPatch } from '../../types/dsl';
import { materialCard } from '../../data/exploration';

const node = (id: string, title: string, body: string): BoardNode => ({ id, title, body, type: 'card', x: 0, y: 0, width: 300, height: 160 });
const board: BoardDSL = { version: '0.1', board: { id: 'study', title: '研究', viewport: { x: 0, y: 0, zoom: 1 } },
  nodes: [node('source', '居民访谈', '两位居民说周末免费座位减少。'), node('intro', '文章开头', '原文。')], edges: [], groups: [], metadata: {} };
const first = '两位居民每周六下午都来这里。';
const second = '座位总数减少了百分之五十。';
const corrected = '两位居民说周末免费座位减少。';
const patch: DSLPatch = { type: 'dsl_patch', summary: '确认每周六下午到访', ops: [
  { op: 'update_node', nodeId: 'intro', changes: { body: first + second } },
  { op: 'add_edge', edge: { id: 'edge', from: 'source', to: 'intro' } },
] };
const config = { enabled: true, evidenceReview: true, apiKey: 'test-only' };
const choice = (choice: string) => ({ type: 'choice', choice, probabilities: { [choice]: .98 } });
const reply = (answers: Record<string, unknown>) => new Response(JSON.stringify({ answers }));
const plan = () => prepareEvidenceReview(board, '根据「居民访谈」更新文章开头', patch)!;
const repair = (ids = ['claim_0', 'claim_1']) => ({ type: 'dsl_patch' as const, summary: '修订', ops: ids.map(nodeId => ({ op: 'update_node' as const, nodeId, changes: { body: corrected } })) });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('bounded evidence correction', () => {
  it('repairs a partial batch without treating missing answers as support or losing known issues', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(reply({ claim_0: choice('unsupported') }))
      .mockResolvedValueOnce(reply({ claim_0: choice('supported') }));
    vi.stubGlobal('fetch', fetcher);
    const generateResponse = vi.fn().mockResolvedValue(repair(['claim_0']));
    const result = await reviewEvidence(plan(), config, patch, { name: 'test', generateResponse }, new AbortController().signal, () => {});
    expect(result.outcome).toBe('repaired');
    expect(result.decisions[1].value).toBe('missing');
    expect(result.patch.ops[0]).toEqual({ op: 'update_node', nodeId: 'intro', changes: { body: corrected + second } });
    expect(result.patch.ops[1]).toBe(patch.ops[1]);
    expect(result.patch.summary).not.toContain('每周六');
    expect(generateResponse).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('keeps all located issues when the single repair attempts an extra field', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ claim_0: choice('unsupported'), claim_1: choice('unsupported') })));
    const response = repair(); response.ops[0].changes = { body: corrected, title: '越界' } as typeof response.ops[0]['changes'];
    const result = await reviewEvidence(plan(), config, patch, { name: 'test', generateResponse: vi.fn().mockResolvedValue(response) }, new AbortController().signal, () => {});
    expect(result.patch).toBe(patch);
    expect(result.issues?.map(issue => issue.text)).toEqual([first, second]);
    expect(result.outcome).toBe('unresolved');
  });

  it('never repairs an entirely missing or uncertain batch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ claim_0: choice('unclear') })));
    const generateResponse = vi.fn();
    const result = await reviewEvidence(plan(), config, patch, { name: 'test', generateResponse }, new AbortController().signal, () => {});
    expect(result.outcome).toBe('partial'); expect(result.issues).toBeUndefined(); expect(generateResponse).not.toHaveBeenCalled();
  });

  it('bounds a hung initial transport even if it ignores cancellation', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const generateResponse = vi.fn();
    const pending = reviewEvidence(plan(), config, patch, { name: 'test', generateResponse }, new AbortController().signal, () => {});
    await vi.advanceTimersByTimeAsync(2500);
    expect((await pending).outcome).toBe('failed'); expect(generateResponse).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reserves recheck time and delivers the original with issues when a repair hangs', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ claim_0: choice('unsupported') })));
    const generateResponse = vi.fn(() => new Promise<never>(() => {}));
    const pending = reviewEvidence(plan(), config, patch, { name: 'test', generateResponse }, new AbortController().signal, () => {});
    await vi.advanceTimersByTimeAsync(12500);
    const result = await pending;
    expect(result.patch).toBe(patch); expect(result.issues?.[0].text).toBe(first);
    expect(generateResponse).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });

  it('stops a hung repair promptly on opt-out and ignores its late successful result', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValue(reply({ claim_0: choice('unsupported') })); vi.stubGlobal('fetch', fetcher);
    let enabled = true;
    let finish!: (value: ReturnType<typeof repair>) => void;
    const generateResponse = vi.fn(() => new Promise<ReturnType<typeof repair>>(resolve => { finish = resolve; }));
    const pending = reviewEvidence(plan(), config, patch, { name: 'test', generateResponse }, new AbortController().signal, () => {}, () => enabled);
    await vi.advanceTimersByTimeAsync(0); enabled = false; await vi.advanceTimersByTimeAsync(50);
    const result = await pending;
    expect(result.patch).toBe(patch); expect(result.issues?.[0].text).toBe(first);
    finish(repair(['claim_0'])); await vi.advanceTimersByTimeAsync(0);
    expect(result.patch).toBe(patch); expect(fetcher).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });

  it('does not merge replacements when recheck is incomplete', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(reply({ claim_0: choice('unsupported'), claim_1: choice('unsupported') }))
      .mockResolvedValueOnce(reply({ claim_0: choice('supported') })));
    const adapter: AgentAdapter = { name: 'test', generateResponse: vi.fn().mockResolvedValue(repair()) };
    const result = await reviewEvidence(plan(), config, patch, adapter, new AbortController().signal, () => {});
    expect(result.patch).toBe(patch); expect(result.issues).toHaveLength(2); expect(adapter.generateResponse).toHaveBeenCalledTimes(1);
  });

  it('skips ambiguous, oversized and excluded sources without asking the user to split them', () => {
    expect(prepareEvidenceReview({ ...board, nodes: [...board.nodes, { ...board.nodes[0], id: 'duplicate' }] }, '根据居民访谈更新文章开头', patch)).toBeUndefined();
    expect(prepareEvidenceReview({ ...board, nodes: [{ ...board.nodes[0], body: '长'.repeat(2501) }, board.nodes[1]] }, '根据居民访谈更新文章开头', patch)).toBeUndefined();
    expect(prepareEvidenceReview(board, '不要用居民访谈更新文章开头', patch)).toBeUndefined();
  });

  it('requires actual source text even when the built-in material card contains a URL', () => {
    const url = 'https://example.com/interview';
    const link = materialCard('source', url, '居民访谈', '', 0, 0);
    const excerpt = materialCard('source', corrected, '居民访谈', url, 0, 0);
    const message = '根据居民访谈更新文章开头';
    for (const body of [link.body, url, `[访谈](${url})`]) {
      expect(prepareEvidenceReview({ ...board, nodes: [{ ...link, body }, board.nodes[1]] }, message, patch)).toBeUndefined();
    }
    expect(prepareEvidenceReview({ ...board, nodes: [excerpt, board.nodes[1]] }, message, patch)?.source).toEqual(excerpt);
  });

  it('falls back when a factual sentence exceeds the budget even if another sentence fits', () => {
    const message = '根据居民访谈更新文章开头';
    const atLimit = '长'.repeat(399) + '。';
    for (const [sentence, eligible] of [[atLimit, true], ['更' + atLimit, false]] as const) {
      const draft = { ...patch, ops: [{ op: 'update_node' as const, nodeId: 'intro', changes: { body: corrected + sentence } }] };
      expect(Boolean(prepareEvidenceReview(board, message, draft))).toBe(eligible);
    }
  });

  it('leaves mixed facts and hypotheses out of automatic sentence repair', () => {
    const mixed = '两位居民每周六下午来这里，或许是为了参加社区活动。';
    const draft = { ...patch, ops: [{ op: 'update_node' as const, nodeId: 'intro', changes: { body: corrected + mixed } }] };
    expect(prepareEvidenceReview(board, '根据居民访谈更新文章开头', draft)?.candidates.map(claim => claim.text)).toEqual([corrected]);
  });
});


it('protects named original sources independently of review limits and explicit opt-in', () => {
  const large = { ...board, nodes: [{ ...board.nodes[0], body: '资料'.repeat(2000) }, board.nodes[1]] };
  expect(researchSourceReferences(large, '根据「居民访谈」更新文章开头').map(n => n.id)).toEqual(['source']);
  expect(prepareEvidenceReview(large, '根据「居民访谈」更新文章开头', patch)).toBeUndefined();
  expect(researchSourceReferences(board, '根据「居民访谈」更新文章开头，不要修改「居民访谈」').map(n => n.id)).toEqual(['source']);
});

it('honors an explicit request to edit the source and skips source checking', () => {
  const request = '根据「居民访谈」更新文章开头，同时修改「居民访谈」的正文';
  expect(researchSourceReferences(board, request)).toEqual([]);
  expect(prepareEvidenceReview(board, request, patch)).toBeUndefined();
  expect(researchSourceReferences(board, '根据「居民访谈」更新文章开头，同时修改原文')).toEqual([]);
});

it('does not treat editing a longer output title as permission to rewrite the source', () => {
  expect(researchSourceReferences(board, '根据「居民访谈」修改居民访谈报告和文章开头').map(n => n.id)).toEqual(['source']);
});
