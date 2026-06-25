import type { AgentAdapter, AgentError, AgentProgressEvent, AgentRequest } from './types';
import { buildSystemPrompt, buildUserMessage } from './prompts';
import { fallbackInteractionFromText, parseAgentResponse } from './response';
import { mapAbortError, withTimeout } from './resilience';
import { consumeAgentStream } from './stream';

const LOCAL_CLI_TIMEOUT_MS = 300_000;
const POLL_INTERVAL_MS = 1_000;

interface CliInfo {
  id: string;
  name: string;
  available: boolean;
  version?: string;
}

/** Fetch available CLIs from the dev server. Returns empty on any error. */
async function fetchCLIs(): Promise<CliInfo[]> {
  try {
    const res = await fetch('/api/clis');
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

/** Run a prompt through a local CLI via the dev server bridge */
async function runLocalCli(
  cliId: string,
  systemPrompt: string,
  userMessage: string,
  externalSignal?: AbortSignal,
  requestProgress?: (event: AgentProgressEvent) => void,
): Promise<string> {
  let res: Response;
  const { signal, cleanup } = withTimeout(externalSignal, LOCAL_CLI_TIMEOUT_MS);
  const requestId = crypto.randomUUID();
  const cancelServerRun = () => {
    void fetch(`/api/agent/run/${encodeURIComponent(requestId)}`, {
      method: 'DELETE',
      keepalive: true,
    }).catch(() => undefined);
  };
  signal.addEventListener('abort', cancelServerRun, { once: true });
  try {
    res = await fetch('/api/agent/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId, cliId, systemPrompt, userMessage }),
      signal,
    });

    if (!res.ok) {
      let errorMsg = `Server error (${res.status})`;
      try {
        const body = await res.json();
        if (body.error) errorMsg = body.error;
      } catch { /* ignore */ }
      throw {
        code: 'API_ERROR',
        message: `本地 CLI 调用失败：${errorMsg}`,
      } satisfies AgentError;
    }

    try {
      return await consumeAgentStream(res, requestProgress);
    } catch (err) {
      if ((err as AgentError)?.code !== 'STREAM_ERROR') throw err;
      requestProgress?.({
        type: 'working',
        message: '实时连接中断，Agent 仍在后台执行',
        detail: '正在恢复连接并查询最终结果。',
      });
      return await pollLocalCliResult(requestId, signal, requestProgress);
    }
  } catch (err) {
    if ((err as AgentError)?.code) throw err;
    throw mapAbortError(signal, '无法连接到本地 CLI 桥接服务。请确认 dev server 正在运行（npm run dev）。');
  } finally {
    signal.removeEventListener('abort', cancelServerRun);
    cleanup();
  }
}

export async function pollLocalCliResult(
  requestId: string,
  signal: AbortSignal,
  onProgress?: (event: AgentProgressEvent) => void,
): Promise<string> {
  while (!signal.aborted) {
    let response: Response;
    try {
      response = await fetch(`/api/agent/run/${encodeURIComponent(requestId)}`, { signal });
    } catch {
      if (signal.aborted) throw mapAbortError(signal, '本地 Agent 查询已中断。');
      await wait(POLL_INTERVAL_MS, signal);
      continue;
    }

    if (response.status === 404) {
      return buildLostRunInteractionJson(requestId);
    }
    if (!response.ok) {
      throw {
        code: 'API_ERROR',
        message: `查询本地 Agent 结果失败（${response.status}）。`,
      } satisfies AgentError;
    }

    const body = await response.json() as {
      status: 'running' | 'completed' | 'failed' | 'cancelled';
      text?: string;
      error?: string;
    };
    if (body.status === 'completed' && typeof body.text === 'string') return body.text;
    if (body.status === 'failed' || body.status === 'cancelled') {
      throw {
        code: 'API_ERROR',
        message: body.error || (body.status === 'cancelled' ? '本地 Agent 已取消。' : '本地 Agent 执行失败。'),
      } satisfies AgentError;
    }

    onProgress?.({
      type: 'heartbeat',
      message: '连接恢复中，Agent 仍在后台执行',
    });
    await wait(POLL_INTERVAL_MS, signal);
  }

  throw mapAbortError(signal, '本地 Agent 查询已中断。');
}

function buildLostRunInteractionJson(requestId: string): string {
  return JSON.stringify({
    type: 'interaction_request',
    runId: requestId,
    kind: 'clarification',
    title: '本地 Agent 运行状态已丢失',
    message: [
      '本地 CLI 的后台运行记录已经不存在，常见原因是 dev server 重启、连接中断后内存状态被清空，或本地进程被系统回收。',
      '这不是白板数据损坏。建议用更小范围继续执行，避免再次触发长时间运行。',
    ].join('\n\n'),
    options: [
      {
        id: 'retry_smaller',
        label: '缩小范围重试',
        description: '只生成 1-3 个节点，成功后再继续补充。',
      },
      {
        id: 'custom_scope',
        label: '我重新描述范围',
        description: '手动输入更小、更明确的任务。',
      },
    ],
    allowFreeText: true,
  });
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(mapAbortError(signal, '本地 Agent 查询已中断。'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** Local CLI adapter — calls a local agent CLI through the Vite dev server */
export class LocalCliAdapter implements AgentAdapter {
  readonly name: string;

  constructor(private cliId: string) {
    this.name = `Local: ${cliId}`;
  }

  async generateResponse(request: AgentRequest) {
    const systemPrompt = buildSystemPrompt();
    const userMessage = buildUserMessage(request.boardState, request.userMessage, {
      runId: request.runId,
      runContext: request.runContext,
      recentEditEvents: request.recentEditEvents,
    });

    let text: string;
    try {
      text = await runLocalCli(
        this.cliId,
        systemPrompt,
        userMessage,
        request.signal,
        request.onProgress,
      );
    } catch (err) {
      // Network / API / abort errors already have code, re-throw
      throw err;
    }

    try {
      return parseAgentResponse(text);
    } catch (err) {
      const interaction = fallbackInteractionFromText(text, request.runId ?? `run_${Date.now()}`);
      if (interaction) return interaction;
      throw {
        code: 'PARSE_ERROR',
        message: `无法解析 ${this.cliId} 的输出为 AgentBoard 响应：${err instanceof Error ? err.message : String(err)}`,
        rawText: text.slice(0, 2000),
      } satisfies AgentError;
    }
  }
}

/** Detect available CLIs from the dev server. Returns empty array if server not available. */
export { fetchCLIs };
