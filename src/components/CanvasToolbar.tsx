import { useRef, useState } from 'react';
import { useDismissibleLayer } from '../hooks/useDismissibleLayer';

interface CanvasToolbarProps {
  zoom: number;
  hasContent: boolean;
  onCreateNode: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  onFitContent: () => void;
  onReadContent: () => void;
  onOrganize: () => void;
  onOrganizeSpacing: () => void;
  isOrganizing: boolean;
  onOpenShortcuts: () => void;
}

export default function CanvasToolbar({
  zoom,
  hasContent,
  onCreateNode,
  onZoomIn,
  onZoomOut,
  onResetView,
  onFitContent,
  onReadContent,
  onOrganize,
  onOrganizeSpacing,
  isOrganizing,
  onOpenShortcuts,
}: CanvasToolbarProps) {
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  useDismissibleLayer({ open, root, onDismiss: () => setOpen(false) });
  return (
    <div className="canvas-toolbar" aria-label="画布工具">
      <button type="button" className="canvas-toolbar-create" onClick={onCreateNode}>+ 卡片</button>
      <span className="canvas-toolbar-divider" />
      <button type="button" onClick={onZoomOut} aria-label="缩小画布" title="缩小">−</button>
      <button type="button" className="canvas-zoom-value" onClick={onResetView} title="重置为 100%">
        {Math.round(zoom * 100)}%
      </button>
      <button type="button" onClick={onZoomIn} aria-label="放大画布" title="放大">+</button>
      <button type="button" className="canvas-toolbar-text" onClick={onReadContent} disabled={!hasContent} title="用可读字号查看当前内容">阅读</button>
      <button type="button" className="canvas-toolbar-text" onClick={onFitContent} disabled={!hasContent} title="查看整张画布的结构">总览</button>
      <div className="spatial-layout-actions" ref={root}>
        <button type="button" className="canvas-toolbar-text canvas-organize" onClick={onOrganize} disabled={!hasContent || isOrganizing} title="理解内容关系，重新组织整张白板，支持撤销">智能布局</button>
        <button type="button" className="layout-more-button" aria-label="更多布局操作" aria-expanded={open} onClick={() => setOpen(value => !value)} disabled={!hasContent || isOrganizing}>⌄</button>
        {open ? <div className="layout-actions-popover" onKeyDown={event => event.stopPropagation()}><button type="button" onClick={() => { setOpen(false); onOrganizeSpacing(); }}>仅整理间距<small>保留当前组织方式，调整卡片间距</small></button></div> : null}
      </div>
      <span className="canvas-toolbar-divider" />
      <button type="button" onClick={onOpenShortcuts} aria-label="查看画布快捷键" title="快捷键">?</button>
    </div>
  );
}
