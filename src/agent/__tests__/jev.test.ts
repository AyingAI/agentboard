import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyJevEvaluation, buildJevEvaluation, evaluateDiscoveries, requestJev, testJev } from '../jev';
import { discoveryKey } from '../discoveries';
import { jevCases } from './fixtures/jevCases';

const config = { enabled: true, apiKey: 'test-key', model: 'jev-latest' };
const choice = (value: string, probability = .95) => ({ type: 'choice', choice: value, probabilities: { [value]: probability } });
afterEach(() => vi.unstubAllGlobals());
describe('optional Jev evidence and constraint review', () => {
  it('sends cited source text, latest constraints and typed questions in one native request', async () => {
    const sample = jevCases()[1];
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ answers: {
      evidence_0: choice('grounded'), constraints_0: choice('conflicts'), intent_0: choice('faithful'), evidence_1: choice('grounded'), constraints_1: choice('fits'), intent_1: choice('faithful'), priority: choice('candidate_1'),
    } })));
    vi.stubGlobal('fetch', fetcher);
    const result = await evaluateDiscoveries(config, sample.board, sample.state, sample.drafts, new AbortController().signal);
    expect(result.drafts).toEqual([sample.drafts[1], sample.drafts[0]]);
    expect(result.reviews[discoveryKey(sample.drafts[0])].concerns).toEqual(['constraints']);
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.request.state.constraints).toContain('最多60分钟');
    expect(body.request.state.sources.find((n: { id: string }) => n.id === 'material-a').body).toContain('转场尚待核实');
    expect(body.request.questions.evidence_0.type).toBe('choice');
    expect(body.request.messages).toBeUndefined();
  });
  it('does not invent constraints or repetition checks when the user has supplied neither', () => {
    const sample = jevCases()[4]; const { questions } = buildJevEvaluation(sample.board, sample.state, sample.drafts);
    expect(Object.keys(questions)).toEqual(['evidence_0']);
  });
  it('uses decisions for semantic repetition checks and retains flagged candidates', () => {
    const sample = jevCases()[2]; const { state, questions } = buildJevEvaluation(sample.board, sample.state, sample.drafts);
    expect(state.decisions[0].status).toBe('dismissed');
    const result = applyJevEvaluation(sample.drafts, { evidence_0: choice('grounded'), repeated_0: choice('repeated'), evidence_1: choice('grounded'), repeated_1: choice('new'), priority: choice('candidate_0') }, questions);
    expect(result.drafts).toEqual([sample.drafts[1], sample.drafts[0]]);
    expect(result.flagged).toBe(1);
  });
  it('keeps the main ordering when judgments are uncertain or weak', () => {
    const sample = jevCases()[0]; const { questions } = buildJevEvaluation(sample.board, sample.state, sample.drafts);
    const result = applyJevEvaluation(sample.drafts, { evidence_0: choice('unsupported', .6), constraints_0: choice('uncertain'), intent_0: choice('uncertain'), evidence_1: choice('uncertain'), constraints_1: choice('fits'), intent_1: choice('faithful'), priority: choice('uncertain') }, questions);
    expect(result.drafts).toEqual(sample.drafts); expect(result.flagged).toBe(0);
  });
  it('reviews a single finding without requiring a ranking decision', async () => {
    const sample = jevCases()[4];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ answers: { evidence_0: choice('grounded') } }))));
    const result = await evaluateDiscoveries(config, sample.board, sample.state, sample.drafts, new AbortController().signal);
    expect(result.checked).toBe(1); expect(result.flagged).toBe(0); expect(result.drafts).toEqual(sample.drafts);
  });
  it('rejects incomplete evaluation instead of claiming a review succeeded', () => {
    const sample = jevCases()[1]; const { questions } = buildJevEvaluation(sample.board, sample.state, sample.drafts);
    expect(() => applyJevEvaluation(sample.drafts, { priority: choice('candidate_1') }, questions)).toThrow('未完整');
  });
  it('rejects unavailable or malformed evaluators so the caller can fall back', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));
    await expect(requestJev(config, {}, {})).rejects.toThrow('401');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ answers: {} }))));
    await expect(testJev(config)).rejects.toThrow('格式');
  });
});
