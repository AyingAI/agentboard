import { useEffect, useState } from 'react';
import type { ActivityEntry, ActivityProgressStep } from '../types/dsl';

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

interface AgentRunOverlayProps {
  activity: ActivityEntry;
  onOpenActivity: () => void;
  onCancel: () => void;
}

export default function AgentRunOverlay({
  activity,
  onOpenActivity,
  onCancel,
}: AgentRunOverlayProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const elapsed = activity.startedAt ? formatElapsed(now - activity.startedAt) : null;
  const detailLines = activity.detail?.split('\n').filter(Boolean).slice(-3) ?? [];

  return (
    <section className="agent-run-overlay" aria-live="polite" aria-label="Agent 运行进度">
      <div className="agent-run-overlay-header">
        <div>
          <div className="agent-run-kicker">Agent 正在执行</div>
          <div className="agent-run-summary">{activity.summary}</div>
        </div>
        {elapsed ? <span className="agent-run-elapsed">{elapsed}</span> : null}
      </div>

      {activity.progressSteps?.length ? (
        <div className="agent-run-steps">
          {activity.progressSteps.map((step) => (
            <div key={step.id} className={`agent-run-step ${step.status}`}>
              <span className="agent-run-step-dot" />
              <span className="agent-run-step-label">{step.label}</span>
              <span className="agent-run-step-state">{STEP_LABEL[step.status]}</span>
            </div>
          ))}
        </div>
      ) : null}

      {detailLines.length ? (
        <div className="agent-run-events">
          {detailLines.map((line, index) => (
            <div key={`${line}-${index}`}>{line}</div>
          ))}
        </div>
      ) : null}

      <div className="agent-run-actions">
        <button type="button" className="agent-run-secondary" onClick={onOpenActivity}>
          查看详情
        </button>
        <button type="button" className="agent-run-danger" onClick={onCancel}>
          停止
        </button>
      </div>
    </section>
  );
}
