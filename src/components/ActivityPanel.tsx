import { useEffect, useState } from 'react';
import type { ActivityEntry, ActivityProgressStep } from '../types/dsl';
import type { InteractionDecision } from '../hooks/useAgent';
import { activitiesForView, viewForActivity, type ActivityView } from '../agent/activityViews';

const KIND_LABEL: Record<ActivityEntry['kind'], string> = {
  user_message: '你',
  system: '系',
  agent_patch: 'AI',
  validation_error: '!',
  needs_input: '问',
  run_progress: '·',
};

const STEP_LABEL: Record<ActivityProgressStep['status'], string> = {
  pending: '待处理',
  active: '进行中',
  done: '完成',
  error: '失败',
};

function formatElapsed(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

interface ActivityPanelProps {
  onClose: () => void;
  activities: ActivityEntry[];
  expandedId: string | null;
  onToggleExpand: (id: string | null) => void;
  onRespondToInteraction: (runId: string, decision: InteractionDecision, activityId: string) => void;
}

export default function ActivityPanel({
  onClose,
  activities,
  expandedId,
  onToggleExpand,
  onRespondToInteraction,
}: ActivityPanelProps) {
  const [view, setView] = useState<ActivityView>('collaboration');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyFailedId, setCopyFailedId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const visibleActivities = activitiesForView(activities, view);
  const collaborationCount = activitiesForView(activities, 'collaboration').length;
  const diagnosticCount = activitiesForView(activities, 'diagnostics').length;

  useEffect(() => {
    if (!expandedId) return;
    const expandedActivity = activities.find((item) => item.id === expandedId);
    if (expandedActivity) setView(viewForActivity(expandedActivity));
  }, [activities, expandedId]);

  useEffect(() => {
    const hasRunning = activities.some((item) =>
      item.kind === 'run_progress' && item.progressStatus === 'running',
    );
    if (!hasRunning) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [activities]);

  function respond(item: ActivityEntry, decision: InteractionDecision) {
    if (!item.interaction || item.resolvedDecision) return;
    onRespondToInteraction(item.interaction.runId, decision, item.id);
    setDrafts((value) => ({ ...value, [item.id]: '' }));
  }

  async function copyInstruction(item: ActivityEntry) {
    const text = item.detail?.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(item.id);
      setCopyFailedId(null);
      window.setTimeout(() => setCopiedId((current) => (current === item.id ? null : current)), 1600);
    } catch {
      setCopyFailedId(item.id);
      window.setTimeout(() => setCopyFailedId((current) => (current === item.id ? null : current)), 2200);
    }
  }

  return (
    <aside className="activity-panel">
      <div className="activity-header">
        <div>
          <h1>Agent 历史</h1>
          <p>{view === 'collaboration' ? '需求、确认和白板变更' : '调用、校验和错误详情'}</p>
        </div>
        <button type="button" className="ghost small" onClick={onClose} title="关闭活动面板">
          ✕
        </button>
      </div>
      <div className="activity-filter" role="tablist" aria-label="Agent 历史视图">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'collaboration'}
          className={view === 'collaboration' ? 'active' : ''}
          onClick={() => setView('collaboration')}
        >
          协作记录{collaborationCount > 0 ? ` ${collaborationCount}` : ''}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'diagnostics'}
          className={view === 'diagnostics' ? 'active' : ''}
          onClick={() => setView('diagnostics')}
        >
          运行日志{diagnosticCount > 0 ? ` ${diagnosticCount}` : ''}
        </button>
      </div>
      <div className="activity-list">
        {visibleActivities.length === 0 ? (
          <div className="activity-empty">
            {view === 'collaboration'
              ? '还没有协作记录。发送第一条指令后，需求和变更会出现在这里。'
              : '暂无运行日志。Agent 调用、校验和错误信息会出现在这里。'}
          </div>
        ) : null}
        {visibleActivities.map((item) => {
          const isExpanded = expandedId === item.id;
          const elapsed = item.startedAt
            ? formatElapsed((item.completedAt ?? now) - item.startedAt)
            : null;
          return (
            <section
              key={item.id}
              className={`activity-item ${item.kind} ${isExpanded ? 'detail-open' : ''}`}
            >
              <button
                type="button"
                className="activity-summary"
                onClick={() => onToggleExpand(isExpanded ? null : item.id)}
                title={isExpanded ? '收起详情' : '展开详情'}
              >
                <span className="activity-kind">{KIND_LABEL[item.kind]}</span>
                <span className="activity-text">{item.summary}</span>
                {item.kind === 'run_progress' && elapsed ? (
                  <span className={`activity-runtime ${item.progressStatus ?? ''}`}>{elapsed}</span>
                ) : null}
                <time>
                  {new Date(item.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}
                </time>
                {item.detail || item.interaction || item.progressSteps?.length ? (
                  <span className={`activity-chevron ${isExpanded ? 'open' : ''}`}>▾</span>
                ) : null}
              </button>
              {item.kind === 'run_progress' && item.progressSteps?.length ? (
                <div className={`progress-card ${item.progressStatus ?? 'running'}`}>
                  <div className="progress-steps">
                    {item.progressSteps.map((step) => (
                      <div key={step.id} className={`progress-step ${step.status}`}>
                        <span className="progress-dot" />
                        <span className="progress-step-label">{step.label}</span>
                        <span className="progress-step-state">{STEP_LABEL[step.status]}</span>
                      </div>
                    ))}
                  </div>
                  {isExpanded && item.detail ? (
                    <pre className="progress-detail">{item.detail}</pre>
                  ) : null}
                </div>
              ) : isExpanded && item.kind === 'user_message' && item.detail ? (
                <div className="user-message-card">
                  <div className="user-message-card-header">
                    <span>原始指令</span>
                    <button type="button" onClick={() => copyInstruction(item)}>
                      {copiedId === item.id ? '已复制' : copyFailedId === item.id ? '复制失败' : '复制'}
                    </button>
                  </div>
                  <pre>{item.detail}</pre>
                </div>
              ) : isExpanded && item.kind === 'needs_input' && item.interaction ? (
                <div className="interaction-card">
                  <p>{item.interaction.message}</p>
                  {item.interaction.options?.length ? (
                    <div className="interaction-options">
                      {item.interaction.options.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          disabled={Boolean(item.resolvedDecision)}
                          onClick={() =>
                            respond(item, {
                              optionId: option.id,
                              message: option.description
                                ? `${option.label}: ${option.description}`
                                : option.label,
                            })
                          }
                        >
                          <span>{option.label}</span>
                          {option.description ? <small>{option.description}</small> : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {item.interaction.allowFreeText !== false ? (
                    <div className="interaction-freeform">
                      <textarea
                        value={drafts[item.id] ?? ''}
                        disabled={Boolean(item.resolvedDecision)}
                        placeholder="或者直接补充你的选择、授权范围或说明..."
                        onChange={(event) =>
                          setDrafts((value) => ({ ...value, [item.id]: event.target.value }))
                        }
                      />
                      <button
                        type="button"
                        disabled={Boolean(item.resolvedDecision) || !(drafts[item.id] ?? '').trim()}
                        onClick={() => respond(item, { message: (drafts[item.id] ?? '').trim() })}
                      >
                        继续任务
                      </button>
                    </div>
                  ) : null}
                  {item.resolvedDecision ? (
                    <div className="interaction-resolved">
                      已继续：{item.resolvedDecision.message || item.resolvedDecision.optionId || '已确认'}
                    </div>
                  ) : null}
                </div>
              ) : isExpanded && item.detail ? (
                <pre className="activity-detail">{item.detail}</pre>
              ) : null}
            </section>
          );
        })}
      </div>
    </aside>
  );
}
