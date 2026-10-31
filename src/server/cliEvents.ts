import type { AgentProgressEvent } from '../types/dsl';

export interface CliOutputState {
  outputChars: number;
  partialText: string;
  assistantText: string;
  resultText: string;
  lastTool?: string;
  lastOutputSentAt: number;
  seenTools: Set<string>;
}

export function toolLabel(name: string) {
  const key = name.toLowerCase().replace(/^.*__/, '');
  const names: Record<string, string> = {
    bash: '正在运行命令', shell: '正在运行命令', read: '正在阅读材料', read_file: '正在阅读材料',
    edit: '正在修改内容', write: '正在编写内容', write_file: '正在编写内容', glob: '正在查找文件',
    grep: '正在查找相关内容', find: '正在查找文件', websearch: '正在搜索资料', web_search: '正在搜索资料',
    webfetch: '正在阅读网页', web_fetch: '正在阅读网页', fetch: '正在阅读网页',
  };
  return names[key] || '正在使用工具探索';
}

function textContent(message: any): string {
  if (!message || (message.role && message.role !== 'assistant')) return '';
  return Array.isArray(message.content) ? message.content.filter((part: any) => part.type === 'text' && typeof part.text === 'string').map((part: any) => part.text).join('\n') : '';
}

/** Provider event metadata only. Thinking text, arguments and tool results never leave this parser. */
export function readCliEvent(provider: string, line: string, state: CliOutputState): AgentProgressEvent[] {
  let value: any;
  try { value = JSON.parse(line); } catch { return []; }
  if (!value || typeof value !== 'object') return [];
  const progress: AgentProgressEvent[] = [];
  function tool(name: string, id?: string) {
    if (typeof name !== 'string') return;
    const key = id || name;
    if (state.seenTools.has(key)) return;
    state.seenTools.add(key); state.lastTool = name;
    progress.push({ type: 'tool', message: toolLabel(name), toolName: name });
  }
  if (provider === 'pi') {
    if (value.type === 'agent_start') progress.push({ type: 'working', message: 'Agent 已开始处理你的需求' });
    if (value.type === 'message_start' && value.message?.role === 'assistant') { state.partialText = ''; state.assistantText = ''; state.resultText = ''; }
    if (value.type === 'message_update') {
      const event = value.assistantMessageEvent;
      if (event?.type === 'text_delta' && typeof event.delta === 'string') { state.partialText += event.delta; state.outputChars += event.delta.length; }
      if (event?.type === 'thinking_start') progress.push({ type: 'working', message: '正在分析你的需求' });
    }
    if (value.type === 'tool_execution_start' && typeof value.toolName === 'string') tool(value.toolName, value.toolCallId);
    if (value.type === 'message_end' && value.message?.role === 'assistant') state.assistantText = textContent(value.message);
    if (value.type === 'agent_end' && Array.isArray(value.messages)) {
      const text = [...value.messages].reverse().map(textContent).find(Boolean);
      if (text) state.resultText = text;
    }
    if (value.type === 'auto_retry_start') progress.push({ type: 'working', message: `服务暂时繁忙，正在进行第 ${Number(value.attempt) || 1} 次重试` });
    if (value.type === 'compaction_start') progress.push({ type: 'working', message: '正在整理上下文，保留讨论中的关键信息' });
  }
  if (provider === 'claude') {
    if (value.type === 'system' && value.subtype === 'init') progress.push({ type: 'working', message: 'Claude Code 已开始处理你的需求' });
    if (value.type === 'stream_event') {
      const event = value.event;
      if (event?.type === 'message_start') { state.partialText = ''; state.assistantText = ''; state.resultText = ''; }
      if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta') { state.partialText += event.delta.text || ''; state.outputChars += (event.delta.text || '').length; }
      if (event?.type === 'content_block_start' && event.content_block?.type === 'thinking') progress.push({ type: 'working', message: '正在分析你的需求' });
    }
    if (value.type === 'assistant') {
      for (const block of value.message?.content || []) if (block.type === 'tool_use') tool(block.name, block.id);
      const text = textContent(value.message); if (text) state.assistantText = text;
    }
    if (value.type === 'result' && typeof value.result === 'string') state.resultText = value.result;
  }
  if (provider === 'codex') {
    if (value.type === 'turn.started') progress.push({ type: 'working', message: 'Codex 已开始处理你的需求' });
    const item = value.item;
    if (item && value.type === 'item.started') {
      if (item.type === 'command_execution') tool('bash', item.id);
      if (item.type === 'web_search') tool('web_search', item.id);
      if (item.type === 'mcp_tool_call') tool(item.tool || 'mcp', item.id);
    }
    if (item?.type === 'agent_message' && typeof item.text === 'string') {
      state.outputChars += Math.max(0, item.text.length - state.assistantText.length);
      state.assistantText = item.text;
      if (value.type === 'item.completed') state.resultText = item.text;
    }
  }
  return progress;
}
