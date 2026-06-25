import type { AgentError } from './types';

/** Default per-attempt timeout for an agent call (ms). Local CLIs can be slow. */
export const DEFAULT_TIMEOUT_MS = 120_000;

/** Default number of retry attempts for transient errors (total tries = retries + 1). */
export const DEFAULT_RETRIES = 2;

/** Error codes that are worth retrying — transient by nature. */
const RETRYABLE_CODES: ReadonlySet<AgentError['code']> = new Set([
  'NETWORK_ERROR',
  'RATE_LIMITED',
  'TIMEOUT',
]);

/** True when this error is a user-initiated cancellation. */
export function isAborted(err: unknown): boolean {
  return (err as AgentError)?.code === 'ABORTED';
}

/** True when this error is worth retrying. PARSE/AUTH/API are not retried. */
export function isRetryable(err: unknown): boolean {
  const e = err as AgentError;
  if (!e || typeof e !== 'object') return false;
  if (e.retryable === false) return false;
  if (e.retryable === true) return true;
  return RETRYABLE_CODES.has(e.code);
}

/**
 * Merge an optional external abort signal with a fresh timeout signal.
 * Returns the combined signal plus a cleanup() to clear the timer.
 *
 * Either the caller aborting or the timeout firing will abort the returned
 * signal. We can tell them apart afterwards via signal.reason.
 */
export function withTimeout(
  external: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();

  const onExternalAbort = () => controller.abort({ kind: 'external' });
  if (external) {
    if (external.aborted) controller.abort({ kind: 'external' });
    else external.addEventListener('abort', onExternalAbort, { once: true });
  }

  const timer = setTimeout(() => controller.abort({ kind: 'timeout' }), timeoutMs);

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      external?.removeEventListener('abort', onExternalAbort);
    },
  };
}

/**
 * Map a fetch rejection to a structured AgentError, distinguishing a real
 * network failure from a timeout vs a user cancellation. `signal` is the
 * combined signal returned by withTimeout, whose reason carries the cause.
 */
export function mapAbortError(signal: AbortSignal, fallbackMessage: string): AgentError {
  const reason = (signal.reason ?? {}) as { kind?: string };
  if (reason.kind === 'timeout') {
    return { code: 'TIMEOUT', message: '调用超时，请重试或检查网络 / 本地 CLI 是否卡住。', retryable: true };
  }
  if (reason.kind === 'external') {
    return { code: 'ABORTED', message: '已取消。', retryable: false };
  }
  return { code: 'NETWORK_ERROR', message: fallbackMessage, retryable: true };
}

/**
 * Run an async operation with bounded retries on transient errors.
 * Aborted (cancelled) calls are never retried. The delay between attempts is
 * itself cancellable via the external signal.
 */
export async function withRetry<T>(
  op: () => Promise<T>,
  opts: { retries?: number; signal?: AbortSignal; onRetry?: (attempt: number, err: unknown) => void } = {},
): Promise<T> {
  const retries = opts.retries ?? DEFAULT_RETRIES;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (opts.signal?.aborted) throw { code: 'ABORTED', message: '已取消。', retryable: false } satisfies AgentError;
    try {
      return await op();
    } catch (err) {
      lastErr = err;
      if (isAborted(err) || !isRetryable(err) || attempt === retries) throw err;
      opts.onRetry?.(attempt + 1, err);
      // Exponential-ish backoff: 400ms, 800ms… cancellable.
      await delay(400 * 2 ** attempt, opts.signal);
    }
  }

  throw lastErr;
}

/** A cancellable delay. Rejects with ABORTED if the signal fires first. */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject({ code: 'ABORTED', message: '已取消。', retryable: false } satisfies AgentError);
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject({ code: 'ABORTED', message: '已取消。', retryable: false } satisfies AgentError);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
