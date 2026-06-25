import type { AgentAdapter, AgentError, AgentRequest } from './types';
import { buildSystemPrompt, buildUserMessage } from './prompts';
import { fallbackInteractionFromText, parseAgentResponse } from './response';
import { DEFAULT_TIMEOUT_MS, mapAbortError, withTimeout } from './resilience';

export class OpenAIAgentAdapter implements AgentAdapter {
  readonly name: string;

  constructor(private config: { apiKey: string; model?: string; baseUrl?: string }) {
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
    });
    const baseUrl = this.config.baseUrl || 'https://api.openai.com/v1';

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
          model: this.config.model || 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          temperature: 0,
          max_tokens: 4096,
        }),
        signal,
      });
    } catch {
      throw mapAbortError(signal, '网络请求失败，请检查网络连接或 Base URL');
    } finally {
      cleanup();
    }

    if (!response.ok) {
      const status = response.status;
      if (status === 401 || status === 403) throw { code: 'AUTH_ERROR', message: 'API Key 无效' } satisfies AgentError;
      if (status === 429) throw { code: 'RATE_LIMITED', message: '请求频率过高，请稍后重试' } satisfies AgentError;
      throw { code: 'API_ERROR', message: `API 返回错误 (${status})` } satisfies AgentError;
    }

    let text: string;
    try {
      const body = await response.json();
      text = body?.choices?.[0]?.message?.content || '';
      if (!text) throw new Error('Empty response from OpenAI API');
    } catch (err) {
      throw { code: 'PARSE_ERROR', message: '无法解析 OpenAI API 响应', rawText: String(err) } satisfies AgentError;
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
