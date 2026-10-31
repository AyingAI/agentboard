import type { AgentAdapter, AgentError, AgentRequest } from './types';
import { buildSystemPrompt, buildUserMessage } from './prompts';
import { fallbackInteractionFromText, parseAgentResponse } from './response';
import { readApiStream } from './apiStream';
import { DEFAULT_TIMEOUT_MS, mapAbortError, withTimeout } from './resilience';

function normalizeOpenAIBaseUrl(rawUrl: string | undefined) {
  const value = (rawUrl || 'https://api.openai.com/v1').trim().replace(/\/+$/, '');
  if (/\/v\d+$/i.test(value)) return value;
  return `${value}/v1`;
}

export class OpenAIAgentAdapter implements AgentAdapter {
  readonly name: string;

  constructor(private config: { apiKey: string; model?: string; baseUrl?: string; maxOutputTokens?: number }) {
    this.name = `OpenAI (${config.model || 'gpt-4o'})`;
  }

  async generateResponse(request: AgentRequest) {
    if (!this.config.apiKey) {
      throw { code: 'AUTH_ERROR', message: '未配置 OpenAI API Key' } satisfies AgentError;
    }

    const systemPrompt = buildSystemPrompt();
    const userMessage = buildUserMessage(request.boardState, request.userMessage, {
      runId: request.runId,
      runContext: request.runContext,
      recentEditEvents: request.recentEditEvents,
      taskPolicy: request.taskPolicy,
    });
    const baseUrl = normalizeOpenAIBaseUrl(this.config.baseUrl);

    let response: Response;
    const { signal, cleanup } = withTimeout(request.signal, DEFAULT_TIMEOUT_MS);
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          stream: true,
          model: this.config.model || 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          ...(new URL(baseUrl).hostname === 'api.openai.com'
            ? { max_completion_tokens: this.config.maxOutputTokens || 16384 }
            : { max_tokens: this.config.maxOutputTokens || 16384 }),
        }),
        signal,
      });
    } catch {
      cleanup();
      throw mapAbortError(signal, '网络请求失败，请检查网络连接或 Base URL');
    }

    if (!response.ok) {
      cleanup();
      const status = response.status;
      if (status === 401 || status === 403) throw { code: 'AUTH_ERROR', message: 'API Key 无效' } satisfies AgentError;
      if (status === 429) throw { code: 'RATE_LIMITED', message: '请求频率过高，请稍后重试' } satisfies AgentError;
      throw { code: 'API_ERROR', message: `API 返回错误 (${status})` } satisfies AgentError;
    }

    request.onProgress?.({ type: 'connected', message: '已连接模型服务' });
    let text: string;
    try {
      if (response.headers?.get('content-type')?.includes('text/event-stream')) {
        text = await readApiStream(response, 'openai', signal, request.onProgress);
      } else {
        const body = await response.json();
        text = body?.choices?.[0]?.message?.content || '';
        if (!text) throw new Error('服务没有返回可展示的内容');
      }
    } catch (err) {
      if (signal.aborted) throw mapAbortError(signal, '生成已中断');
      throw { code: 'PARSE_ERROR', message: err instanceof Error ? err.message : '无法解析 OpenAI API 响应', rawText: String(err) } satisfies AgentError;
    } finally {
      cleanup();
    }

    try {
      return parseAgentResponse(text);
    } catch (err) {
      const interaction = fallbackInteractionFromText(text, request.runId ?? `run_${Date.now()}`);
      if (interaction) return interaction;
      throw { code: 'PARSE_ERROR', message: `OpenAI 返回内容不是合法的 AgentBoard 响应：${err instanceof Error ? err.message : String(err)}`, rawText: text.slice(0, 2000) } satisfies AgentError;
    }
  }
}
