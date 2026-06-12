import type { DSLPatch } from '../types/dsl';
import type { AgentAdapter, AgentConfig, AgentError, AgentRequest } from './types';
import { buildSystemPrompt, buildUserMessage } from './prompts';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

/** Extract JSON from a string that may contain markdown code fences */
function extractJson(text: string): string {
  // Try fenced block first
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();

  // Try raw JSON (first { to last })
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

/** Claude API adapter via browser fetch */
export class ClaudeAgentAdapter implements AgentAdapter {
  readonly name: string;

  constructor(private config: AgentConfig) {
    this.name = `Claude (${config.model || 'opus'})`;
  }

  async generatePatch(request: AgentRequest): Promise<DSLPatch> {
    if (!this.config.apiKey) {
      throw {
        code: 'AUTH_ERROR',
        message: '未配置 API Key。请在 Agent 设置中填入 Claude API Key。',
      } satisfies AgentError;
    }

    const systemPrompt = buildSystemPrompt();
    const userMessage = buildUserMessage(request.boardState, request.userMessage);

    let response: Response;
    try {
      response = await fetch(ANTHROPIC_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: this.config.model || 'claude-opus-4-20250514',
          max_tokens: 4096,
          temperature: 0,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        }),
      });
    } catch {
      throw {
        code: 'NETWORK_ERROR',
        message: '网络请求失败，请检查网络连接后重试。',
      } satisfies AgentError;
    }

    if (!response.ok) {
      const status = response.status;
      if (status === 401 || status === 403) {
        throw {
          code: 'AUTH_ERROR',
          message: 'API Key 无效或没有权限。请检查 Key 是否正确。',
        } satisfies AgentError;
      }
      if (status === 429) {
        throw {
          code: 'RATE_LIMITED',
          message: '请求过于频繁，请稍后重试。',
        } satisfies AgentError;
      }
      // 4xx or 5xx
      let detail = '';
      try {
        const body = await response.json();
        detail = JSON.stringify(body);
      } catch { /* ignore */ }
      throw {
        code: 'API_ERROR',
        message: `API 返回错误 (${status})${detail ? ': ' + detail : ''}`,
      } satisfies AgentError;
    }

    let text: string;
    try {
      const body = await response.json();
      // Anthropic Messages API returns content blocks
      const content = body?.content;
      if (Array.isArray(content) && content.length > 0 && content[0]?.type === 'text') {
        text = content[0].text;
      } else {
        throw new Error('Unexpected response structure from Anthropic API');
      }
    } catch (err) {
      throw {
        code: 'PARSE_ERROR',
        message: '无法解析 API 响应结构。',
        rawText: String(err),
      } satisfies AgentError;
    }

    // Extract and validate JSON from the response text
    try {
      const jsonStr = extractJson(text);
      const parsed = JSON.parse(jsonStr) as unknown;
      return assertIsDSLPatch(parsed);
    } catch (err) {
      throw {
        code: 'PARSE_ERROR',
        message: `Agent 返回的内容不是合法的 DSLPatch JSON：${err instanceof Error ? err.message : String(err)}`,
        rawText: text.slice(0, 2000),
      } satisfies AgentError;
    }
  }
}
