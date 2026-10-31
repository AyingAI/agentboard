import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { BoardDSL, DSLPatch } from '../types/dsl';
import { arrangeMeasuredBoard, type RenderedNodeSize } from '../presentation/layout';
import { readingBoardViewport, type CanvasViewport } from '../engine/viewport';
import { canvasReadingSize } from '../presentation/viewport';

type Options = {
  sessionId: string;
  getBoard: () => BoardDSL;
  boardRef: RefObject<HTMLDivElement>;
  commit: (board: BoardDSL) => void;
  reconcile: (before: BoardDSL, after: BoardDSL) => void;
  setViewport: (view: CanvasViewport) => void;
};
type Plan = { sessionId: string; pending: boolean; movable?: Set<string>; focusIds?: string[]; positions?: Map<string, { x: number; y: number }> };

export function useBoardPresentation(options: Options) {
  const current = useRef(options); current.current = options;
  const [isSettling, setSettling] = useState(true);
  const lastFocused = useRef<string[] | undefined>();
  const sizes = useRef<RenderedNodeSize[]>([]);
  const plan = useRef<Plan>({ sessionId: options.sessionId, pending: true });
  if (plan.current.sessionId !== options.sessionId) { plan.current = { sessionId: options.sessionId, pending: true }; sizes.current = []; setSettling(true); }
  const getMeasuredBoard = useCallback(() => {
    const board = current.current.getBoard(), byId = new Map(sizes.current.map(size => [size.id, size]));
    return { ...board, nodes: board.nodes.map(node => ({ ...node, height: Math.max(node.height, byId.get(node.id)?.height ?? node.height) })) };
  }, []);
  const focus = useCallback((ids?: string[]) => {
    lastFocused.current = ids;
    const { boardRef, setViewport } = current.current;
    const rect = boardRef.current ? canvasReadingSize(boardRef.current) : null;
    if (!rect || !rect.width || !rect.height) return;
    const board = getMeasuredBoard();
    const selected = ids?.length ? board.nodes.filter(node => ids.includes(node.id)) : board.nodes;
    const subset = { ...board, nodes: selected.length ? selected : board.nodes };
    setViewport(readingBoardViewport(subset, rect.width, rect.height));
  }, [getMeasuredBoard]);
  const onNodesMeasured = useCallback((sessionId: string, nextSizes: RenderedNodeSize[]) => {
    if (sessionId !== current.current.sessionId) return;
    sizes.current = nextSizes;
    if (!plan.current.pending || !nextSizes.length) return;
    const board = current.current.getBoard();
    if (board.nodes.some(node => !nextSizes.some(size => size.id === node.id))) return;
    const next = arrangeMeasuredBoard(board, nextSizes, plan.current.movable, plan.current.positions);
    const ids = plan.current.focusIds;
    plan.current.pending = false;
    if (next !== board) { current.current.commit(next); current.current.reconcile(board, next); }
    // Measure the viewport after the dock and canvas have completed their layout.
    window.requestAnimationFrame(() => { if (sessionId === current.current.sessionId) { focus(ids); setSettling(false); } });
  }, [focus]);
  const request = useCallback((patch: DSLPatch, before: BoardDSL) => {
    if (!patch.ops.length) return;
    setSettling(true);
    const all = patch.ops.some(op => op.op === 'layout' && op.scope === 'all');
    const ids = patch.ops.flatMap(op => op.op === 'add_node' ? [op.node.id] : op.op === 'update_node' ? [op.nodeId] : []);
    const board = current.current.getBoard();
    const moved = board.nodes.filter(node => { const old = before.nodes.find(old => old.id === node.id); return old && (old.x !== node.x || old.y !== node.y); }).map(node => node.id);
    const positions = new Map<string, { x: number; y: number }>();
    if (!patch.ops.some(op => op.op === 'layout')) for (const op of patch.ops) {
      if (op.op === 'add_node') positions.set(op.node.id, { x: op.node.x, y: op.node.y });
      if (op.op === 'update_node' && (op.changes.x !== undefined || op.changes.y !== undefined)) {
        const node = board.nodes.find(node => node.id === op.nodeId);
        if (node) positions.set(node.id, { x: op.changes.x ?? node.x, y: op.changes.y ?? node.y });
      }
    }
    plan.current = { sessionId: current.current.sessionId, pending: true, positions, movable: all ? undefined : new Set([...ids, ...moved]), focusIds: before.nodes.length ? ids : undefined };
  }, []);
  useEffect(() => {
    const canvas = options.boardRef.current;
    if (!canvas) return;
    let previousWidth = canvas.clientWidth, previousHeight = canvas.clientHeight;
    const observer = new ResizeObserver(() => {
      const reframing = Math.abs(canvas.clientWidth - previousWidth) > 2 || Math.abs(canvas.clientHeight - previousHeight) > 80;
      previousWidth = canvas.clientWidth; previousHeight = canvas.clientHeight;
      if (reframing && !plan.current.pending) focus(lastFocused.current);
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [options.boardRef, focus]);
  return { isSettling, onNodesMeasured, request, focus, getMeasuredBoard, getMeasurements: () => sizes.current };
}
