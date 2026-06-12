import { useCallback, useMemo, useState } from 'react';
import type { ActivityEntry, BoardDSL, DSLPatch } from '../types/dsl';
import type { AgentConfig, AgentError, AgentRequest } from '../agent/types';
import { ClaudeAgentAdapter } from '../agent/claudeAgent';
import { LocalCliAdapter } from '../agent/localCliAgent';
import { OpenAIAgentAdapter } from '../agent/openaiAgent';
import { applyPatch } from '../engine/patch';

function makeActivity(kind: ActivityEntry['kind'], summary: string, detail?: string): ActivityEntry {
  return {
    id: `activity_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    timestamp: Date.now(),
    kind,
    summary,
    detail,
  };
}

/** No-op adapter shown when no CLI is available */
class NoAgentAdapter {
  readonly name = '未配置 Agent';

  async generatePatch(_request: AgentRequest): Promise<DSLPatch> {
    throw {
      code: 'API_ERROR' as const,
      message: '未检测到可用的 Agent CLI。请确认已安装 Claude Code 或在设置中配置 API Key。',
    };
  }
}

export function useAgent(
  getBoard: () => BoardDSL,
  setBoard: (board: BoardDSL) => void,
  config: AgentConfig,
) {
  const [isPending, setIsPending] = useState(false);
  const [lastPatch, setLastPatch] = useState<DSLPatch | null>(null);
  const [activities, setActivities] = useState<ActivityEntry[]>([]);

  const adapter = useMemo(() => {
    if (config.provider === 'local-cli' && config.cliId) {
      return new LocalCliAdapter(config.cliId);
    }
    if (config.provider === 'claude' && config.apiKey) {
      return new ClaudeAgentAdapter(config);
    }
    if (config.provider === 'openai' && config.apiKey) {
      return new OpenAIAgentAdapter({ apiKey: config.apiKey, model: config.model, baseUrl: config.baseUrl });
    }
    return new NoAgentAdapter() as unknown as LocalCliAdapter;
  }, [config]);

  const providerName = useMemo(() => {
    if (config.provider === 'local-cli' && config.cliId) return `Local: ${config.cliId}`;
    if (config.provider === 'claude') return 'Claude API';
    if (config.provider === 'openai') return `OpenAI (${config.model || 'gpt-4o'})`;
    return '未配置';
  }, [config]);

  const addActivity = useCallback((item: ActivityEntry) => {
    setActivities((items) => [item, ...items]);
  }, []);

  const submitMessage = useCallback(
    async (message: string) => {
      setIsPending(true);

      const request: AgentRequest = {
        boardState: getBoard(),
        userMessage: message,
      };

      try {
        const patch = await adapter.generatePatch(request);
        const { board: resultBoard, result } = applyPatch(getBoard(), patch);
        setLastPatch(patch);

        if (!result.applied) {
          setActivities((items) => [
            makeActivity(
              'validation_error',
              `[${providerName}] patch 校验失败，未应用到白板`,
              result.errors.map((e) => e.message).join('\n'),
            ),
            ...items,
          ]);
          return;
        }

        setBoard(resultBoard);
        setActivities((items) => [
          makeActivity('agent_patch', `[${providerName}] ${patch.summary}`, JSON.stringify(patch.ops, null, 2)),
          ...items,
        ]);
      } catch (err) {
        const agentErr = err as AgentError;
        const message = agentErr.message || String(err);
        setActivities((items) => [
          makeActivity('validation_error', `[${providerName}] ${message}`, agentErr.rawText || ''),
          ...items,
        ]);
      } finally {
        setIsPending(false);
      }
    },
    [getBoard, setBoard, adapter, providerName],
  );

  return {
    isPending,
    lastPatch,
    activities,
    providerName,
    submitMessage,
    addActivity,
    setLastPatch,
  };
}
