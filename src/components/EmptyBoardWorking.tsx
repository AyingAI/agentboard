import type { ActivityEntry } from '../types/dsl';

export default function EmptyBoardWorking({ activity }: { activity?: ActivityEntry | null }) {
  return <div className="empty-board-working" aria-label="画布正在等待内容" onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}>
    <div className="working-constellation" aria-hidden="true">
      <svg viewBox="0 0 240 110" fill="none">
        <path d="M120 55L69 27M120 55L174 21M120 55L165 86" />
        <g className="working-branch"><path d="M120 55L69 27" pathLength="1" /><rect x="17" y="11" width="52" height="32" rx="8" /></g>
        <g className="working-branch"><path d="M120 55L174 21" pathLength="1" /><rect x="174" y="6" width="50" height="31" rx="8" /></g>
        <g className="working-branch"><path d="M120 55L165 86" pathLength="1" /><rect x="165" y="70" width="53" height="32" rx="8" /></g>
        <circle className="working-hub" cx="120" cy="55" r="13" />
        <circle className="working-point" cx="120" cy="55" r="3" />
      </svg>
    </div>
    <h1>正在生成白板</h1>
    {activity?.live?.request ? <p className="working-request">{activity.live.request.slice(0, 180)}</p> : null}
  </div>;
}
