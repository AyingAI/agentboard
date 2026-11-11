/** Bounded local measurements. Never accept prompts, source text, or raw errors. */
export type TaskStage = 'task' | 'generation' | 'provider_retry' | 'parse' | 'validation' | 'review' | 'evidence' | 'repair' | 'recheck' | 'preview' | 'apply' | 'undo' | 'background';
export type TaskOutcome = 'started' | 'completed' | 'failed' | 'cancelled' | 'skipped' | 'partial' | 'unresolved' | 'repaired' | 'discarded' | 'supported' | 'observed';
export type TaskReason = 'network' | 'auth' | 'rate_limit' | 'timeout' | 'parse' | 'incomplete' | 'uncertain' | 'policy' | 'stale' | 'disabled' | 'configuration_changed' | 'cancelled' | 'unknown';
export interface TaskTrace { taskId: string; attemptId: string; verification?: boolean; initialAttempt?: boolean }
export interface TaskEvent extends TaskTrace {
  at: number; stage: TaskStage; outcome: TaskOutcome; reason?: TaskReason;
  modelVersion?: string; elapsedMs?: number; count?: number; eligible?: boolean; enabled?: boolean;
}
const KEY = 'agentboard.task-events.v1';
const LIMIT = 2000;

export function readTaskEvents(): TaskEvent[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(value) ? value.filter(e => e && typeof e.taskId === 'string' && typeof e.at === 'number').slice(-LIMIT) : [];
  } catch { return []; }
}

export function recordTaskEvent(trace: TaskTrace, stage: TaskStage, outcome: TaskOutcome,
  details: Pick<TaskEvent, 'reason' | 'elapsedMs' | 'count' | 'eligible' | 'enabled' | 'modelVersion'> = {}) {
  // Copy only named fields, even if the caller passes a wider object.
  const event: TaskEvent = { taskId: trace.taskId, attemptId: trace.attemptId, at: Date.now(), stage, outcome };
  if (typeof trace.initialAttempt === 'boolean') event.initialAttempt = trace.initialAttempt;
  if (trace.verification === true) event.verification = true;
  if (details.modelVersion && /^[a-zA-Z0-9._:/@+-]{1,100}$/.test(details.modelVersion)) event.modelVersion = details.modelVersion;
  if (details.reason) event.reason = details.reason;
  if (details.elapsedMs !== undefined) event.elapsedMs = Math.max(0, Math.round(details.elapsedMs));
  if (details.count !== undefined) event.count = details.count;
  if (details.eligible !== undefined) event.eligible = details.eligible;
  if (details.enabled !== undefined) event.enabled = details.enabled;
  try { localStorage.setItem(KEY, JSON.stringify([...readTaskEvents(), event].slice(-LIMIT))); } catch { /* Diagnostics cannot prevent delivery. */ }
}

export function taskFailureReason(error: unknown, signal?: AbortSignal): TaskReason {
  if (signal?.aborted) {
    const kind = signal.reason?.kind;
    return kind === 'timeout' || signal.reason?.name === 'TimeoutError' ? 'timeout' : kind === 'disabled' ? 'disabled' : kind === 'stale' ? 'stale' : 'cancelled';
  }
  const explicit = (error as { reason?: string })?.reason;
  if (explicit === 'stale' || explicit === 'policy' || explicit === 'incomplete') return explicit;
  const code = (error as { code?: string })?.code;
  return ({ NETWORK_ERROR: 'network', STREAM_ERROR: 'network', AUTH_ERROR: 'auth', RATE_LIMITED: 'rate_limit',
    PARSE_ERROR: 'parse', TIMEOUT: 'timeout', ABORTED: 'cancelled' } as Record<string, TaskReason>)[code ?? ''] ?? 'unknown';
}

export async function measureTaskStage<T>(trace: TaskTrace, stage: TaskStage, operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  const start = Date.now();
  recordTaskEvent(trace, stage, 'started');
  try {
    const result = await operation();
    recordTaskEvent(trace, stage, 'completed', { elapsedMs: Date.now() - start });
    return result;
  } catch (error) {
    const reason = taskFailureReason(error, signal);
    recordTaskEvent(trace, reason === 'parse' ? 'parse' : stage, reason === 'cancelled' ? 'cancelled' : 'failed', { reason, elapsedMs: Date.now() - start });
    throw error;
  }
}
