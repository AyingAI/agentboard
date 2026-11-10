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
      <div className="run-live-row">
        <span className={`run-connection ${view.signalAge !== null && view.signalAge < 18000 ? 'connected' : ''}`}><i aria-hidden="true" />{friendlyProvider(live?.provider || 'Agent')}<span className="run-connection-label"> · {view.connection}</span></span>
        {!live?.outputChars && live?.latestTool ? <span className="run-latest-event">{latestEvent?.label}</span> : null}
        <span className="run-timing" aria-label={`已等待 ${elapsedLabel(view.elapsed)}`}>{elapsedLabel(view.elapsed)}</span>
      </div>
    </section>
  );
}
