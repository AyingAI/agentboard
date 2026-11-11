import { expect, it } from 'vitest';
import { summarizeTaskEvents } from '../taskMetrics';
import type { TaskEvent } from '../taskDiagnostics';

const event = (stage: TaskEvent['stage'], outcome: TaskEvent['outcome'], at: number, extra: Partial<TaskEvent> = {}): TaskEvent => ({ taskId: 'run-1', attemptId: 'attempt-1', at, stage, outcome, ...extra });
it('counts calls and review time without claiming that application proves usability', () => {
  const result = summarizeTaskEvents([
    event('task', 'started', 1000, { enabled: true }), event('generation', 'started', 1000),
    event('review', 'started', 2000, { eligible: true }), event('evidence', 'started', 2000),
    event('repair', 'started', 2500), event('recheck', 'started', 3500), event('review', 'repaired', 4000),
    event('preview', 'completed', 4100), event('task', 'partial', 4100), event('apply', 'completed', 8000),
  ])[0];
  expect(result).toMatchObject({ generationCalls: 1, checks: 1, repairs: 1, rechecks: 1, optionalReviewMs: 2000, firstPreviewMs: 3100, appliedAfterMs: 7000, outcome: 'applied', usabilityVerified: false });
});

it('retains failed tasks and retries, excludes verification data and incomplete fragments', () => {
  const rows = [event('task', 'started', 0), event('generation', 'started', 1), event('generation', 'failed', 2),
    event('generation', 'started', 3), event('task', 'failed', 5), event('task', 'started', 0, { taskId: 'verification_sample' }),
    event('apply', 'completed', 10, { taskId: 'orphan' }), event('task', 'started', 0, { taskId: 'normal-uuid', verification: true })];
  expect(summarizeTaskEvents(rows)).toHaveLength(1);
  expect(summarizeTaskEvents(rows)[0]).toMatchObject({ generationCalls: 2, outcome: 'failed', eligible: null });
});

it('separates a changed review configuration from the task start assignment', () => {
  const start = event('task', 'started', 0, { enabled: false });
  const skipped = event('review', 'skipped', 5, { eligible: true, enabled: true, reason: 'configuration_changed' });
  expect(summarizeTaskEvents([start, skipped])[0]).toMatchObject({
    enabled: false, eligible: true, mixedConfiguration: true, checks: 0, optionalReviewMs: 0,
  });
  const ineligible = event('review', 'skipped', 5, { eligible: false, enabled: false });
  expect(summarizeTaskEvents([start, ineligible])[0]).toMatchObject({ eligible: false, mixedConfiguration: false });
});

it('keeps undo and rejection visible and never equates them to successful completion', () => {
  const rows = [event('task', 'started', 0), event('preview', 'completed', 5), event('apply', 'completed', 10), event('undo', 'completed', 20)];
  expect(summarizeTaskEvents(rows)[0].outcome).toBe('undone');
  expect(summarizeTaskEvents([event('task', 'started', 0), event('preview', 'discarded', 4)])[0].outcome).toBe('declined');
});


it('uses the current attempt instead of an old accepted proposal when a resumed task fails', () => {
  const rows = [event('task', 'started', 0), event('preview', 'completed', 5), event('apply', 'completed', 10),
    event('task', 'started', 20, { attemptId: 'attempt-2' }), event('generation', 'started', 20, { attemptId: 'attempt-2' }), event('task', 'failed', 30, { attemptId: 'attempt-2' })];
  expect(summarizeTaskEvents(rows)[0]).toMatchObject({ attempts: 2, outcome: 'failed', appliedAfterMs: undefined });
});

it('does not count a new attempt as an entire task after earlier log entries were evicted', () => {
  const rows = [event('apply', 'completed', 10), event('task', 'started', 20, { attemptId: 'attempt-2' })];
  expect(summarizeTaskEvents(rows)).toEqual([]);
});

it('excludes a retained continuation after all earlier attempt events have been evicted', () => {
  const rows = [event('task', 'started', 20, { initialAttempt: false }), event('apply', 'completed', 25)];
  expect(summarizeTaskEvents(rows)).toEqual([]);
});

it.each([
  ['started', 'running'], ['failed', 'failed'], ['cancelled', 'cancelled'], ['partial', 'awaiting_input'],
] as const)('reports the latest %s attempt without retaining the earlier preview status', (status, expected) => {
  const rows = [event('task', 'started', 0, { enabled: true }), event('preview', 'completed', 5),
    event('task', 'started', 20, { attemptId: 'attempt-2', enabled: false }), event('task', status, 30, { attemptId: 'attempt-2' })];
  expect(summarizeTaskEvents(rows)[0]).toMatchObject({ outcome: expected, mixedConfiguration: true });
});

it('distinguishes an invalidated proposal and retains waiting time across a successful retry', () => {
  const rows = [event('task', 'started', 0, { initialAttempt: true }), event('preview', 'completed', 5), event('apply', 'discarded', 10, { reason: 'stale' })];
  expect(summarizeTaskEvents(rows)[0].outcome).toBe('invalidated');
  rows.push(event('task', 'started', 20, { attemptId: 'attempt-2', initialAttempt: false }), event('apply', 'completed', 30, { attemptId: 'attempt-2' }));
  expect(summarizeTaskEvents(rows)[0]).toMatchObject({ outcome: 'applied', appliedAfterMs: 30, attempts: 2, firstPreviewMs: 5 });
});
