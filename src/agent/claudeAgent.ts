import type { AgentAdapter, AgentConfig, AgentError, AgentRequest } from './types';
import { buildSystemPrompt, buildUserMessage } from './prompts';
import { fallbackInteractionFromText, parseAgentResponse } from './response';
import { DEFAULT_TIMEOUT_MS, mapAbortError, withTimeout } from './resilience';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

/** Claude API adapter via browser fetch */
export class ClaudeAgentAdapter implements AgentAdapter {
  readonly name: string;

  constructor(private config: AgentConfig) {
    this.name = `Claude (${config.model || 'opus'})`;
  }

  async generateResponse(request: AgentRequest) {
    if (!this.config.apiKey) {
      throw {
        code: 'AUTH_ERROR',
        message: '未配置 API Key。请在 Agent 设置中填入 Claude API Key。',
      } satisfies AgentError;
    }

    const systemPrompt = buildSystemPrompt();
    const userMessage = buildUserMessage(request.boardState, request.userMessage, {
      runId: request.runId,
      runContext: request.runContext,
      recentEditEvents: request.recentEditEvents,
    });

    let response: Response;
    const { signal, cleanup } = withTimeout(request.signal, DEFAULT_TIMEOUT_MS);
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
        signal,
      });
    } catch {
      throw mapAbortError(signal, '网络请求失败，请检查网络连接后重试。');
    } finally {
      cleanup();
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

    try {
      return parseAgentResponse(text);
    } catch (err) {
      const interaction = fallbackInteractionFromText(text, request.runId ?? `run_${Date.now()}`);
      if (interaction) return interaction;
      throw {
        code: 'PARSE_ERROR',
        message: `Agent 返回的内容不是合法的 AgentBoard 响应 JSON：${err instanceof Error ? err.message : String(err)}`,
        rawText: text.slice(0, 2000),
      } satisfies AgentError;
    }
  }
}
