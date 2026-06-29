import { useEffect, useState } from 'react';
import type { ActivityEntry, ActivityProgressStep } from '../types/dsl';
import type { InteractionDecision } from '../hooks/useAgent';

const KIND_LABEL: Record<ActivityEntry['kind'], string> = {
  user_message: '↗',
  system: '⚙',
  agent_patch: '🤖',
  validation_error: '⚠',
  needs_input: '↳',
  run_progress: '●',
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
  const [filter, setFilter] = useState<'all' | 'user_message'>('all');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyFailedId, setCopyFailedId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const visibleActivities = filter === 'user_message'
    ? activities.filter((item) => item.kind === 'user_message')
    : activities;
  const userMessageCount = activities.filter((item) => item.kind === 'user_message').length;

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
        <h1>Agent Activity</h1>
        <button type="button" className="ghost small" onClick={onClose} title="关闭活动面板">
          ✕
        </button>
      </div>
      <div className="activity-filter" role="tablist" aria-label="Activity 筛选">
        <button
          type="button"
          className={filter === 'all' ? 'active' : ''}
          onClick={() => setFilter('all')}
        >
          全部
        </button>
        <button
          type="button"
          className={filter === 'user_message' ? 'active' : ''}
          onClick={() => setFilter('user_message')}
        >
          用户指令{userMessageCount > 0 ? ` ${userMessageCount}` : ''}
        </button>
      </div>
      <div className="activity-list">
        {visibleActivities.length === 0 ? (
          <div className="activity-empty">
            {filter === 'user_message' ? '还没有用户指令记录。' : '暂无 Activity。'}
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
