import type { AgentAdapter, AgentConfig, AgentError, AgentRequest } from './types';
import { buildSystemPrompt, buildUserMessage } from './prompts';
import { fallbackInteractionFromText, parseAgentResponse } from './response';
import { readApiStream } from './apiStream';
import { DEFAULT_TIMEOUT_MS, mapAbortError, withTimeout } from './resilience';

const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1';
const ANTHROPIC_VERSION = '2023-06-01';

function normalizeClaudeBaseUrl(rawUrl: string | undefined) {
  const value = (rawUrl || DEFAULT_ANTHROPIC_BASE_URL).trim().replace(/\/+$/, '');
  if (/\/v\d+$/i.test(value)) return value;
  return `${value}/v1`;
}

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
      taskPolicy: request.taskPolicy,
    });

    let response: Response;
    const apiUrl = `${normalizeClaudeBaseUrl(this.config.baseUrl)}/messages`;
    const { signal, cleanup } = withTimeout(request.signal, DEFAULT_TIMEOUT_MS);
    try {
      response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          stream: true,
          model: this.config.model || 'claude-opus-4-20250514',
          max_tokens: this.config.maxOutputTokens || 16384,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        }),
        signal,
      });
    } catch {
      cleanup();
      throw mapAbortError(signal, '网络请求失败，请检查网络连接后重试。');
    }

    if (!response.ok) {
      cleanup();
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

    request.onProgress?.({ type: 'connected', message: '已连接模型服务' });
    let text: string;
    try {
      if (response.headers?.get('content-type')?.includes('text/event-stream')) {
        text = await readApiStream(response, 'claude', signal, request.onProgress);
      } else {
        const body = await response.json();
        text = Array.isArray(body?.content) ? body.content.filter((part: { type: string; text?: string }) => part.type === 'text' && typeof part.text === 'string').map((part: { text: string }) => part.text).join('\n') : '';
        if (!text) throw new Error('服务没有返回可展示的内容');
      }
    } catch (err) {
      if (signal.aborted) throw mapAbortError(signal, '生成已中断');
      throw {
        code: 'PARSE_ERROR',
        message: err instanceof Error ? err.message : '无法解析 API 响应结构。',
        rawText: String(err),
      } satisfies AgentError;
    } finally {
      cleanup();
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
