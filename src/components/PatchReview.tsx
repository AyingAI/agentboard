import { useEffect, useRef } from 'react';
import type { PendingAgentPatch } from '../hooks/useAgent';
import type { BoardNode } from '../types/dsl';
import { applyVisualPatch } from '../visuals/patch';
import VisualSurface from './VisualSurface';

function Preview({ node }: { node?: BoardNode }) {
  if (!node) return <div className="review-empty">此处没有内容</div>;
  return <div className="review-node"><h3>{node.title}</h3><p>{node.body}</p>
    {node.visual ? <VisualSurface preview nodeId={node.id} title={node.title} visual={node.visual}
      onStateChange={() => {}} onReference={() => {}} onAsk={() => {}} /> : null}
  </div>;
}

export default function PatchReview({ proposal, onClose, onApply }: {
  proposal: PendingAgentPatch;
  onClose: () => void;
  onApply: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const outcome = applyVisualPatch(proposal.baseBoard, proposal.patch);
  const ids = new Set(proposal.patch.ops.flatMap(op => op.op === 'add_node' ? [op.node.id] : op.op === 'update_node' || op.op === 'delete_node' ? [op.nodeId] : []));
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    dialog.current?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.stopImmediatePropagation(); onClose(); }
    }
    window.addEventListener('keydown', keydown, true);
    return () => { window.removeEventListener('keydown', keydown, true); previous?.focus(); };
  }, [onClose]);
  return <div className="patch-review-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialog} className="patch-review-dialog" role="dialog" aria-modal="true" aria-labelledby="review-title" tabIndex={-1}>
      <header><div><small>修改预览 · 白板尚未改变</small><h2 id="review-title">{proposal.patch.summary}</h2></div><button type="button" onClick={onClose} aria-label="关闭修改预览">×</button></header>
      <div className="review-scroll">
        {[...ids].map(id => <section className="review-comparison" key={id}>
          <div><span className="review-label">当前版本</span><Preview node={proposal.baseBoard.nodes.find(n => n.id === id)} /></div>
          <div><span className="review-label proposed">提议版本</span><Preview node={outcome.board.nodes.find(n => n.id === id)} /></div>
        </section>)}
        {!ids.size ? <p>此次修改涉及连线、分组或布局：{proposal.patch.ops.map(op => op.op).join('、')}。</p> : null}
      </div>
      <footer><span>采纳后仍可以撤销。</span><button type="button" onClick={onClose}>继续查看白板</button><button type="button" className="primary" onClick={onApply}>确认应用</button></footer>
    </div>
  </div>;
}
