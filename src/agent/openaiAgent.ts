import type { DSLPatch } from '../types/dsl';
import type { AgentAdapter, AgentError, AgentRequest } from './types';
import { buildSystemPrompt, buildUserMessage } from './prompts';

/** Extract JSON from text, handling markdown code fences */
function extractJson(text: string): string {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m) return m[1].trim();
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s !== -1 && e !== -1 && e > s) return text.slice(s, e + 1);
  return text;
}

function assertIsDSLPatch(obj: unknown): DSLPatch {
  if (!obj || typeof obj !== 'object') throw new Error('Response is not a JSON object');
  const p = obj as Record<string, unknown>;
  if (p.type !== 'dsl_patch') throw new Error('Missing "type": "dsl_patch"');
  if (typeof p.summary !== 'string') throw new Error('Missing "summary"');
  if (!Array.isArray(p.ops)) throw new Error('Missing "ops" array');
  return { type: 'dsl_patch', summary: p.summary as string, ops: p.ops as DSLPatch['ops'], questions: Array.isArray(p.questions) ? p.questions as string[] : [] };
}

export class OpenAIAgentAdapter implements AgentAdapter {
  readonly name: string;

  constructor(private config: { apiKey: string; model?: string; baseUrl?: string }) {
    this.name = `OpenAI (${config.model || 'gpt-4o'})`;
  }

  async generatePatch(request: AgentRequest): Promise<DSLPatch> {
    if (!this.config.apiKey) {
      throw { code: 'AUTH_ERROR', message: '未配置 OpenAI API Key' } satisfies AgentError;
    }

    const systemPrompt = buildSystemPrompt();
    const userMessage = buildUserMessage(request.boardState, request.userMessage);
    const baseUrl = this.config.baseUrl || 'https://api.openai.com/v1';

    let response: Response;
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
      });
    } catch {
      throw { code: 'NETWORK_ERROR', message: '网络请求失败，请检查网络连接或 Base URL' } satisfies AgentError;
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
      const json = extractJson(text);
      return assertIsDSLPatch(JSON.parse(json));
    } catch (err) {
      throw { code: 'PARSE_ERROR', message: `OpenAI 返回内容不是合法的 DSLPatch：${err instanceof Error ? err.message : String(err)}`, rawText: text.slice(0, 2000) } satisfies AgentError;
    }
  }
}
