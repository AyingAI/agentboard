import type { Plugin } from 'vite';
import { execSync, spawn } from 'child_process';
import type { ChildProcessWithoutNullStreams } from 'child_process';
import type { IncomingMessage, ServerResponse } from 'http';
import { findAgentResponseJson } from './src/agent/response';

interface CliInfo {
  id: string;
  name: string;
  available: boolean;
  version?: string;
}

type CliPromptMode = 'stdin' | 'argument';

type CliSpec = {
  id: string;
  name: string;
  commands: string[];
  versionArgs: string[];
  args: string[];
  promptMode: CliPromptMode;
};

const KNOWN_CLIS: CliSpec[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    commands: ['claude'],
    versionArgs: ['--version'],
    args: [
      '--permission-mode',
      'auto',
      '-p',
      '--output-format',
      'stream-json',
      '--include-partial-messages',
      '--verbose',
    ],
    promptMode: 'stdin',
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    commands: ['opencode'],
    versionArgs: ['--version'],
    args: ['run'],
    promptMode: 'stdin',
  },
  {
    id: 'pi',
    name: 'Pi CLI',
    commands: ['pi'],
    versionArgs: ['--version'],
    args: ['--print', '--mode', 'text'],
    promptMode: 'stdin',
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    commands: ['codex'],
    versionArgs: ['--version'],
    args: ['exec', '--ask-for-approval', 'never', '--sandbox', 'workspace-write', '--color', 'never', '-'],
    promptMode: 'stdin',
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    commands: ['gemini'],
    versionArgs: ['--version'],
    args: ['--prompt', '', '--output-format', 'text'],
    promptMode: 'stdin',
  },
  {
    id: 'antigravity',
    name: 'Antigravity CLI',
    commands: ['agy'],
    versionArgs: ['--version'],
    args: ['-p'],
    promptMode: 'argument',
  },
  {
    id: 'qwen',
    name: 'Qwen Code',
    commands: ['qwen', 'qwen-code'],
    versionArgs: ['--version'],
    args: ['--prompt', '', '--output-format', 'text'],
    promptMode: 'stdin',
  },
  {
    id: 'cursor-agent',
    name: 'Cursor Agent',
    commands: ['cursor-agent'],
    versionArgs: ['--version'],
    args: ['-p'],
    promptMode: 'argument',
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot CLI',
    commands: ['copilot'],
    versionArgs: ['--version'],
    args: ['-s', '-p'],
    promptMode: 'argument',
  },
  {
    id: 'qoder',
    name: 'Qoder CLI',
    commands: ['qodercli', 'qoderclicn'],
    versionArgs: ['--version'],
    args: ['-q', '--output-format', 'text', '-p'],
    promptMode: 'argument',
  },
  {
    id: 'kimi',
    name: 'Kimi Code CLI',
    commands: ['kimi', 'kimi-cli'],
    versionArgs: ['--version'],
    args: ['--output-format', 'text', '-p'],
    promptMode: 'argument',
  },
  {
    id: 'trae',
    name: 'Trae CLI',
    commands: ['trae-cli'],
    versionArgs: ['--version'],
    args: ['run'],
    promptMode: 'argument',
  },
];

const CLI_TIMEOUT_MS = 240_000;
const HEARTBEAT_INTERVAL_MS = 5_000;
const RUN_RETENTION_MS = 10 * 60_000;
const MAX_INCOMPLETE_OUTPUT_CHARS = 12_000;

type StoredRun = {
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  text?: string;
  error?: string;
  child?: ChildProcessWithoutNullStreams;
  updatedAt: number;
};

const activeRuns = new Map<string, StoredRun>();

function detectCLIs(): CliInfo[] {
  return KNOWN_CLIS.map((cli) => {
    try {
      const detected = resolveCliCommand(cli);
      if (!detected) throw new Error('CLI not found');
      let version = '';
      try {
        version = execSync([detected.command, ...cli.versionArgs].join(' '), { stdio: 'pipe', encoding: 'utf-8' }).trim();
      } catch {
        // version check is best-effort
      }
      return { id: cli.id, name: cli.name, available: true, version: version || detected.path };
    } catch {
      return { id: cli.id, name: cli.name, available: false };
    }
  });
}

function getCliSpec(cliId: string) {
  return KNOWN_CLIS.find((cli) => cli.id === cliId);
}

function resolveCliCommand(cli: CliSpec) {
  for (const command of cli.commands) {
    try {
      const path = execSync(`which ${command}`, { stdio: 'pipe', encoding: 'utf-8' }).trim();
      if (path) return { command, path };
    } catch {
      // Try the next alias.
    }
  }
  return null;
}

type BridgeProgressEvent = {
  type: 'connected' | 'working' | 'tool' | 'output' | 'heartbeat';
  message: string;
  detail?: string;
  elapsedMs?: number;
  outputChars?: number;
};

function writeStreamEvent(
  res: ServerResponse,
  event:
    | { type: 'progress'; event: BridgeProgressEvent }
    | { type: 'result'; text: string }
    | { type: 'error'; message: string },
) {
  if (!res.writableEnded && !res.destroyed) {
    res.write(`${JSON.stringify(event)}\n`);
  }
}

function toolLabel(name: string) {
  const labels: Record<string, string> = {
    Bash: '运行命令',
    Read: '读取文件',
    Edit: '编辑文件',
    Write: '写入文件',
    Glob: '查找文件',
    Grep: '搜索内容',
    WebSearch: '搜索网页',
    WebFetch: '读取网页',
  };
  return labels[name] ?? `使用工具 ${name}`;
}

function handleClaudeEvent(
  line: string,
  res: ServerResponse,
  state: {
    partialText: string;
    assistantText: string;
    resultText: string;
    lastTool?: string;
    lastOutputSentAt: number;
  },
) {
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return;
  }

  if (event.type === 'system' && event.subtype === 'init') {
    writeStreamEvent(res, {
      type: 'progress',
      event: { type: 'connected', message: 'Claude Code 已启动，正在分析任务' },
    });
    return;
  }

  if (event.type === 'stream_event') {
    const streamEvent = event.event as Record<string, unknown> | undefined;
    if (streamEvent?.type === 'content_block_delta') {
      const delta = streamEvent.delta as Record<string, unknown> | undefined;
      if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
        state.partialText += delta.text;
        const now = Date.now();
        if (state.lastOutputSentAt === 0 || now - state.lastOutputSentAt >= 300) {
          state.lastOutputSentAt = now;
          writeStreamEvent(res, {
            type: 'progress',
            event: {
              type: 'output',
              message: `正在生成结构化结果（${state.partialText.length} 字）`,
              outputChars: state.partialText.length,
            },
          });
        }
      }
    }
    return;
  }

  if (event.type === 'assistant') {
    const message = event.message as { content?: Array<Record<string, unknown>> } | undefined;
    for (const block of message?.content ?? []) {
      if (block.type === 'tool_use' && typeof block.name === 'string' && block.name !== state.lastTool) {
        state.lastTool = block.name;
        writeStreamEvent(res, {
          type: 'progress',
          event: { type: 'tool', message: toolLabel(block.name) },
        });
      }
      if (block.type === 'text' && typeof block.text === 'string') {
        state.assistantText = block.text;
      }
    }
    return;
  }

  if (event.type === 'result' && typeof event.result === 'string') {
    state.resultText = event.result;
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
    title: '本地 Agent 输出过长',
    message: hasPartialOutput
      ? [
          '本地 CLI 已运行到时间上限，但输出仍未形成可安全应用的完整 JSON。',
          '我已经保留了部分输出线索。建议把这次任务拆小，例如先生成「产品定位 + 核心判断 + 目标客户」三个节点，再继续补充其它模块。',
          snippet ? `部分输出：${snippet}` : '',
        ].filter(Boolean).join('\n\n')
      : '本地 CLI 已运行到时间上限且没有返回可用输出。建议缩小任务范围后重试。',
    options: [
      {
        id: 'first_slice',
        label: '先生成前三块',
        description: '只生成产品定位、核心判断、目标客户，降低超时和 JSON 损坏概率。',
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
  cliId: string,
  systemPrompt: string,
  userMessage: string,
  res: ServerResponse,
  run: StoredRun,
): Promise<string> {
  const fullPrompt = `${systemPrompt}\n\n---\n\n${userMessage}`;
  const spec = getCliSpec(cliId);
  if (!spec) return Promise.reject(new Error(`Unsupported CLI "${cliId}"`));
  const detected = resolveCliCommand(spec);
  if (!detected) return Promise.reject(new Error(`CLI "${spec.name}" is not available`));
  const isClaude = spec.id === 'claude';
  const args = spec.promptMode === 'argument' ? [...spec.args, fullPrompt] : spec.args;

  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const state = {
      partialText: '',
      assistantText: '',
      resultText: '',
      lastTool: undefined as string | undefined,
      lastOutputSentAt: 0,
    };
    let stdoutBuffer = '';
    let stderr = '';
    let settled = false;
    const child = spawn(detected.command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
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
      event: { type: 'connected', message: `已连接 ${spec.name}，正在启动执行` },
    });

    const heartbeat = setInterval(() => {
      const elapsedMs = Date.now() - startedAt;
      writeStreamEvent(res, {
        type: 'progress',
        event: {
          type: 'heartbeat',
          message: `Agent 仍在执行（${Math.round(elapsedMs / 1000)}s）`,
          elapsedMs,
        },
      });
    }, HEARTBEAT_INTERVAL_MS);

    const timeout = setTimeout(() => {
      if (finishIfCompleteResponse()) return;
      const text = state.resultText || state.assistantText || state.partialText;
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
      const text = state.resultText || state.assistantText || state.partialText;
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
      const text = state.resultText || state.assistantText || state.partialText;
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

    child.stdout.setEncoding('utf-8');
    child.stdout.on('data', (chunk: string) => {
      if (!isClaude) {
        state.assistantText += chunk;
        const now = Date.now();
        if (state.lastOutputSentAt === 0 || now - state.lastOutputSentAt >= 300) {
          state.lastOutputSentAt = now;
          writeStreamEvent(res, {
            type: 'progress',
            event: {
              type: 'output',
              message: `正在生成结构化结果（${state.assistantText.length} 字）`,
              outputChars: state.assistantText.length,
            },
          });
        }
        if (!finishIfCompleteResponse()) finishIfOutputTooLarge();
        return;
      }

      stdoutBuffer += chunk;
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() ?? '';
      for (const line of lines) handleClaudeEvent(line, res, state);
      if (!finishIfCompleteResponse()) finishIfOutputTooLarge();
    });

    child.stderr.setEncoding('utf-8');
    child.stderr.on('data', (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-4000);
    });

    child.on('error', (error) => finish(() => reject(error)));
    child.on('close', (code, signal) => {
      if (stdoutBuffer.trim() && isClaude) handleClaudeEvent(stdoutBuffer, res, state);
      const text = state.resultText || state.assistantText || state.partialText;
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
function createApiHandler(clis: CliInfo[]): MiddlewareFn {
  return (req, res, next) => {
    const url = new URL(req.url || '/', 'http://localhost');

    // GET /api/clis
    if (url.pathname === '/api/clis' && req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(clis));
      return;
    }

    // POST /api/agent/run
    if (url.pathname === '/api/agent/run' && req.method === 'POST') {
      handleRun(req, res, clis);
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

async function handleRun(req: IncomingMessage, res: ServerResponse, clis: CliInfo[]) {
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

    const text = await runCLIStream(requestId, cliId, systemPrompt, userMessage, res, run);
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
      const clis = detectCLIs();
      console.log(
        '[agent-bridge] Detected CLIs:',
        clis.filter((c) => c.available).map((c) => c.name).join(', ') || 'none',
      );

      const handler = createApiHandler(clis);

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
