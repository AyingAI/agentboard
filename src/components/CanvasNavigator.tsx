import type { BoardDSL } from '../types/dsl';
import SettingsSelect from './SettingsSelect';

export default function CanvasNavigator({ board, selectedId, onFocus }: { board: BoardDSL; selectedId: string | null; onFocus: (id: string) => void }) {
  const nodes = [...board.nodes].sort((a, b) => a.y - b.y || a.x - b.x);
  const index = nodes.findIndex(node => node.id === selectedId);
  return <nav className="canvas-navigator" aria-label="画布内容导航">
    <span className="canvas-navigation-hint">滚动浏览 <span aria-hidden="true">·</span> ⌘ / Ctrl + 滚轮缩放</span>
    <SettingsSelect label="内容导航" value={selectedId || ''} placeholder={`${nodes.length} 项内容 · 跳转`} searchable
      options={nodes.map(node => ({ value: node.id, label: node.title, badge: node.visual ? '交互' : undefined, description: board.groups.find(group => group.nodeIds.includes(node.id))?.title }))}
      onChange={onFocus} />
    <button type="button" onClick={() => onFocus(nodes[Math.max(0, index - 1)].id)} disabled={index <= 0} aria-label="上一项内容">‹</button>
    <button type="button" onClick={() => onFocus(nodes[Math.min(nodes.length - 1, index + 1)].id)} disabled={index === nodes.length - 1} aria-label="下一项内容">›</button>
  </nav>;
}
