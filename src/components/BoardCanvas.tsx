import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type FocusEvent } from 'react';
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

type NodeMeasurements = Map<string, { width: number; height: number }>;
type ConnectionSide = 'top' | 'right' | 'bottom' | 'left';

interface EdgeEditState {
  edgeId: string;
}

interface BoardCanvasProps {
  board: BoardDSL;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  editState: EditState | null;
  edgeEditState: EdgeEditState | null;
  boardRef: React.RefObject<HTMLDivElement>;
  isSpaceHeld: boolean;
  isPanning: boolean;
  panOffset: { x: number; y: number };
  zoom: number;
  tempLine: TempLine | null;
  onPointerDown: (nodeId: string, event: React.PointerEvent) => void;
  onEdgePointerDown: (edgeId: string, event: React.PointerEvent) => void;
  onCanvasPointerDown: (e: React.PointerEvent) => boolean;
  onCanvasWheel: (e: React.WheelEvent<HTMLDivElement>) => void;
  onDeselectAll: () => void;
  onStartEdit: (nodeId: string, field: 'title' | 'body') => void;
  onCommitEdit: (nodeId: string, field: 'title' | 'body', value: string) => void;
  onCancelEdit: () => void;
  onCanvasDoubleClick: (x: number, y: number) => void;
  onConnectStart: (nodeId: string, x: number, y: number) => void;
  onEdgeLabelDoubleClick: (edgeId: string) => void;
  onCommitEdgeLabel: (edgeId: string, value: string) => void;
  onCancelEdgeLabel: () => void;
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

export function offsetEdgePoints(
  start: { x: number; y: number },
  end: { x: number; y: number },
  amount: number,
) {
  if (amount === 0) return { start, end };

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.001) return { start, end };

  const offset = {
    x: (-dy / length) * amount,
    y: (dx / length) * amount,
  };

  return {
    start: { x: start.x + offset.x, y: start.y + offset.y },
    end: { x: end.x + offset.x, y: end.y + offset.y },
  };
}

function nodeCenter(node: BoardNodeType) {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}

function nodeConnectionPoint(node: BoardNodeType, side: ConnectionSide) {
  if (side === 'top') return { x: node.x + node.width / 2, y: node.y };
  if (side === 'right') return { x: node.x + node.width, y: node.y + node.height / 2 };
  if (side === 'left') return { x: node.x, y: node.y + node.height / 2 };
  return { x: node.x + node.width / 2, y: node.y + node.height };
}

/**
 * 判断双击目标是否落在「空白画布区域」，应触发新建卡片。
 * 仅当 target 自身的 class 命中允许列表（画布根、内容层、边线 SVG 根、空状态提示）才返回 true。
 * 节点(.board-node)、连接点、边线(.edge-hit-area/.edge-line)、group(.group-boundary) 均不在列表内，故不会误触发。
 */
export const BLANK_CANVAS_CLASSES = ['board-canvas', 'canvas-content', 'edge-layer', 'canvas-empty-hint'];

export function isBlankCanvasTarget(target: Element | null): boolean {
  if (!target) return false;
  return BLANK_CANVAS_CLASSES.some((cls) => target.classList.contains(cls));
}

/**
 * Normalize edge label text. Trims whitespace.
 * Returns the trimmed string, or undefined for empty/whitespace-only (clears the label).
 */
export function normalizeEdgeLabel(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed || undefined;
}

interface EdgeLabelEditorProps {
  edgeId: string;
  label: string | undefined;
  midX: number;
  midY: number;
  onCommit: (edgeId: string, value: string) => void;
  onCancel: () => void;
}

/**
 * Per-edit-session label input. Owns its own finishedRef so a fresh false
 * is guaranteed on every mount — no bleed across edit cycles.
 *
 * Enter / Escape / blur each commit or cancel exactly once; the finishedRef
 * guard prevents double-firing when Enter/Escape triggers a parent state
 * update that unmounts the input, causing a trailing blur.
 */
function EdgeLabelEditor({ edgeId, label, midX, midY, onCommit, onCancel }: EdgeLabelEditorProps) {
  const finishedRef = useRef(false);

  function commit(value: string) {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onCommit(edgeId, value);
  }

  function cancel() {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onCancel();
  }

  return (
    <foreignObject className="edge-label-foreign" x={midX - 80} y={midY - 18} width={160} height={36}>
      <input
        className="edge-label-input"
        defaultValue={label ?? ''}
        autoFocus
        onBlur={(e: FocusEvent<HTMLInputElement>) => commit(e.currentTarget.value)}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit(e.currentTarget.value);
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
          }
        }}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      />
    </foreignObject>
  );
}

function sameMeasurements(a: NodeMeasurements, b: NodeMeasurements) {
  if (a.size !== b.size) return false;
  for (const [id, size] of a) {
    const other = b.get(id);
    if (!other || other.width !== size.width || other.height !== size.height) return false;
  }
  return true;
}

export default function BoardCanvas({
  board,
  selectedNodeId,
  selectedEdgeId,
  editState,
  edgeEditState,
  boardRef,
  isSpaceHeld,
  isPanning,
  panOffset,
  zoom,
  tempLine,
  onPointerDown,
  onEdgePointerDown,
  onCanvasPointerDown,
  onCanvasWheel,
  onDeselectAll,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
  onCanvasDoubleClick,
  onConnectStart,
  onEdgeLabelDoubleClick,
  onCommitEdgeLabel,
  onCancelEdgeLabel,
}: BoardCanvasProps) {
  const [nodeMeasurements, setNodeMeasurements] = useState<NodeMeasurements>(() => new Map());

  const nodeMap = useMemo(
    () => new Map(board.nodes.map((node) => {
      const measured = nodeMeasurements.get(node.id);
      return [
        node.id,
        measured
          ? { ...node, width: measured.width, height: Math.max(node.height, measured.height) }
          : node,
      ];
    })),
    [board.nodes, nodeMeasurements],
  );

  const contentSize = useMemo(() => {
    if (board.nodes.length === 0) return { w: 2000, h: 1400 };
    const nodes = board.nodes.map((node) => nodeMap.get(node.id) ?? node);
    const maxX = Math.max(...nodes.map((n) => n.x + n.width)) + 400;
    const maxY = Math.max(...nodes.map((n) => n.y + n.height)) + 400;
    return { w: Math.max(maxX, 2000), h: Math.max(maxY, 1400) };
  }, [board.nodes, nodeMap]);

  useLayoutEffect(() => {
    const boardEl = boardRef.current;
    if (!boardEl) return;

    const measureNodes = () => {
      const next: NodeMeasurements = new Map();
      boardEl.querySelectorAll<HTMLElement>('.board-node[data-node-id]').forEach((element) => {
        const id = element.dataset.nodeId;
        if (!id) return;
        const rect = element.getBoundingClientRect();
        next.set(id, {
          width: Math.round(rect.width / zoom),
          height: Math.round(rect.height / zoom),
        });
      });

      setNodeMeasurements((prev) => sameMeasurements(prev, next) ? prev : next);
    };

    measureNodes();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measureNodes);
    boardEl.querySelectorAll<HTMLElement>('.board-node[data-node-id]').forEach((element) => {
      observer.observe(element);
    });

    return () => observer.disconnect();
  }, [board.nodes, boardRef, zoom]);

  return (
    <div
      className={`board-canvas ${isSpaceHeld ? 'space-held' : ''} ${isPanning ? 'panning' : ''}`}
      ref={boardRef}
      style={{
        backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
        backgroundPosition: `${panOffset.x}px ${panOffset.y}px`,
      }}
      onWheel={onCanvasWheel}
      onPointerDown={(e) => {
        const handled = onCanvasPointerDown(e);
        if (!handled) onDeselectAll();
      }}
      onDoubleClick={(e) => {
        if (isBlankCanvasTarget(e.target as Element)) {
          const rect = boardRef.current?.getBoundingClientRect();
          if (rect) {
            onCanvasDoubleClick(
              (e.clientX - rect.left - panOffset.x) / zoom,
              (e.clientY - rect.top - panOffset.y) / zoom,
            );
          }
        }
      }}
    >
      <div
        className="canvas-content"
        style={{
          width: contentSize.w,
          height: contentSize.h,
          transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
        }}
      >
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
            const hasReverseEdge = board.edges.some((candidate) =>
              candidate.from === edge.to && candidate.to === edge.from,
            );
            const display = offsetEdgePoints(start, end, hasReverseEdge ? 10 : 0);
            const midX = (display.start.x + display.end.x) / 2;
            const midY = (display.start.y + display.end.y) / 2;
            const isSelected = selectedEdgeId === edge.id;
            const isEditingLabel = edgeEditState?.edgeId === edge.id;
            return (
              <g key={edge.id}
                className={`edge-item ${isSelected ? 'selected' : ''}`}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onEdgeLabelDoubleClick(edge.id);
                }}
              >
                <line
                  className="edge-hit-area"
                  x1={display.start.x} y1={display.start.y} x2={display.end.x} y2={display.end.y}
                  onPointerDown={(event) => onEdgePointerDown(edge.id, event)}
                />
                <line
                  className="edge-line"
                  x1={display.start.x} y1={display.start.y} x2={display.end.x} y2={display.end.y}
                  stroke={edge.style?.stroke ?? '#8d96a6'}
                  strokeWidth={isSelected ? '3' : '2'}
                  strokeDasharray={edge.style?.dash ? '6 6' : undefined}
                  markerEnd={edge.type === 'line' ? undefined : 'url(#arrowhead)'}
                />
                {isEditingLabel ? (
                  <EdgeLabelEditor
                    edgeId={edge.id}
                    label={edge.label}
                    midX={midX}
                    midY={midY}
                    onCommit={onCommitEdgeLabel}
                    onCancel={onCancelEdgeLabel}
                  />
                ) : edge.label ? (
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
            onConnectStart={(nodeId, side) => {
              const measuredNode = nodeMap.get(nodeId);
              if (!measuredNode) return;
              const start = nodeConnectionPoint(measuredNode, side);
              onConnectStart(nodeId, start.x, start.y);
            }} />
        ))}
      </div>

      {/* Empty canvas hint */}
      {board.nodes.length === 0 && (
        <div className="canvas-empty-hint">双击空白处创建卡片，或在下方向 Agent 描述你的想法</div>
      )}
    </div>
  );
}
