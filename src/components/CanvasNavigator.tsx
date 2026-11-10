import type { BoardDSL } from '../types/dsl';
import SettingsSelect from './SettingsSelect';

export default function CanvasNavigator({ board, selectedId, onFocus }: { board: BoardDSL; selectedId: string | null; onFocus: (id: string) => void }) {
  const nodes = [...board.nodes].sort((a, b) => a.y - b.y || a.x - b.x);
  const index = nodes.findIndex(node => node.id === selectedId);
  if (!nodes.length) return null;
  if (nodes.length === 1) return <nav className="canvas-navigator" aria-label="画布内容导航">
    <button type="button" className="canvas-locate" title={nodes[0].title} onClick={() => onFocus(nodes[0].id)}>
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true"><circle cx="8" cy="8" r="4"/><path d="M8 2v2m0 8v2M2 8h2m8 0h2"/></svg>
      定位卡片
    </button>
  </nav>;
  return <nav className="canvas-navigator" aria-label="画布内容导航">
    <SettingsSelect label="内容导航" value={selectedId || ''} triggerText={index >= 0 ? `跳转 ${index + 1}/${nodes.length}` : `跳转 · ${nodes.length} 项`} searchable searchPlaceholder="搜索卡片标题…"
      options={nodes.map(node => ({ value: node.id, label: node.title, badge: node.visual ? '交互' : undefined, description: board.groups.find(group => group.nodeIds.includes(node.id))?.title }))}
      onChange={onFocus} />
    <button type="button" onClick={() => onFocus(nodes[Math.max(0, index - 1)].id)} disabled={index <= 0} aria-label="上一项内容"><Chevron previous /></button>
    <button type="button" onClick={() => onFocus(nodes[Math.min(nodes.length - 1, index + 1)].id)} disabled={index === nodes.length - 1} aria-label="下一项内容"><Chevron /></button>
  </nav>;
}

function Chevron({ previous = false }: { previous?: boolean }) {
  return <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
    <path d={previous ? 'm10 4-4 4 4 4' : 'm6 4 4 4-4 4'} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}
