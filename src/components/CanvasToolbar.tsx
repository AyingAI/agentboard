interface CanvasToolbarProps {
  zoom: number;
  hasContent: boolean;
  onCreateNode: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  onFitContent: () => void;
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
  onOpenShortcuts,
}: CanvasToolbarProps) {
  return (
    <div className="canvas-toolbar" aria-label="画布工具">
      <button type="button" className="canvas-toolbar-create" onClick={onCreateNode}>+ 卡片</button>
      <span className="canvas-toolbar-divider" />
      <button type="button" onClick={onZoomOut} aria-label="缩小画布" title="缩小">−</button>
      <button type="button" className="canvas-zoom-value" onClick={onResetView} title="重置为 100%">
        {Math.round(zoom * 100)}%
      </button>
      <button type="button" onClick={onZoomIn} aria-label="放大画布" title="放大">+</button>
      <button type="button" className="canvas-toolbar-text" onClick={onFitContent} disabled={!hasContent}>
        适应内容
      </button>
      <span className="canvas-toolbar-divider" />
      <button type="button" onClick={onOpenShortcuts} aria-label="查看画布快捷键" title="快捷键">?</button>
    </div>
  );
}
