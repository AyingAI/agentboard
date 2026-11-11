import type { TaskEvent } from './taskDiagnostics';

export interface TaskMeasurement {
  taskId: string;
  enabled: boolean;
  eligible: boolean | null;
  mixedConfiguration: boolean;
  attempts: number;
  generationCalls: number;
  providerRetries: number;
  checks: number;
  repairs: number;
  rechecks: number;
  optionalReviewMs?: number;
  firstPreviewMs?: number;
  appliedAfterMs?: number;
  outcome: 'applied' | 'undone' | 'declined' | 'awaiting_review' | 'awaiting_input' | 'failed' | 'cancelled' | 'running' | 'invalidated';
  reviewOutcome?: string;
  incompleteReview: boolean;
  /** Reading, task usability, manual corrections and new instructions need observation. */
  usabilityVerified: false;
}

/** Application is only a proxy for completion. Do not turn it into a time-saved claim. */
export function summarizeTaskEvents(events: TaskEvent[]): TaskMeasurement[] {
  const groups = new Map<string, TaskEvent[]>();
  for (const event of events) {
    if (event.verification === true || event.taskId.startsWith('verification_') || event.taskId.startsWith('background_')) continue;
    const group = groups.get(event.taskId) ?? [];
    group.push(event); groups.set(event.taskId, group);
  }
  return [...groups].flatMap(([taskId, raw]) => {
    const rows = [...raw].sort((a, b) => a.at - b.at);
    const start = rows.find(e => e.stage === 'task' && e.outcome === 'started');
    // A ring-buffer fragment is not a complete task measurement.
    if (!start || rows[0] !== start || start.initialAttempt === false) return [];
    const starts = rows.filter(e => e.stage === 'task' && e.outcome === 'started');
    const latestStart = starts[starts.length - 1];
    const current = rows.filter(e => e.attemptId === latestStart.attemptId && e.at >= latestStart.at);
    const calls = (stage: TaskEvent['stage']) => rows.filter(e => e.stage === stage && e.outcome === 'started').length;
    const review = current.filter(e => e.stage === 'review');
    const lastReview = review[review.length - 1];
    const eligibility = rows.filter(e => e.stage === 'review' && typeof e.eligible === 'boolean');
    const reviewStarts = rows.filter(e => e.stage === 'review' && e.outcome === 'started');
    const reviewTimes = reviewStarts.flatMap(reviewStart => {
      const end = rows.find(e => e.attemptId === reviewStart.attemptId && e.stage === 'review' && e.at >= reviewStart.at && e.outcome !== 'started');
      return end ? [end.at - reviewStart.at] : [];
    });
    const previews = rows.filter(e => e.stage === 'preview' && e.outcome === 'completed');
    const lastTask = current.filter(e => e.stage === 'task').slice(-1)[0];
    const applied = current.filter(e => e.stage === 'apply' && e.outcome === 'completed').slice(-1)[0];
    const lastDecision = current.filter(e => e.stage === 'undo' || e.stage === 'apply' || e.stage === 'preview').slice(-1)[0];
    let outcome: TaskMeasurement['outcome'] = 'running';
    if (lastDecision?.stage === 'undo' && lastDecision.outcome === 'completed') outcome = 'undone';
    else if (lastDecision?.stage === 'preview' && lastDecision.outcome === 'discarded') outcome = 'declined';
    else if (lastDecision?.stage === 'apply' && lastDecision.outcome === 'completed') outcome = 'applied';
    else if (lastDecision?.stage === 'apply' && lastDecision.outcome === 'discarded') outcome = 'invalidated';
    else if (lastDecision?.stage === 'apply' && lastDecision.outcome === 'failed') outcome = 'failed';
    else if (lastTask?.outcome === 'cancelled') outcome = 'cancelled';
    else if (lastTask?.outcome === 'failed') outcome = 'failed';
    else if (current.some(e => e.stage === 'preview' && e.outcome === 'completed')) outcome = 'awaiting_review';
    else if (lastTask?.outcome === 'partial') outcome = 'awaiting_input';
    return [{ taskId, enabled: start.enabled === true, eligible: eligibility.length ? eligibility.some(e => e.eligible === true) : null,
      mixedConfiguration: new Set([...starts.map(e => e.enabled === true), ...eligibility.flatMap(e => e.enabled === undefined ? [] : [e.enabled])]).size > 1
        || rows.some(e => e.reason === 'disabled' || e.reason === 'configuration_changed'),
      attempts: calls('task'), generationCalls: calls('generation'), providerRetries: calls('provider_retry'), checks: calls('evidence'), repairs: calls('repair'), rechecks: calls('recheck'),
      optionalReviewMs: reviewTimes.length === reviewStarts.length ? reviewTimes.reduce((total, time) => total + time, 0) : undefined,
      firstPreviewMs: previews.length ? previews[0].at - start.at : undefined,
      appliedAfterMs: applied ? applied.at - start.at : undefined, outcome, reviewOutcome: lastReview?.outcome,
      incompleteReview: current.some(e => e.stage === 'evidence' && (e.outcome === 'partial' || e.outcome === 'failed')),
      usabilityVerified: false as const }];
  });
}
