import type { BoardDSL, BoardNode } from '../types/dsl';

/** Screen-space section labels stay readable while the content becomes a thumbnail. */
export default function BoardOverview({ board, nodes, zoom, panOffset, onFocus }: {
  board: BoardDSL; nodes: Map<string, BoardNode>; zoom: number; panOffset: { x: number; y: number }; onFocus: (ids: string[]) => void;
}) {
  if (zoom >= .6 || !board.groups.length) return null;
  return <div className="board-overview-labels" aria-label="板块总览">
    {board.groups.map((group, index) => {
      const members = group.nodeIds.map(id => nodes.get(id)).filter((node): node is BoardNode => !!node);
      if (!members.length) return null;
      const left = Math.min(...members.map(node => node.x)) - 28;
      const top = Math.min(...members.map(node => node.y)) - 52;
      const width = (Math.max(...members.map(node => node.x + node.width)) + 28 - left) * zoom;
      const height = (Math.max(...members.map(node => node.y + node.height)) + 28 - top) * zoom;
      if (width < 150 || height < 65) return null;
      return <button key={group.id} type="button" className="board-overview-label" aria-label={`进入板块：${group.title}`}
        style={{ left: left * zoom + panOffset.x + 5, top: top * zoom + panOffset.y + 5, width: width - 10 }}
        onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}
        onKeyDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); onFocus(group.nodeIds); }}>
        <span className="overview-label-index">{String(index + 1).padStart(2, '0')}</span>
        <span className="overview-label-title">{group.title}</span>
        <span className="overview-label-count">{members.length} 项</span><span className="overview-label-enter" aria-hidden="true">↗</span>
      </button>;
    })}
  </div>;
}
