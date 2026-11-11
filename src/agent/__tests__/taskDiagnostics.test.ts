import { afterEach, expect, it, vi } from 'vitest';
import { measureTaskStage, readTaskEvents, recordTaskEvent, taskFailureReason } from '../taskDiagnostics';

afterEach(() => vi.unstubAllGlobals());
const trace = { taskId: 'run-1', attemptId: 'attempt-1' };

it('keeps bounded content-free local events and never fails delivery on storage errors', async () => {
  let saved = '[]';
  vi.stubGlobal('localStorage', { getItem: () => saved, setItem: (_key: string, value: string) => { saved = value; } });
  for (let i = 0; i < 2005; i++) recordTaskEvent(trace, 'evidence', 'completed', { count: i, rawText: 'private source and key' } as { count: number });
  expect(readTaskEvents()).toHaveLength(2000); expect(saved).not.toContain('private');
  expect(readTaskEvents()[0].count).toBe(5);
  vi.stubGlobal('localStorage', { getItem: () => { throw Error(); }, setItem: () => { throw Error(); } });
  expect(await measureTaskStage(trace, 'repair', async () => 42)).toBe(42);
});

it('distinguishes phase failures and inherited timeouts from user cancellations', async () => {
  let saved = '[]';
  vi.stubGlobal('localStorage', { getItem: () => saved, setItem: (_key: string, value: string) => { saved = value; } });
  await expect(measureTaskStage(trace, 'generation', async () => { throw { code: 'PARSE_ERROR', rawText: 'secret' }; })).rejects.toMatchObject({ code: 'PARSE_ERROR' });
  expect(readTaskEvents()[readTaskEvents().length - 1]).toMatchObject({ stage: 'parse', outcome: 'failed', reason: 'parse' });
  expect(saved).not.toContain('secret');
  const abort = new AbortController(); abort.abort({ kind: 'timeout' });
  expect(taskFailureReason({}, abort.signal)).toBe('timeout');
  const user = new AbortController(); user.abort({ kind: 'external' });
  expect(taskFailureReason({}, user.signal)).toBe('cancelled');
});
