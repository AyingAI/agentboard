import type { ActivityEntry } from '../types/dsl';

const KIND_LABEL: Record<ActivityEntry['kind'], string> = {
  system: '⚙',
  agent_patch: '🤖',
  validation_error: '⚠',
};

interface ActivityPanelProps {
  onClose: () => void;
  activities: ActivityEntry[];
  expandedId: string | null;
  onToggleExpand: (id: string | null) => void;
}

export default function ActivityPanel({
  onClose,
  activities,
  expandedId,
  onToggleExpand,
}: ActivityPanelProps) {
  return (
    <aside className="activity-panel">
      <div className="activity-header">
        <h1>Agent Activity</h1>
        <button type="button" className="ghost small" onClick={onClose} title="关闭活动面板">
          ✕
        </button>
      </div>
      <div className="activity-list">
        {activities.map((item) => {
          const isExpanded = expandedId === item.id;
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
                <time>
                  {new Date(item.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}
                </time>
                {item.detail ? (
                  <span className={`activity-chevron ${isExpanded ? 'open' : ''}`}>▾</span>
                ) : null}
              </button>
              {isExpanded && item.detail ? (
                <pre className="activity-detail">{item.detail}</pre>
              ) : null}
            </section>
          );
        })}
      </div>
    </aside>
  );
}
