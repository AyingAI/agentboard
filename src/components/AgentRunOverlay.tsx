import { useEffect, useState } from 'react';
import type { ActivityEntry } from '../types/dsl';
import { elapsedLabel, friendlyProvider, runPresentation } from '../agent/liveProgress';

interface AgentRunOverlayProps {
  activity: ActivityEntry;
  onOpenActivity: () => void;
}

export default function AgentRunOverlay({ activity, onOpenActivity }: AgentRunOverlayProps) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activity.id]);
  const view = runPresentation(activity, now);
  const live = activity.live;
  const latestEvent = live?.events[live.events.length - 1];
  return (
    <section className="agent-run-overlay" aria-label="Agent 运行进度">
      <div className="run-heading-row">
        <span className={`run-signal ${view.receiving ? 'receiving' : ''}`} aria-hidden="true"><i /><i /><i /></span>
        <div className="run-heading-copy">
          <h2 aria-live="polite" aria-atomic="true">{view.title}</h2>
          <p>{view.hint}</p>
        </div>
        <button type="button" className="run-detail-button" onClick={onOpenActivity} aria-label="查看执行详情" title="查看执行详情">↗</button>
      </div>
      {live?.previewTitles.length ? <div className="run-preview" aria-label="生成中的内容线索">
        <span>内容线索</span>{live.previewTitles.slice(-2).map(title => <span className="run-preview-title" key={title} title={title}>{title}</span>)}
      </div> : null}
      <div className="run-phase-row" aria-label="执行阶段">
        {['理解需求', '构建内容', '整理画布'].map((label, index) => <span key={label} className={`run-phase ${index === view.phase ? 'current' : index < view.phase ? 'done' : ''}`} aria-current={index === view.phase ? 'step' : undefined}><i aria-hidden="true">{index < view.phase ? '✓' : ''}</i>{label}</span>)}
        <span className="run-timing" aria-label={`已等待 ${elapsedLabel(view.elapsed)}`}>{elapsedLabel(view.elapsed)}</span>
      </div>
      <div className="run-live-row">
        <span className={`run-connection ${view.signalAge !== null && view.signalAge < 18000 ? 'connected' : ''}`}><i aria-hidden="true" />{friendlyProvider(live?.provider || 'Agent')}<span className="run-connection-label"> · {view.connection}</span></span>
        {live?.outputChars ? <span className="run-output-count">已接收 {live.outputChars.toLocaleString()} 字符{live.toolCount ? ` · ${live.toolCount} 次工具活动` : ''}</span>
          : <span className="run-latest-event" aria-live="polite">{latestEvent?.label || '正在准备上下文'}</span>}
      </div>
    </section>
  );
}
