import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ActivityEntry,
  ActivityProgressStatus,
  ActivityProgressStep,
  AgentTaskPolicy,
  BoardDSL,
  BoardEditEvent,
  DSLPatch,
  RunState,
} from '../types/dsl';
import type {
  AgentAdapter,
  AgentConfig,
  AgentError,
  AgentProgressEvent,
  AgentRequest,
  AgentResponse,
  AgentRunEvent,
} from '../agent/types';
import { ClaudeAgentAdapter } from '../agent/claudeAgent';
import { LocalCliAdapter } from '../agent/localCliAgent';
import { OpenAIAgentAdapter } from '../agent/openaiAgent';
import { normalizePatchForUserIntent } from '../agent/prompts';
import { isAborted, withRetry } from '../agent/resilience';
import { applyVisualPatch as applyPatch, patchConflicts, preserveVisualState } from '../visuals/patch';
import { advanceLiveProgress, restoreRunActivities } from '../agent/liveProgress';
import { conversationEvents } from '../agent/conversation';
import { assessPatchRisk, type PatchRiskAssessment } from '../agent/patchRisk';
import { summarizePatchChanges, type PatchChangeSummary } from '../agent/patchSummary';
import { validatePatchPolicy } from '../agent/taskPolicy';
import { clearPendingProposals, restorePendingProposal } from '../agent/proposals';

export type AppliedAgentPatch = {
  id: string;
  runId: string;
  activityId: string;
  patch: DSLPatch;
  summary: PatchChangeSummary;
  beforeBoard: BoardDSL;
  afterBoard: BoardDSL;
};

export type PendingAgentPatch = {
  id: string;
  runId: string;
  activityId: string;
  patch: DSLPatch;
  risk: PatchRiskAssessment;
  baseBoard: BoardDSL;
};

export type InteractionDecision = {
  optionId?: string;
  message?: string;
};

type UseAgentOptions = {
  sessionId?: string;
  getRecentEditEvents?: () => BoardEditEvent[];
  onAgentPatchApplied?: (patch: DSLPatch, beforeBoard: BoardDSL) => void;
  initialActivities?: ActivityEntry[];
  initialRuns?: Record<string, RunState>;
  /** Called after every state change — use to persist to session storage. */
  onStateChange?: (activities: ActivityEntry[], runs: Record<string, RunState>) => void;
};

function makeRunId() {
  return `run_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function makeActivity(
  kind: ActivityEntry['kind'],
  summary: string,
  detail?: string,
  extra: Partial<ActivityEntry> = {},
): ActivityEntry {
  return {
    id: `activity_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    timestamp: Date.now(),
    kind,
    summary,
    detail,
    channel: kind === 'run_progress' || kind === 'validation_error' ? 'diagnostic' : 'collaboration',
    ...extra,
  };
}

const RUN_PROGRESS_STEPS = [
  { id: 'context', label: '理解需求' },
  { id: 'call', label: '构建内容' },
  { id: 'validate', label: '检查内容' },
  { id: 'apply', label: '整理画布' },
] as const;

type RunProgressStepId = (typeof RUN_PROGRESS_STEPS)[number]['id'];

function makeProgressSteps(activeId: RunProgressStepId): ActivityProgressStep[] {
  return RUN_PROGRESS_STEPS.map((step) => ({
    ...step,
    status: step.id === activeId ? 'active' : 'pending',
    timestamp: step.id === activeId ? Date.now() : undefined,
  }));
}

function advanceProgressSteps(
  steps: ActivityProgressStep[] = makeProgressSteps('context'),
  activeId: RunProgressStepId,
  errorStepId?: RunProgressStepId,
): ActivityProgressStep[] {
  const activeIndex = RUN_PROGRESS_STEPS.findIndex((step) => step.id === activeId);
  const errorIndex = errorStepId
    ? RUN_PROGRESS_STEPS.findIndex((step) => step.id === errorStepId)
    : -1;

  return RUN_PROGRESS_STEPS.map((step, index) => {
    const previous = steps.find((item) => item.id === step.id);
    const status = errorIndex === index
      ? 'error'
      : index < activeIndex
        ? 'done'
        : index === activeIndex
          ? 'active'
          : 'pending';

    return {
      ...step,
      status,
      detail: previous?.detail,
      timestamp: previous?.timestamp ?? (status === 'active' || status === 'error' ? Date.now() : undefined),
    };
  });
}

function finishProgressSteps(
  steps: ActivityProgressStep[] | undefined,
  status: ActivityProgressStatus | undefined,
  activeId: RunProgressStepId | undefined,
  errorStepId?: RunProgressStepId,
): ActivityProgressStep[] | undefined {
  if (!status) return steps;
  if (status === 'completed') {
    return RUN_PROGRESS_STEPS.map((step) => ({
      ...step,
      status: 'done',
      timestamp: steps?.find((item) => item.id === step.id)?.timestamp ?? Date.now(),
    }));
  }
  if ((status === 'failed' || status === 'cancelled') && activeId) {
    return advanceProgressSteps(steps, activeId, errorStepId ?? activeId);
  }
  return steps;
}

/** No-op adapter shown when no CLI is available */
class NoAgentAdapter implements AgentAdapter {
  readonly name = '未配置 Agent';

  async generateResponse(_request: AgentRequest): Promise<AgentResponse> {
    throw {
      code: 'API_ERROR' as const,
      message: '未检测到可用的 Agent CLI。请确认已安装受支持的本地 CLI，或在设置中配置 API。',
    };
  }
}

export function useAgent(
  getBoard: () => BoardDSL,
  setBoard: (board: BoardDSL) => void,
  config: AgentConfig,
  options: UseAgentOptions = {},
) {
  const [isPending, setIsPending] = useState(false);
  const [pendingPatch, setPendingPatch] = useState<PendingAgentPatch | null>(() => restorePendingProposal(options.initialRuns ?? {}));
  const [appliedPatch, setAppliedPatch] = useState<AppliedAgentPatch | null>(null);
  const [activities, setActivities] = useState<ActivityEntry[]>(() => restoreRunActivities(options.initialActivities ?? []));
  const [runs, setRuns] = useState<Record<string, RunState>>(() => options.initialRuns ?? {});
  const abortRef = useRef<AbortController | null>(null);
  const access = useRef({ getBoard, setBoard, options });
  access.current = { getBoard, setBoard, options };
  // Use a ref for the callback to avoid stale closures and unnecessary effect re-runs
  const onStateChangeRef = useRef(options.onStateChange);
  onStateChangeRef.current = options.onStateChange;

  // Persist activities + runs whenever they change
  useEffect(() => {
    onStateChangeRef.current?.(activities, runs);
  }, [activities, runs]);

  const adapter = useMemo<AgentAdapter>(() => {
    if (config.provider === 'local-cli' && config.cliId) {
      return new LocalCliAdapter(config.cliId);
    }
    if (config.provider === 'claude' && config.apiKey) {
      return new ClaudeAgentAdapter(config);
    }
    if (config.provider === 'openai' && config.apiKey) {
      return new OpenAIAgentAdapter({ apiKey: config.apiKey, model: config.model, baseUrl: config.baseUrl, maxOutputTokens: config.maxOutputTokens });
    }
    return new NoAgentAdapter();
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

  const updateRunProgress = useCallback((
    activityId: string,
    updates: {
      summary?: string;
      detail?: string;
      status?: ActivityProgressStatus;
      activeStepId?: RunProgressStepId;
      errorStepId?: RunProgressStepId;
      completed?: boolean;
    },
  ) => {
    setActivities((items) =>
      items.map((item) => {
        if (item.id !== activityId) return item;
        return {
          ...item,
          summary: updates.summary ?? item.summary,
          detail: updates.detail ?? item.detail,
          progressStatus: updates.status ?? item.progressStatus,
          completedAt: updates.completed ? Date.now() : item.completedAt,
          progressSteps: updates.completed
            ? finishProgressSteps(item.progressSteps, updates.status, updates.activeStepId, updates.errorStepId)
            : updates.activeStepId
              ? advanceProgressSteps(item.progressSteps, updates.activeStepId, updates.errorStepId)
              : item.progressSteps,
        };
      }),
    );
  }, []);

  const executeRun = useCallback(
    async (run: RunState, userMessage: string, resumeActivityId?: string, taskPolicy?: AgentTaskPolicy, displayRequest?: string) => {
      const sessionId = access.current.options.sessionId;
      setIsPending(true);
      const progressActivity = makeActivity(
        'run_progress',
        `[${providerName}] 正在准备任务`,
        '已收到请求，正在读取当前白板、最近编辑和 run context。',
        {
          runId: run.id,
          startedAt: Date.now(),
          progressStatus: 'running',
          progressSteps: makeProgressSteps('context'),
          live: { provider: providerName, request: displayRequest || run.originalUserMessage, outputChars: 0, toolCount: 0, previewTitles: [], events: [] },
        },
      );
      setActivities((items) => [progressActivity, ...items]);

      const controller = new AbortController();
      abortRef.current = controller;
      const progressLog: string[] = [];
      const handleAgentProgress = (event: AgentProgressEvent) => {
        if (controller.signal.aborted || access.current.options.sessionId !== sessionId) return;
        const now = Date.now();
        if (event.type !== 'heartbeat' && event.type !== 'output' && progressLog[progressLog.length - 1] !== event.message) {
          progressLog.push(event.message);
          if (progressLog.length > 5) progressLog.shift();
        }
        setActivities(items => items.map(item => item.id === progressActivity.id ? {
          ...item,
          summary: event.type === 'heartbeat' ? item.summary : `[${providerName}] ${event.message}`,
          detail: progressLog.join('\n'),
          live: item.live ? advanceLiveProgress(item.live, event, now) : item.live,
          progressSteps: advanceProgressSteps(item.progressSteps, 'call'),
        } : item));
      };

      const request: AgentRequest = {
        boardState: access.current.getBoard(),
        userMessage,
        runId: run.id,
        runContext: [...conversationEvents(runs, run.id), ...run.events],
        recentEditEvents: options.getRecentEditEvents?.() ?? [],
        selectedNodeIds: taskPolicy?.selectedNodeIds,
        taskPolicy,
        signal: controller.signal,
        onProgress: handleAgentProgress,
      };

      try {
        updateRunProgress(progressActivity.id, {
          summary: `[${providerName}] 正在调用 Agent`,
          detail: '上下文已准备完成，正在等待 Agent 返回结构化响应。',
          activeStepId: 'call',
        });

        const response = await withRetry(() => adapter.generateResponse(request), {
          signal: controller.signal,
          onRetry: (attempt, err) => {
            handleAgentProgress({ type: 'working', message: `连接暂时遇到问题，正在第 ${attempt} 次重试` });
            setActivities(items => items.map(item => item.id === progressActivity.id && item.live ? { ...item, live: { ...item.live, retryAttempt: attempt, outputChars: 0, toolCount: 0, previewTitles: [], lastContentAt: undefined, latestTool: undefined } } : item));
            const reason = (err as AgentError)?.message ?? '';
            updateRunProgress(progressActivity.id, {
              summary: `[${providerName}] 正在重试第 ${attempt} 次`,
              detail: reason ? `遇到瞬时错误，准备重试。\n${reason}` : '遇到瞬时错误，准备重试。',
              activeStepId: 'call',
            });
            setActivities((items) => [
              makeActivity('system', `[${providerName}] 第 ${attempt} 次重试…`, reason, {
                channel: 'diagnostic',
              }),
              ...items,
            ]);
          },
        });

        if (controller.signal.aborted || access.current.options.sessionId !== sessionId) return;

        updateRunProgress(progressActivity.id, {
          summary: `[${providerName}] 正在解析结果`,
          detail: 'Agent 已返回，正在判断是白板修改、用户确认请求，还是错误。',
          activeStepId: 'validate',
        });

        if (response.type === 'interaction_request') {
          const interaction = { ...response, runId: run.id };
          const interactionEvent: AgentRunEvent = {
            type: 'agent_interaction_request',
            timestamp: Date.now(),
            payload: interaction,
          };
          setRuns((prev) => ({
            ...prev,
            [run.id]: {
              ...run,
              events: [...run.events, interactionEvent],
            },
          }));
          setActivities((items) => [
            makeActivity(
              'needs_input',
              `[${providerName}] ${interaction.title}`,
              interaction.message,
              {
                runId: run.id,
                interaction,
              },
            ),
            ...items,
          ]);
          updateRunProgress(progressActivity.id, {
            summary: `[${providerName}] 需要你的确认`,
            detail: 'Agent 没有直接修改白板，而是请求用户选择、授权或补充信息。',
            status: 'completed',
            activeStepId: 'apply',
            completed: true,
          });
          return;
        }

        const currentBoard = access.current.getBoard();
        const patch = preserveVisualState(currentBoard, normalizePatchForUserIntent(response, userMessage, currentBoard));
        if (patchConflicts(request.boardState, currentBoard, patch).length) {
          throw { code: 'API_ERROR', message: '相关内容在 Agent 工作期间发生了变化，已保留你的编辑。请基于当前状态重新发送。', retryable: false } satisfies AgentError;
        }
        updateRunProgress(progressActivity.id, {
          summary: `[${providerName}] 正在校验 patch`,
          detail: `已生成 ${patch.ops.length} 个白板修改，正在做结构校验和引用检查。`,
          activeStepId: 'validate',
        });
        const { board: resultBoard, result } = applyPatch(currentBoard, patch);
        const policyViolations = taskPolicy ? validatePatchPolicy(patch, taskPolicy, currentBoard) : [];
        if (policyViolations.length > 0) {
          updateRunProgress(progressActivity.id, {
            summary: `[${providerName}] 修改超出授权范围`,
            detail: policyViolations.map((violation) => violation.message).join('\n'),
            status: 'failed',
            activeStepId: 'validate',
            errorStepId: 'validate',
            completed: true,
          });
          setActivities((items) => [
            makeActivity(
              'validation_error',
              `[${providerName}] 修改超出当前作用范围或权限，未应用到白板`,
              policyViolations.map((violation) => violation.message).join('\n'),
              { runId: run.id },
            ),
            ...items,
          ]);
          return;
        }

        if (!result.applied) {
          updateRunProgress(progressActivity.id, {
            summary: `[${providerName}] patch 校验失败`,
            detail: result.errors.map((e) => e.message).join('\n'),
            status: 'failed',
            activeStepId: 'validate',
            errorStepId: 'validate',
            completed: true,
          });
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

        updateRunProgress(progressActivity.id, {
          summary: `[${providerName}] 正在应用到白板`,
          detail: `校验通过，正在应用 ${result.appliedOps} 个修改。`,
          activeStepId: 'apply',
        });

        const risk = assessPatchRisk(patch);
        if (risk.requiresConfirmation) {
          const proposal: PendingAgentPatch = {
            id: `proposal_${Date.now()}_${Math.random().toString(16).slice(2)}`,
            runId: run.id,
            activityId: progressActivity.id,
            patch,
            risk,
            baseBoard: currentBoard,
          };
          setPendingPatch(proposal);
          const { risk: _risk, runId: _runId, ...persistedProposal } = proposal;
          setRuns(previous => ({ ...clearPendingProposals(previous), [run.id]: { ...previous[run.id], pendingProposal: persistedProposal } }));
          updateRunProgress(progressActivity.id, {
            summary: `[${providerName}] 等待确认高风险修改`,
            detail: `已校验 ${result.appliedOps} 个修改，但尚未应用到白板。`,
            status: 'completed',
            activeStepId: 'apply',
            completed: true,
          });
          return;
        }

        if (patch.ops.length || patch.presentation?.plan) access.current.setBoard(resultBoard);
        setAppliedPatch({
          id: `applied_${Date.now()}_${Math.random().toString(16).slice(2)}`,
          runId: run.id,
          activityId: progressActivity.id,
          patch,
          summary: summarizePatchChanges(patch, resultBoard),
          beforeBoard: currentBoard,
          afterBoard: resultBoard,
        });
        options.onAgentPatchApplied?.(patch, currentBoard);
        const patchEvent: AgentRunEvent = {
          type: 'agent_patch',
          timestamp: Date.now(),
          payload: patch,
        };
        setRuns((prev) => ({
          ...prev,
          [run.id]: {
            ...run,
            events: [...run.events, patchEvent],
          },
        }));
        setActivities((items) => [
          makeActivity('agent_patch', `[${providerName}] ${patch.summary}`, JSON.stringify(patch.ops, null, 2), {
            runId: run.id, suggestions: patch.questions, actions: patch.actions,
          }),
          ...items,
        ]);
        updateRunProgress(progressActivity.id, {
          summary: `[${providerName}] 已完成`,
          detail: `已应用 ${result.appliedOps} 个修改到白板。`,
          status: 'completed',
          activeStepId: 'apply',
          completed: true,
        });
      } catch (err) {
        if (access.current.options.sessionId !== sessionId) return;
        if (isAborted(err)) {
          updateRunProgress(progressActivity.id, {
            summary: `[${providerName}] 已取消`,
            detail: '用户已停止当前请求，白板未应用新的 Agent 修改。',
            status: 'cancelled',
            activeStepId: 'call',
            errorStepId: 'call',
            completed: true,
          });
          setActivities((items) => [
            makeActivity('system', `[${providerName}] 已取消`, undefined, { channel: 'diagnostic' }),
            ...items,
          ]);
          return;
        }
        const agentErr = err as AgentError;
        const message = agentErr.message || String(err);
        updateRunProgress(progressActivity.id, {
          summary: `[${providerName}] 执行失败`,
          detail: agentErr.rawText ? `${message}\n\n${agentErr.rawText}` : message,
          status: 'failed',
          activeStepId: 'call',
          errorStepId: 'call',
          completed: true,
        });
        setActivities((items) => [
          makeActivity('validation_error', `[${providerName}] ${message}`, agentErr.rawText || ''),
          ...items.map((item) =>
            resumeActivityId && item.id === resumeActivityId
              ? { ...item, resolvedDecision: undefined }
              : item,
          ),
        ]);
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
          setIsPending(false);
        }
      }
    },
    [getBoard, setBoard, adapter, providerName, options, updateRunProgress, runs],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort({ kind: 'external' });
  }, []);

  const submitMessage = useCallback(
    async (message: string, displayMessage = message, taskPolicy?: AgentTaskPolicy) => {
      if (abortRef.current) return;
      setAppliedPatch(null);
      const runId = makeRunId();
      const userEvent: AgentRunEvent = {
        type: 'user_message',
        timestamp: Date.now(),
        payload: { message },
      };
      const run: RunState = {
        id: runId,
        originalUserMessage: message,
        events: [userEvent],
        taskPolicy,
      };
      setRuns((prev) => ({ ...prev, [runId]: run }));
      setActivities((items) => [
        makeActivity(
          'user_message',
          `用户指令：${displayMessage.length > 42 ? `${displayMessage.slice(0, 42)}...` : displayMessage}`,
          displayMessage,
          { runId },
        ),
        ...items,
      ]);
      await executeRun(run, message, undefined, taskPolicy, displayMessage);
    },
    [executeRun, runs],
  );

  const retryRun = useCallback(async (runId: string) => {
    const run = runs[runId];
    if (!run || abortRef.current) return;
    const request = activities.find(item => item.runId === runId && item.kind === 'user_message')?.detail || run.originalUserMessage;
    await submitMessage(run.originalUserMessage, request, run.taskPolicy);
  }, [runs, activities, submitMessage]);

  const resumeRun = useCallback(
    async (runId: string, decision: InteractionDecision, activityId?: string) => {
      const run = runs[runId];
      if (!run) {
        setActivities((items) => [
          makeActivity('validation_error', `[${providerName}] 无法继续任务：找不到 run ${runId}`),
          ...items,
        ]);
        return;
      }

      setActivities((items) =>
        items.map((item) =>
          item.runId === runId
            && item.kind === 'needs_input'
            && !item.resolvedDecision
            && (!activityId || item.id === activityId)
            ? { ...item, resolvedDecision: decision }
            : item,
        ),
      );

      const decisionEvent: AgentRunEvent = {
        type: 'user_decision',
        timestamp: Date.now(),
        payload: decision,
      };
      const nextRun: RunState = {
        ...run,
        events: [...run.events, decisionEvent],
      };
      setRuns((prev) => ({ ...prev, [runId]: nextRun }));

      const resumeMessage = [
        'Continue the same AgentBoard task.',
        `Original user request: ${run.originalUserMessage}`,
        decision.optionId ? `User selected option: ${decision.optionId}` : '',
        decision.message ? `User message: ${decision.message}` : '',
        'Use the existing run context and return either the final DSLPatch or another interaction_request if more input is required.',
      ]
        .filter(Boolean)
        .join('\n');

      await executeRun(nextRun, resumeMessage, activityId, run.taskPolicy);
    },
    [executeRun, providerName, runs],
  );

  const applyPendingPatch = useCallback(() => {
    if (!pendingPatch) return;
    const currentBoard = getBoard();
    if (patchConflicts(pendingPatch.baseBoard, currentBoard, pendingPatch.patch).length) {
      addActivity(makeActivity('validation_error', '提案涉及的内容已改变，未覆盖你的编辑。请让 Agent 基于当前状态重新生成。'));
      setPendingPatch(null);
      setRuns(clearPendingProposals);
      return;
    }
    const { board: nextBoard, result } = applyPatch(currentBoard, pendingPatch.patch);
    if (!result.applied) {
      setActivities((items) => [
        makeActivity(
          'validation_error',
          `[${providerName}] 提案无法应用到当前白板`,
          result.errors.map((error) => error.message).join('\n'),
          { runId: pendingPatch.runId },
        ),
        ...items,
      ]);
      setPendingPatch(null);
      setRuns(clearPendingProposals);
      return;
    }
    setBoard(nextBoard);
    setRuns(clearPendingProposals);
    setAppliedPatch({
      id: `applied_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      runId: pendingPatch.runId,
      activityId: pendingPatch.activityId,
      patch: pendingPatch.patch,
      summary: summarizePatchChanges(pendingPatch.patch, nextBoard),
      beforeBoard: currentBoard,
      afterBoard: nextBoard,
    });
    options.onAgentPatchApplied?.(pendingPatch.patch, currentBoard);
    const patchEvent: AgentRunEvent = {
      type: 'agent_patch',
      timestamp: Date.now(),
      payload: pendingPatch.patch,
    };
    setRuns((prev) => {
      const run = prev[pendingPatch.runId];
      if (!run) return prev;
      return {
        ...prev,
        [run.id]: { ...run, events: [...run.events, patchEvent] },
      };
    });
    setActivities((items) => [
      makeActivity(
        'agent_patch',
        `[${providerName}] 已确认并应用：${pendingPatch.patch.summary}`,
        JSON.stringify(pendingPatch.patch.ops, null, 2),
        { runId: pendingPatch.runId, suggestions: pendingPatch.patch.questions, actions: pendingPatch.patch.actions },
      ),
      ...items,
    ]);
    setPendingPatch(null);
  }, [getBoard, options, pendingPatch, providerName, setBoard]);

  const rejectPendingPatch = useCallback(() => {
    if (!pendingPatch) return;
    setActivities((items) => [
      makeActivity('system', `[${providerName}] 已放弃提议的修改`, pendingPatch.patch.summary, {
        runId: pendingPatch.runId,
      }),
      ...items,
    ]);
    setPendingPatch(null);
    setRuns(clearPendingProposals);
  }, [pendingPatch, providerName]);

  const undoAppliedPatch = useCallback(() => {
    if (!appliedPatch) return;
    if (JSON.stringify(getBoard()) !== JSON.stringify(appliedPatch.afterBoard)) {
      setActivities((items) => [
        makeActivity(
          'system',
          '无法直接撤销 Agent 修改：白板随后又发生了变化',
          '请使用顶部的逐步撤销，避免覆盖更新后的内容。',
          { runId: appliedPatch.runId },
        ),
        ...items,
      ]);
      setAppliedPatch(null);
      return;
    }
    setBoard(appliedPatch.beforeBoard);
    setActivities((items) => [
      makeActivity('system', `[${providerName}] 已撤销本次 Agent 修改`, appliedPatch.patch.summary, {
        runId: appliedPatch.runId,
      }),
      ...items,
    ]);
    setAppliedPatch(null);
  }, [appliedPatch, getBoard, providerName, setBoard]);

  const reconcilePresentation = useCallback((before: BoardDSL, after: BoardDSL) => {
    setAppliedPatch(current => current && JSON.stringify(current.afterBoard) === JSON.stringify(before) ? { ...current, afterBoard: after } : current);
  }, []);

  const dismissAppliedPatch = useCallback(() => {
    setAppliedPatch(null);
  }, []);

  return {
    isPending,
    pendingPatch,
    appliedPatch,
    activities,
    providerName,
    submitMessage,
    retryRun,
    resumeRun,
    applyPendingPatch,
    rejectPendingPatch,
    undoAppliedPatch,
    dismissAppliedPatch,
    reconcilePresentation,
    cancel,
    addActivity,
    resetState: useCallback((nextActivities: ActivityEntry[], nextRuns: Record<string, RunState>) => {
      abortRef.current?.abort({ kind: 'external' });
      abortRef.current = null;
      setIsPending(false);
      setPendingPatch(restorePendingProposal(nextRuns));
      setAppliedPatch(null);
      setActivities(restoreRunActivities(nextActivities));
      setRuns(nextRuns);
    }, []),
  };
}
