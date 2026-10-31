import type { AgentProgressEvent } from '../types/dsl';
import { draftTitles } from './liveProgress';

/** Decode SSE frames across arbitrary byte boundaries, forwarding only visible text. */
export async function readApiStream(response: Response, provider: 'openai' | 'claude', signal: AbortSignal, onProgress?: (event: AgentProgressEvent) => void) {
  if (!response.body) throw new Error('服务没有返回内容流');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', data: string[] = [], text = '', completed = false, lastReport = 0, lastSignal = 0;
  const report = (force = false) => {
    const now = Date.now();
    if (!text || (!force && lastReport && now - lastReport < 300)) return;
    lastReport = now;
    onProgress?.({ type: 'output', message: '正在生成内容', outputChars: text.length, previewTitles: draftTitles(text) });
  };
  const dispatch = () => {
    if (!data.length) return;
    const raw = data.join('\n'); data = [];
    if (raw === '[DONE]') { completed = true; return; }
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object') return;
    const now = Date.now();
    if (!lastSignal || now - lastSignal >= 5000) {
      lastSignal = now;
      onProgress?.({ type: 'heartbeat', message: '正在接收服务反馈' });
    }
    if (value.error || value.type === 'error') throw new Error(value.error?.message || '服务暂时无法完成生成');
    if (provider === 'openai') {
      const delta = value.choices?.[0]?.delta?.content;
      if (typeof delta === 'string') { text += delta; report(); }
      if (value.choices?.[0]?.finish_reason === 'length') throw new Error('内容超出当前输出预算，请在 Agent 设置中提高输出预算后重试');
    } else {
      if (value.type === 'content_block_delta' && value.delta?.type === 'text_delta' && typeof value.delta.text === 'string') { text += value.delta.text; report(); }
      if (value.type === 'message_delta' && value.delta?.stop_reason === 'max_tokens') throw new Error('内容超出当前输出预算，请在 Agent 设置中提高输出预算后重试');
      if (value.type === 'message_stop') completed = true;
    }
  };
  const line = (value: string) => {
    if (value === '') dispatch();
    else if (value.startsWith('data:')) data.push(value.slice(5).replace(/^ /, ''));
  };
  const abort = () => { void reader.cancel(signal.reason); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    while (!completed) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      let end: number;
      while ((end = buffer.indexOf('\n')) !== -1) {
        line(buffer.slice(0, end).replace(/\r$/, '')); buffer = buffer.slice(end + 1);
      }
      if (chunk.done) { if (buffer) line(buffer.replace(/\r$/, '')); dispatch(); break; }
    }
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (!completed) throw new Error('连接在生成完成前中断，请重试');
    if (!text.trim()) throw new Error('服务没有返回可展示的内容');
    report(true);
    return text;
  } finally {
    signal.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
