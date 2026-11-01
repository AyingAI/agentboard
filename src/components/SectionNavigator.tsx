import type { BoardDSL } from '../types/dsl';

/** Keep the reading path visible without shrinking the whole board into a thumbnail. */
export default function SectionNavigator({ board, selectedNodeIds, onFocus }: {
  board: BoardDSL; selectedNodeIds: string[]; onFocus: (ids: string[]) => void;
}) {
  const ids = new Set(board.nodes.map(node => node.id));
  const groups = board.groups.filter(group => group.nodeIds.some(id => ids.has(id)));
  if (groups.length < 2) return null;
  return <nav className="section-navigator" aria-label="按板块阅读">
    <span className="section-navigator-label">板块</span>
    <div className="section-navigator-items">
      {groups.map((group, index) => <button key={group.id} type="button" title={`阅读${group.title}`}
        className={selectedNodeIds.some(id => group.nodeIds.includes(id)) ? 'is-current' : ''}
        onClick={() => onFocus(group.nodeIds.filter(id => ids.has(id)))}>
        <span className="section-index">{String(index + 1).padStart(2, '0')}</span>
        <span className="section-title">{group.title}</span>
        <span className="section-count">{group.nodeIds.filter(id => ids.has(id)).length}</span>
      </button>)}
    </div>
  </nav>;
}
