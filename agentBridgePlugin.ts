import type { Plugin } from 'vite';
import { spawn } from 'child_process';
import { KNOWN_CLIS } from './src/server/cliCatalog';
import { createCliRegistry, discoverClis, publicCliInfo, type CliRegistry, type ResolvedCliInfo } from './src/server/cliDiscovery';
import type { ChildProcessWithoutNullStreams } from 'child_process';
import type { IncomingMessage, ServerResponse } from 'http';
import { findAgentResponseJson } from './src/agent/response';
import { readCliEvent, type CliOutputState } from './src/server/cliEvents';
import { draftTitles } from './src/agent/liveProgress';
import type { AgentProgressEvent } from './src/types/dsl';

const CLI_TIMEOUT_MS = 600_000;
const HEARTBEAT_INTERVAL_MS = 5_000;
const RUN_RETENTION_MS = 10 * 60_000;
const MAX_INCOMPLETE_OUTPUT_CHARS = 4_000_000;

type StoredRun = {
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  text?: string;
  error?: string;
  child?: ChildProcessWithoutNullStreams;
  updatedAt: number;
};

const activeRuns = new Map<string, StoredRun>();

function getCliSpec(cliId: string) {
  return KNOWN_CLIS.find(cli => cli.id === cliId);
}

function writeStreamEvent(
  res: ServerResponse,
  event:
    | { type: 'progress'; event: AgentProgressEvent }
    | { type: 'result'; text: string }
    | { type: 'error'; message: string },
) {
  if (!res.writableEnded && !res.destroyed) {
    res.write(`${JSON.stringify(event)}\n`);
  }
}

function buildTimeoutInteractionJson(requestId: string, text: string) {
  const hasPartialOutput = text.trim().length > 0;
  const snippet = text
    .replace(/```json|```/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600);

  return JSON.stringify({
    type: 'interaction_request',
    runId: requestId,
    kind: 'clarification',
    title: '这次生成未能完成',
    message: hasPartialOutput
      ? [
          '本地 CLI 已运行到时间上限，但输出仍未形成可安全应用的完整 JSON。',
          '可以重新尝试原来的目标，也可以先聚焦其中一部分。',
          snippet ? `部分输出：${snippet}` : '',
        ].filter(Boolean).join('\n\n')
      : '本地 CLI 已运行到时间上限且没有返回可用输出。建议缩小任务范围后重试。',
    options: [
      {
        id: 'first_slice',
        label: '重新尝试原来的目标',
        description: '保留原始需求，再尝试一次。',
      },
      {
        id: 'smaller_custom',
        label: '我重新描述范围',
        description: '你可以补充更小的目标，让 Agent 继续当前任务。',
      },
    ],
    allowFreeText: true,
  });
}

/** Run a CLI via stdin and stream sanitized execution events to the browser. */
function runCLIStream(
  requestId: string,
  cli: ResolvedCliInfo,
  systemPrompt: string,
  userMessage: string,
  res: ServerResponse,
  run: StoredRun,
): Promise<string> {
  const fullPrompt = `${systemPrompt}\n\n---\n\n${userMessage}`;
  const spec = getCliSpec(cli.id);
  if (!spec || !cli.path) return Promise.reject(new Error(`CLI "${cli.name}" is not available`));
  const usesEvents = ['claude', 'pi', 'codex'].includes(spec.id);
  const args = spec.promptMode === 'argument' ? [...spec.args, fullPrompt] : spec.args;

  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const state: CliOutputState = {
      partialText: '',
      assistantText: '',
      resultText: '',
      lastTool: undefined as string | undefined,
      lastOutputSentAt: 0,
      seenTools: new Set(),
      outputChars: 0,
    };
    let stdoutBuffer = '';
    let stderr = '';
    let settled = false;
    const child = spawn(cli.path!, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PATH: cli.runtimePath || process.env.PATH },
    });
    run.child = child;
    run.updatedAt = Date.now();

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearInterval(heartbeat);
      fn();
    };

    writeStreamEvent(res, {
      type: 'progress',
      event: { type: 'connected', message: `已连接 ${spec.name}${cli.version ? ` · ${cli.version}` : ''}，正在启动执行`, detail: cli.path },
    });

    const heartbeat = setInterval(() => {
      const elapsedMs = Date.now() - startedAt;
      writeStreamEvent(res, {
        type: 'progress',
        event: {
          type: 'heartbeat',
          message: '本地进程仍在运行',
          elapsedMs,
        },
      });
    }, HEARTBEAT_INTERVAL_MS);

    const timeout = setTimeout(() => {
      if (finishIfCompleteResponse()) return;
      const text = state.resultText || state.partialText || state.assistantText;
      child.kill('SIGTERM');
      finish(() => {
        writeStreamEvent(res, {
          type: 'progress',
          event: { type: 'working', message: 'Agent 输出过长或格式不完整，已转为确认请求' },
        });
        resolve(buildTimeoutInteractionJson(requestId, text));
      });
    }, CLI_TIMEOUT_MS);

    const finishIfCompleteResponse = () => {
      const text = state.resultText || state.partialText || state.assistantText;
      const responseJson = findAgentResponseJson(text);
      if (!responseJson) return false;

      finish(() => {
        writeStreamEvent(res, {
          type: 'progress',
          event: { type: 'working', message: '已获得结构化结果，正在应用到白板' },
        });
        child.kill('SIGTERM');
        resolve(responseJson);
      });
      return true;
    };

    const finishIfOutputTooLarge = () => {
      const text = state.resultText || state.partialText || state.assistantText;
      if (text.length < MAX_INCOMPLETE_OUTPUT_CHARS || findAgentResponseJson(text)) return false;

      finish(() => {
        writeStreamEvent(res, {
          type: 'progress',
          event: { type: 'working', message: 'Agent 输出过长，已停止并请求缩小范围' },
        });
        child.kill('SIGTERM');
        resolve(buildTimeoutInteractionJson(requestId, text));
      });
      return true;
    };

    const reportOutput = () => {
      const now = Date.now();
      const text = state.resultText || state.partialText || state.assistantText;
      if (!text || (state.lastOutputSentAt && now - state.lastOutputSentAt < 300)) return;
      state.lastOutputSentAt = now;
      writeStreamEvent(res, { type: 'progress', event: {
        type: 'output', message: '正在生成内容', outputChars: state.outputChars || text.length,
        previewTitles: draftTitles(text),
      } });
    };
    const consumeLine = (line: string) => {
      for (const event of readCliEvent(spec.id, line, state)) writeStreamEvent(res, { type: 'progress', event });
    };
    child.stdout.setEncoding('utf-8');
    child.stdout.on('data', (chunk: string) => {
      if (settled) return;
      if (!usesEvents) { state.assistantText += chunk; state.outputChars += chunk.length; }
      else {
        stdoutBuffer += chunk;
        const lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop() ?? '';
        for (const line of lines) consumeLine(line);
      }
      reportOutput();
      if (!finishIfCompleteResponse()) finishIfOutputTooLarge();
    });

    child.stderr.setEncoding('utf-8');
    child.stderr.on('data', (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-4000);
    });

    child.on('error', (error) => finish(() => reject(error)));
    child.on('close', (code, signal) => {
      if (stdoutBuffer.trim() && usesEvents) consumeLine(stdoutBuffer);
      const text = state.resultText || state.partialText || state.assistantText;
      if (code === 0 && text.trim()) {
        finish(() => resolve(text.trim()));
        return;
      }
      const detail = stderr.trim() || `CLI exited with code ${code ?? 'unknown'}${signal ? ` (${signal})` : ''}`;
      finish(() => reject(new Error(detail)));
    });

    child.stdin.on('error', (error) => finish(() => reject(error)));
    if (spec.promptMode === 'stdin') {
      child.stdin.end(fullPrompt);
    } else {
      child.stdin.end();
    }
  });
}

/** Parse JSON body from IncomingMessage */
function parseBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}

type MiddlewareFn = (req: IncomingMessage, res: ServerResponse, next: () => void) => void;

/** Create a single middleware that handles both /api/clis and /api/agent/run */
function createApiHandler(registry: CliRegistry): MiddlewareFn {
  return (req, res, next) => {
    const url = new URL(req.url || '/', 'http://localhost');

    // GET /api/clis
    if (url.pathname === '/api/clis' && req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      registry.get(url.searchParams.get('refresh') === '1')
        .then(clis => res.end(JSON.stringify(clis.map(publicCliInfo))))
        .catch(() => { res.statusCode = 500; res.end(JSON.stringify({ error: '本地 CLI 检测失败，请重试。' })); });
      return;
    }

    // POST /api/agent/run
    if (url.pathname === '/api/agent/run' && req.method === 'POST') {
      handleRun(req, res, registry);
      return;
    }

    const runMatch = url.pathname.match(/^\/api\/agent\/run\/([^/]+)$/);
    if (runMatch && req.method === 'GET') {
      handleRunStatus(decodeURIComponent(runMatch[1]), res);
      return;
    }
    if (runMatch && req.method === 'DELETE') {
      handleRunCancel(decodeURIComponent(runMatch[1]), res);
      return;
    }

    next();
  };
}

async function handleRun(req: IncomingMessage, res: ServerResponse, registry: CliRegistry) {
  let requestId = '';
  try {
    const body = await parseBody(req);
    const parsed = JSON.parse(body);
    const { cliId, systemPrompt, userMessage } = parsed;
    requestId = typeof parsed.requestId === 'string' && parsed.requestId
      ? parsed.requestId
      : crypto.randomUUID();

    if (!requestId || !cliId || !systemPrompt || !userMessage) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing required fields: requestId, cliId, systemPrompt, userMessage' }));
      return;
    }

    const clis = await registry.get(true);
    if (res.destroyed || res.writableEnded) return;
    const cli = clis.find((c) => c.id === cliId);
    if (!cli || !cli.available) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: `CLI "${cliId}" is not available` }));
      return;
    }

    console.log(`[agent-bridge] Running ${cliId} (${userMessage.slice(0, 40)}...)`);
    const run: StoredRun = { status: 'running', updatedAt: Date.now() };
    activeRuns.set(requestId, run);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.flushHeaders();

    const text = await runCLIStream(requestId, cli, systemPrompt, userMessage, res, run);
    run.status = 'completed';
    run.text = text;
    run.child = undefined;
    run.updatedAt = Date.now();
    scheduleRunCleanup(requestId);
    console.log(`[agent-bridge] ${cliId} → ${text.length} chars`);

    writeStreamEvent(res, { type: 'result', text });
    res.end();
  } catch (err) {
    console.error('[agent-bridge] Error:', err);
    const message = err instanceof Error ? err.message : String(err);
    const run = requestId ? activeRuns.get(requestId) : undefined;
    if (run && run.status === 'running') {
      run.status = 'failed';
      run.error = message;
      run.child = undefined;
      run.updatedAt = Date.now();
      scheduleRunCleanup(requestId);
    }
    if (res.headersSent) {
      writeStreamEvent(res, { type: 'error', message });
      res.end();
    } else {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: message }));
    }
  }
}

function handleRunStatus(requestId: string, res: ServerResponse) {
  const run = activeRuns.get(requestId);
  if (!run) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Run not found' }));
    return;
  }

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({
    status: run.status,
    text: run.status === 'completed' ? run.text : undefined,
    error: run.status === 'failed' || run.status === 'cancelled' ? run.error : undefined,
  }));
}

function handleRunCancel(requestId: string, res: ServerResponse) {
  const run = activeRuns.get(requestId);
  if (!run) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Run not found' }));
    return;
  }

  if (run.status === 'running') {
    run.status = 'cancelled';
    run.error = '用户已停止当前请求。';
    run.updatedAt = Date.now();
    run.child?.kill('SIGTERM');
    run.child = undefined;
    scheduleRunCleanup(requestId);
  }
  res.statusCode = 204;
  res.end();
}

function scheduleRunCleanup(requestId: string) {
  setTimeout(() => {
    const run = activeRuns.get(requestId);
    if (run && Date.now() - run.updatedAt >= RUN_RETENTION_MS) {
      activeRuns.delete(requestId);
    }
  }, RUN_RETENTION_MS);
}

export function agentBridgePlugin(): Plugin {
  return {
    name: 'agent-bridge',
    configureServer(server) {
      const registry = createCliRegistry(() => discoverClis(KNOWN_CLIS));

      const handler = createApiHandler(registry);

      // Add to middleware stack — goes to the end
      server.middlewares.use(handler);

      // Post-setup: move our handler to the FRONT of the stack
      // so it runs before Vite's SPA HTML fallback
      return () => {
        const stack = (server.middlewares as unknown as { stack: Array<{ route: string; handle: MiddlewareFn }> }).stack;
        const idx = stack.findIndex((layer) => layer.handle === handler);
        if (idx > 0) {
          const [layer] = stack.splice(idx, 1);
          stack.unshift(layer);
          console.log('[agent-bridge] API handler moved to front of middleware stack');
        }
      };
    },
  };
}
