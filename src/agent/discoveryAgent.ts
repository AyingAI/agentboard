import type { AgentConfig, AgentProgressEvent, BoardDSL, CollaborationState, ImpactContext, ImpactItem } from '../types/dsl';
import { buildDiscoverySystemPrompt } from './prompts';
import { buildDiscoveryContext, parseDiscoveryResponse } from './discoveries';
import { runLocalCli } from './localCliAgent';
import { readApiStream } from './apiStream';
import { withTimeout } from './resilience';

export function supportsDiscovery(config: AgentConfig): boolean {
  return config.provider !== 'local-cli' || ['codex', 'claude', 'pi'].includes(config.cliId ?? '');
}

/** A read-only channel, deliberately never handed to the board patch engine. */
export async function discover(config: AgentConfig, board: BoardDSL, state: CollaborationState,
  externalSignal: AbortSignal, onProgress: (event: AgentProgressEvent) => void,
  impact?: { context: ImpactContext; suggestedChecks: ImpactItem[] }) {
  const system = buildDiscoverySystemPrompt();
  const user = `Analyze this project state and return a discovery response.\n${JSON.stringify({ ...buildDiscoveryContext(board, state), ...(impact ? { impact } : {}) })}`;
  const { signal, cleanup } = withTimeout(externalSignal, 120_000);
  try {
    let text: string;
    if (config.provider === 'local-cli') {
      if (!config.cliId) throw new Error('请先连接 Agent');
      text = await runLocalCli(config.cliId, system, user, signal, onProgress, 'discovery');
    } else {
      if (!config.apiKey) throw new Error('请先连接 Agent');
      const claude = config.provider === 'claude';
      let base = (config.baseUrl || (claude ? 'https://api.anthropic.com/v1' : 'https://api.openai.com/v1')).trim().replace(/\/+$/, '');
      if (!/\/v\d+$/i.test(base)) base += '/v1';
      const headers: Record<string, string> = claude
        ? { 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' }
        : { Authorization: `Bearer ${config.apiKey}` };
      const response = await fetch(`${base}/${claude ? 'messages' : 'chat/completions'}`, {
        method: 'POST', signal, headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ stream: true, model: config.model || (claude ? 'claude-opus-4-20250514' : 'gpt-4o'),
          ...(claude ? { system, max_tokens: 6000, messages: [{ role: 'user', content: user }] }
            : { [new URL(base).hostname === 'api.openai.com' ? 'max_completion_tokens' : 'max_tokens']: 6000,
              messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }) }),
      });
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'Agent 认证失效，请检查设置' : `Agent 暂时不可用（${response.status}）`);
      onProgress({ type: 'connected', message: '正在联系当前任务，准备发现' });
      if (response.headers.get('content-type')?.includes('text/event-stream')) text = await readApiStream(response, claude ? 'claude' : 'openai', signal, onProgress);
      else {
        const body = await response.json();
        text = claude ? body.content?.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('\n') : body.choices?.[0]?.message?.content;
      }
    }
    if (typeof text !== 'string' || !text.trim()) throw new Error('Agent 没有返回发现内容');
    return parseDiscoveryResponse(text, board);
  } catch (error) {
    if (signal.aborted) throw new Error(externalSignal.aborted ? '主动分析已取消' : '这次主动分析用时较长，已停止。可以稍后重试，正常讨论不受影响。');
    throw error;
  } finally { cleanup(); }
}
