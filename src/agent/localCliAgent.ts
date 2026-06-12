import type { DSLPatch } from '../types/dsl';
import type { AgentAdapter, AgentError, AgentRequest } from './types';
import { buildSystemPrompt, buildUserMessage } from './prompts';

/** Extract JSON from text, handling markdown code fences */
function extractJson(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start, end + 1);
  }
  return text;
}

/** Validate that a parsed object looks like a DSLPatch */
function assertIsDSLPatch(obj: unknown): DSLPatch {
  if (!obj || typeof obj !== 'object') {
    throw new Error('Response is not a JSON object');
  }
  const patch = obj as Record<string, unknown>;
  if (patch.type !== 'dsl_patch') {
    throw new Error(`Missing or invalid "type" field: expected "dsl_patch", got "${String(patch.type)}"`);
  }
  if (typeof patch.summary !== 'string') {
    throw new Error('Missing or invalid "summary" field');
  }
  if (!Array.isArray(patch.ops)) {
    throw new Error('Missing or invalid "ops" array');
  }
  return {
    type: 'dsl_patch',
    summary: patch.summary as string,
    ops: patch.ops as DSLPatch['ops'],
    questions: Array.isArray(patch.questions) ? (patch.questions as string[]) : [],
  };
}

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
async function runLocalCli(cliId: string, systemPrompt: string, userMessage: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch('/api/agent/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliId, systemPrompt, userMessage }),
    });
  } catch {
    throw {
      code: 'NETWORK_ERROR',
      message: '无法连接到本地 CLI 桥接服务。请确认 dev server 正在运行（npm run dev）。',
    } satisfies AgentError;
  }

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

  const body = await res.json();
  if (body.error) {
    throw { code: 'API_ERROR', message: body.error } satisfies AgentError;
  }
  return body.text as string;
}

/** Local CLI adapter — calls a local agent CLI through the Vite dev server */
export class LocalCliAdapter implements AgentAdapter {
  readonly name: string;

  constructor(private cliId: string) {
    this.name = `Local: ${cliId}`;
  }

  async generatePatch(request: AgentRequest): Promise<DSLPatch> {
    const systemPrompt = buildSystemPrompt();
    const userMessage = buildUserMessage(request.boardState, request.userMessage);

    let text: string;
    try {
      text = await runLocalCli(this.cliId, systemPrompt, userMessage);
    } catch (err) {
      // Network / API errors already have code, re-throw
      throw err;
    }

    try {
      const jsonStr = extractJson(text);
      const parsed = JSON.parse(jsonStr) as unknown;
      return assertIsDSLPatch(parsed);
    } catch (err) {
      throw {
        code: 'PARSE_ERROR',
        message: `无法解析 ${this.cliId} 的输出为 DSLPatch：${err instanceof Error ? err.message : String(err)}`,
        rawText: text.slice(0, 2000),
      } satisfies AgentError;
    }
  }
}

/** Detect available CLIs from the dev server. Returns empty array if server not available. */
export { fetchCLIs };
