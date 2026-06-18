import type { AgentError, AgentProgressEvent } from './types';

export type AgentStreamEvent =
  | { type: 'progress'; event: AgentProgressEvent }
  | { type: 'result'; text: string }
  | { type: 'error'; message: string };

export function parseAgentStreamLine(line: string): AgentStreamEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  try {
    const value = JSON.parse(trimmed) as AgentStreamEvent;
    if (value.type === 'progress' && value.event?.message) return value;
    if (value.type === 'result' && typeof value.text === 'string') return value;
    if (value.type === 'error' && typeof value.message === 'string') return value;
  } catch {
    return null;
  }

  return null;
}

export async function consumeAgentStream(
  response: Response,
  onProgress?: (event: AgentProgressEvent) => void,
): Promise<string> {
  if (!response.body) {
    throw {
      code: 'API_ERROR',
      message: '本地 CLI 桥接服务没有返回可读取的数据流。',
    } satisfies AgentError;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let resultText: string | undefined;

  const consumeLine = (line: string) => {
    const event = parseAgentStreamLine(line);
    if (!event) return;
    if (event.type === 'progress') onProgress?.(event.event);
    if (event.type === 'result') resultText = event.text;
    if (event.type === 'error') {
      throw {
        code: 'API_ERROR',
        message: event.message,
      } satisfies AgentError;
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) consumeLine(line);
      if (done) break;
    }
  } catch (err) {
    if ((err as AgentError)?.code) throw err;
    throw {
      code: 'STREAM_ERROR',
      message: '与本地 Agent 的实时连接中断。',
      retryable: false,
    } satisfies AgentError;
  }
  if (buffer.trim()) consumeLine(buffer);

  if (resultText === undefined) {
    throw {
      code: 'STREAM_ERROR',
      message: '本地 CLI 实时连接提前结束。',
      retryable: false,
    } satisfies AgentError;
  }
  return resultText;
}
