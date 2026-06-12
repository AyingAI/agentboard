import { useMemo } from 'react';
import type { BoardDSL, BoardNode as BoardNodeType } from '../types/dsl';
import BoardNode from './BoardNode';

interface EditState {
  nodeId: string;
  field: 'title' | 'body';
}

interface TempLine {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

interface BoardCanvasProps {
  board: BoardDSL;
  selectedNodeId: string | null;
  editState: EditState | null;
  boardRef: React.RefObject<HTMLDivElement>;
  isSpaceHeld: boolean;
  isPanning: boolean;
  panOffset: { x: number; y: number };
  tempLine: TempLine | null;
  onPointerDown: (nodeId: string, event: React.PointerEvent) => void;
  onCanvasPointerDown: (e: React.PointerEvent) => boolean;
  onDeselectAll: () => void;
  onStartEdit: (nodeId: string, field: 'title' | 'body') => void;
  onCommitEdit: (nodeId: string, field: 'title' | 'body', value: string) => void;
  onCancelEdit: () => void;
  onCanvasDoubleClick: (x: number, y: number) => void;
  onConnectStart: (nodeId: string, x: number, y: number) => void;
}

/** Find intersection of ray from node center toward target with node border */
function edgePoint(node: BoardNodeType, targetCx: number, targetCy: number) {
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  const dx = targetCx - cx;
  const dy = targetCy - cy;
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return { x: cx, y: cy };

  const left = node.x;
  const right = node.x + node.width;
  const top = node.y;
  const bottom = node.y + node.height;

  let tMin = Infinity;
  if (dx > 0) tMin = Math.min(tMin, (right - cx) / dx);
  if (dx < 0) tMin = Math.min(tMin, (left - cx) / dx);
  if (dy > 0) tMin = Math.min(tMin, (bottom - cy) / dy);
  if (dy < 0) tMin = Math.min(tMin, (top - cy) / dy);

  return { x: cx + dx * tMin, y: cy + dy * tMin };
}

function nodeCenter(node: BoardNodeType) {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}

export default function BoardCanvas({
  board,
  selectedNodeId,
  editState,
  boardRef,
  isSpaceHeld,
  isPanning,
  panOffset,
  tempLine,
  onPointerDown,
  onCanvasPointerDown,
  onDeselectAll,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
  onCanvasDoubleClick,
  onConnectStart,
}: BoardCanvasProps) {
  const nodeMap = useMemo(
    () => new Map(board.nodes.map((node) => [node.id, node])),
    [board.nodes],
  );

  const contentSize = useMemo(() => {
    if (board.nodes.length === 0) return { w: 2000, h: 1400 };
    const maxX = Math.max(...board.nodes.map((n) => n.x + n.width)) + 400;
    const maxY = Math.max(...board.nodes.map((n) => n.y + n.height)) + 400;
    return { w: Math.max(maxX, 2000), h: Math.max(maxY, 1400) };
  }, [board.nodes]);

  return (
    <div
      className={`board-canvas ${isSpaceHeld ? 'space-held' : ''} ${isPanning ? 'panning' : ''}`}
      ref={boardRef}
      onPointerDown={(e) => {
        const handled = onCanvasPointerDown(e);
        if (!handled) onDeselectAll();
      }}
      onDoubleClick={(e) => {
        if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('board-canvas')) {
          const rect = boardRef.current?.getBoundingClientRect();
          if (rect) {
            onCanvasDoubleClick(
              e.clientX - rect.left - panOffset.x,
              e.clientY - rect.top - panOffset.y,
            );
          }
        }
      }}
    >
      <div className="canvas-content" style={{ transform: `translate(${panOffset.x}px, ${panOffset.y}px)` }}>
        {/* Edge layer — SVG */}
        <svg className="edge-layer" width={contentSize.w} height={contentSize.h}>
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L0,6 L9,3 z" fill="#7f8794" />
            </marker>
          </defs>
          {board.edges.map((edge) => {
            const from = nodeMap.get(edge.from);
            const to = nodeMap.get(edge.to);
            if (!from || !to) return null;
            const toCenter = nodeCenter(to);
            const fromCenter = nodeCenter(from);
            const start = edgePoint(from, toCenter.x, toCenter.y);
            const end = edgePoint(to, fromCenter.x, fromCenter.y);
            const midX = (start.x + end.x) / 2;
            const midY = (start.y + end.y) / 2;
            return (
              <g key={edge.id}>
                <line
                  x1={start.x} y1={start.y} x2={end.x} y2={end.y}
                  stroke={edge.style?.stroke ?? '#8d96a6'}
                  strokeWidth="2"
                  strokeDasharray={edge.style?.dash ? '6 6' : undefined}
                  markerEnd={edge.type === 'line' ? undefined : 'url(#arrowhead)'}
                />
                {edge.label ? (
                  <text x={midX} y={midY - 8} textAnchor="middle" className="edge-label">{edge.label}</text>
                ) : null}
              </g>
            );
          })}

          {/* Temporary connection line during edge creation */}
          {tempLine && (
            <line x1={tempLine.fromX} y1={tempLine.fromY} x2={tempLine.toX} y2={tempLine.toY}
              stroke="#4f74c8" strokeWidth="2" strokeDasharray="6 4" />
          )}
        </svg>

        {/* Group boundaries */}
        {board.groups.map((group) => {
          const nodes = group.nodeIds.map((nid) => nodeMap.get(nid)).filter(Boolean) as BoardNodeType[];
          if (nodes.length === 0) return null;
          const minX = Math.min(...nodes.map((n) => n.x)) - 28;
          const minY = Math.min(...nodes.map((n) => n.y)) - 52;
          const maxX = Math.max(...nodes.map((n) => n.x + n.width)) + 28;
          const maxY = Math.max(...nodes.map((n) => n.y + n.height)) + 28;
          return (
            <div key={group.id} className="group-boundary"
              style={{ left: minX, top: minY, width: maxX - minX, height: maxY - minY,
                background: group.style?.fill, borderColor: group.style?.stroke }}>
              <span>{group.title}</span>
            </div>
          );
        })}

        {/* Nodes */}
        {board.nodes.map((node) => (
          <BoardNode key={node.id} node={node}
            isSelected={selectedNodeId === node.id} editState={editState}
            onPointerDown={onPointerDown} onStartEdit={onStartEdit}
            onCommitEdit={onCommitEdit} onCancelEdit={onCancelEdit}
            onConnectStart={onConnectStart} />
        ))}

        {/* Empty canvas hint */}
        {board.nodes.length === 0 && (
          <div className="canvas-empty-hint">双击空白处创建卡片，或在下方向 Agent 描述你的想法</div>
        )}
      </div>
    </div>
  );
}
