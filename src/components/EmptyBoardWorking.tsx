import type { ActivityEntry } from '../types/dsl';

export default function EmptyBoardWorking({ activity }: { activity?: ActivityEntry | null }) {
  return <div className="empty-board-working" aria-label="画布正在等待内容" onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}>
    <div className="working-constellation" aria-hidden="true">
      <svg viewBox="0 0 240 110" fill="none"><path d="M120 55L44 27M120 55L199 21M120 55L192 86" /><circle cx="120" cy="55" r="21" /><circle cx="120" cy="55" r="9" /><rect x="17" y="11" width="52" height="32" rx="8" /><rect x="174" y="6" width="50" height="31" rx="8" /><rect x="165" y="70" width="53" height="32" rx="8" /></svg>
      <span className="constellation-point" />
    </div>
    <span className="working-eyebrow">从一句想法，到一张画布</span>
    <h1>给想法一点展开的空间</h1>
    {activity?.live?.request ? <p className="working-request">{activity.live.request.slice(0, 180)}</p> : null}
    <p className="working-caption">内容准备好后，会在这里展开。</p>
  </div>;
}
