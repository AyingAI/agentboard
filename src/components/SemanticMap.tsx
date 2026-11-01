import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { BoardDSL } from '../types/dsl';
import type { CanvasViewport } from '../engine/viewport';
import { fitBoardViewport } from '../engine/viewport';
import { canvasReadingSize } from '../presentation/viewport';
import { layoutSemanticBoard, mapEdgePath } from '../presentation/semanticLayout';

export type SemanticMapHandle = { fit: () => void; focus: (ids: string[]) => void };
type Props = {
  board: BoardDSL; boardRef: React.RefObject<HTMLDivElement>; zoom: number; panOffset: { x: number; y: number };
  selectedIds: string[]; isSpaceHeld: boolean; isPanning: boolean;
  setViewport: (view: CanvasViewport) => void; onPointerDown: (event: React.PointerEvent) => boolean;
  onWheel: (event: WheelEvent) => void; onDeselect: () => void; onOpen: (id: string) => void;
};

const SemanticMap = forwardRef<SemanticMapHandle, Props>(function SemanticMap(props, ref) {
  const { board, boardRef, zoom, panOffset } = props;
  const [narrow, setNarrow] = useState(() => window.innerWidth < 600);
  const layout = useMemo(() => layoutSemanticBoard(board, true, undefined, narrow ? { nodeHeight: 240, headingHeight: 72 } : undefined), [board, narrow]);
  const byId = new Map(layout.board.nodes.map(node => [node.id, node]));
  const current = useRef({ props, layout }); current.current = { props, layout };
  const geometry = JSON.stringify(layout.board.nodes.map(node => [node.id, node.x, node.y]));
  function focus(ids?: string[]) {
    const { props, layout } = current.current;
    const canvas = props.boardRef.current;
    if (!canvas) return;
    const size = canvasReadingSize(canvas);
    const subset = ids?.length ? layout.board.nodes.filter(node => ids.includes(node.id)) : layout.board.nodes;
    const nodes = subset.length ? subset : layout.board.nodes;
    const selected = new Set(nodes.map(node => node.id));
    const regions = layout.regions.filter(region => region.nodeIds.every(id => selected.has(id))).map(region => ({ ...region, type: 'note' as const, title: region.title, body: '' }));
    props.setViewport(fitBoardViewport({ ...layout.board, nodes: [...nodes, ...regions], groups: [] }, size.width, size.height, 42));
  }
  useImperativeHandle(ref, () => ({ fit: () => focus(), focus: ids => focus(ids) }), []);
  useLayoutEffect(() => { focus(); }, [geometry]);
  useEffect(() => {
    const canvas = boardRef.current;
    if (!canvas) return;
    const wheel = (event: WheelEvent) => current.current.props.onWheel(event);
    canvas.addEventListener('wheel', wheel, { passive: false });
    let previousWidth = canvas.clientWidth, previousHeight = canvasReadingSize(canvas).height;
    const observer = new ResizeObserver(() => {
      setNarrow(canvas.clientWidth < 600);
      const readingHeight = canvasReadingSize(canvas).height;
      if (Math.abs(canvas.clientWidth - previousWidth) > 2 || Math.abs(readingHeight - previousHeight) > 70) focus();
      previousWidth = canvas.clientWidth; previousHeight = readingHeight;
    });
    observer.observe(canvas);
    const dock = canvas.parentElement?.querySelector('.conversation-dock');
    if (dock) observer.observe(dock);
    return () => { canvas.removeEventListener('wheel', wheel); observer.disconnect(); };
  }, [boardRef]);
  const width = Math.max(2000, ...layout.board.nodes.map(node => node.x + node.width + 100));
  const height = Math.max(1400, ...layout.board.nodes.map(node => node.y + node.height + 100));
  const source = (board.metadata['agentboard.presentation'] as { spatialSource?: string } | undefined)?.spatialSource;
  return <>
    <div className="spatial-reading-note" aria-label="布局说明"><span className="spatial-note-mark" aria-hidden="true">✧</span><p title={layout.plan.description}>{layout.plan.description}</p><span className="spatial-note-source">{source === 'agent' ? 'Agent 空间方案' : '根据已有关系整理'}</span></div>
    <div ref={boardRef} className={`board-canvas semantic-map ${props.isSpaceHeld ? 'space-held' : ''} ${props.isPanning ? 'panning' : ''}`}
      style={{ backgroundSize: `${24 * zoom}px ${24 * zoom}px`, backgroundPosition: `${panOffset.x}px ${panOffset.y}px` }}
      onPointerDown={event => { if (!props.onPointerDown(event)) props.onDeselect(); }}>
      <div className="semantic-map-content" style={{ width, height, transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})` }}>
        {[...layout.regions].sort((a, b) => b.width * b.height - a.width * a.height).map(region => <div key={region.id} className="semantic-region" data-map-region={region.id} style={{ left: region.x, top: region.y, width: region.width, height: region.height }}>
          <span style={{ fontSize: Math.min(54, 11 / zoom), top: 16, left: 20 }}>{region.title}</span>
        </div>)}
        <svg className="semantic-map-edges" width={width} height={height} aria-hidden="true">
          <defs><marker id="semantic-map-arrow" viewBox="0 0 9 6" refX="8" refY="3" markerWidth="8" markerHeight="6" orient="auto"><path d="M0 0L9 3L0 6" fill="#8ca0bc" /></marker></defs>
          {board.edges.map(edge => {
            const from = byId.get(edge.from), to = byId.get(edge.to);
            if (!from || !to) return null;
            const route = mapEdgePath(from, to, layout.board.nodes);
            return <g key={edge.id}><path d={route.path} fill="none" stroke={edge.style?.stroke || '#a8b7cb'} strokeWidth={1.3 / zoom} strokeLinejoin="round" strokeDasharray={edge.style?.dash ? `${4 / zoom} ${4 / zoom}` : undefined} markerEnd={edge.type === 'line' ? undefined : 'url(#semantic-map-arrow)'} />
              {edge.label ? <text x={route.label.x} y={route.label.y - 8 / zoom} textAnchor="middle" fontSize={11 / zoom} fill="#7b8fae" paintOrder="stroke" stroke="#f2f5f9" strokeWidth={4 / zoom}>{edge.label}</text> : null}</g>;
          })}
        </svg>
        {layout.board.nodes.map((node, index) => {
          const selected = props.selectedIds.includes(node.id);
          const detailed = zoom >= .9, medium = zoom >= .62;
          return <button key={node.id} type="button" className={`semantic-map-node ${selected ? 'selected' : ''} ${node.visual ? 'has-visual' : ''} ${node.tags?.map(tag => `map-tag-${tag}`).join(' ') ?? ''}`}
            data-map-node-id={node.id} aria-label={`查看内容：${node.title}`} title={`打开「${node.title}」的完整内容`}
            style={{ left: node.x, top: node.y, width: node.width, height: node.height, padding: `${Math.min(28, 15 / zoom)}px`, borderWidth: 1 / zoom }}
            onPointerDown={event => { event.stopPropagation(); if (event.button === 1 || props.isSpaceHeld) props.onPointerDown(event); }}
            onKeyDown={event => { if (event.key === ' ') event.stopPropagation(); }}
            onClick={() => { if (!props.isSpaceHeld && !props.isPanning) props.onOpen(node.id); }}>
            {detailed ? <span className="map-node-kicker" style={{ fontSize: 9 / zoom }}><span>{String(index + 1).padStart(2, '0')}</span>{node.tags?.[0] || (node.type === 'note' ? 'NOTE' : 'IDEA')}</span> : null}
            <strong style={{ fontSize: Math.min(64, 14 / zoom), lineHeight: 1.5 }}>{node.title}</strong>
            {medium ? <p style={{ fontSize: 12 / zoom, lineHeight: 1.6, WebkitLineClamp: detailed ? 2 : 1 }}>{node.body}</p> : null}
            {medium ? <span className="map-node-open" style={{ fontSize: 9 / zoom }}>{node.visual ? '打开交互内容' : '阅读全文'}<span aria-hidden="true">↗</span></span> : null}
          </button>;
        })}
      </div>
      <div className="semantic-map-help">先看关系，点开内容 <span aria-hidden="true">·</span> 拖动或滚动浏览</div>
    </div>
  </>;
});
export default SemanticMap;
