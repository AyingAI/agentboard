import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { BoardNode, VisualReference } from '../types/dsl';
import VisualSurface from './VisualSurface';

export default function MapNodeDetail({ node, onClose, onDiscuss, onShowOnCanvas, onStateChange, onReference, onAsk }: {
  node: BoardNode; onClose: () => void; onDiscuss: () => void; onShowOnCanvas: () => void;
  onStateChange: (nodeId: string, state: Record<string, unknown>) => void; onReference: (reference: VisualReference) => void; onAsk: (nodeId: string, text: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  return createPortal(<dialog ref={dialog} className="map-node-detail" aria-label={node.title} onKeyDown={event => event.stopPropagation()} onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === dialog.current) { const rect = dialog.current!.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose(); } }}>
    <div className="map-detail-heading"><div><span>{node.visual ? '交互内容' : '内容详情'}</span><h2>{node.title}</h2></div><button type="button" aria-label="返回结构视图" onClick={onClose}>×</button></div>
    <div className="map-detail-content">{node.body ? <p className="map-detail-body">{node.body}</p> : null}
      {node.visual ? <VisualSurface hideExpand nodeId={node.id} title={node.title} visual={node.visual} onStateChange={onStateChange}
        onReference={reference => { onReference(reference); onClose(); }} onAsk={(id, text) => { onAsk(id, text); onClose(); }} /> : null}
    </div>
    <div className="map-detail-footer"><button type="button" onClick={onShowOnCanvas}>在内容画布中查看 <span aria-hidden="true">↗</span></button><button type="button" className="map-detail-discuss" onClick={onDiscuss}>围绕这项继续讨论 <span aria-hidden="true">→</span></button></div>
  </dialog>, document.body);
}
