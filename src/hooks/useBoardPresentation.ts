import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { BoardDSL, DSLPatch, LayoutAlgorithm } from '../types/dsl';
import { arrangeMeasuredBoard, arrangeSpatialBoard, type RenderedNodeSize } from '../presentation/layout';
import { readingBoardViewport, type CanvasViewport } from '../engine/viewport';
import { canvasReadingSize } from '../presentation/viewport';
import { composeMeasuredBoard, compositionWidth, hasManagedComposition, needsCompositionRepair, preserveBoardPlacement } from '../presentation/composition';
import { spatialNodeIds } from '../presentation/spatialPlan';

type Options = {
  sessionId: string;
  getBoard: () => BoardDSL;
  boardRef: RefObject<HTMLDivElement>;
  commit: (board: BoardDSL) => void;
  commitRepair: (board: BoardDSL) => void;
  reconcile: (before: BoardDSL, after: BoardDSL) => void;
  setViewport: (view: CanvasViewport) => void;
  suspendViewport?: boolean;
};
type Plan = { sessionId: string; pending: boolean; initial?: boolean; compose?: boolean; freePlacement?: boolean; keepWidth?: boolean; algorithm?: LayoutAlgorithm; movable?: Set<string>; focusIds?: string[]; positions?: Map<string, { x: number; y: number }> };

export function useBoardPresentation(options: Options) {
  const current = useRef(options); current.current = options;
  const [isSettling, setSettling] = useState(true);
  const lastFocused = useRef<string[] | undefined>();
  const sizes = useRef<RenderedNodeSize[]>([]);
  const plan = useRef<Plan>({ sessionId: options.sessionId, pending: true, initial: true });
  const frame = useRef(0);
  const revision = useRef(0);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  if (plan.current.sessionId !== options.sessionId) { revision.current++; plan.current = { sessionId: options.sessionId, pending: true, initial: true }; sizes.current = []; setSettling(true); }
  const getMeasuredBoard = useCallback(() => {
    const board = current.current.getBoard(), byId = new Map(sizes.current.map(size => [size.id, size]));
    return { ...board, nodes: board.nodes.map(node => ({ ...node, height: Math.max(node.height, byId.get(node.id)?.height ?? node.height) })) };
  }, []);
  const focus = useCallback((ids?: string[]) => {
    if (current.current.suspendViewport) return;
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
    if (!nextSizes.length) return;
    const board = current.current.getBoard();
    if (board.nodes.some(node => !nextSizes.some(size => size.id === node.id))) return;
    if (!plan.current.pending) {
      // Font loading / late host controls may change height after the first render.
      const grown = nextSizes.filter(size => size.height > (board.nodes.find(node => node.id === size.id)?.height ?? Infinity) + 1);
      if (!grown.length) return;
      const next = hasManagedComposition(board) ? composeMeasuredBoard(board, nextSizes)
        : arrangeMeasuredBoard(board, nextSizes, new Set(grown.map(size => size.id)));
      if (next !== board) { current.current.commit(next); current.current.reconcile(board, next); }
      return;
    }
    const repair = !!plan.current.initial && needsCompositionRepair(board);
    const compose = plan.current.compose || repair || plan.current.initial && hasManagedComposition(board);
    const width = compositionWidth(current.current.boardRef.current?.clientWidth);
    const arranged = compose ? composeMeasuredBoard(board, nextSizes, { availableWidth: plan.current.keepWidth || plan.current.initial && hasManagedComposition(board) ? undefined : width, movableIds: plan.current.movable, algorithm: plan.current.algorithm })
      : plan.current.algorithm ? arrangeSpatialBoard(board, nextSizes, plan.current.algorithm, plan.current.movable)
      : arrangeMeasuredBoard(board, nextSizes, plan.current.movable, plan.current.positions);
    const next = plan.current.freePlacement ? preserveBoardPlacement(arranged) : arranged;
    const ids = plan.current.focusIds;
    plan.current.pending = false;
    if (next !== board) { (repair ? current.current.commitRepair : current.current.commit)(next); current.current.reconcile(board, next); }
    // Measure the viewport after the dock and canvas have completed their layout.
    const version = revision.current;
    cancelAnimationFrame(frame.current);
    frame.current = window.requestAnimationFrame(() => { if (sessionId === current.current.sessionId && version === revision.current) { focus(ids); setSettling(false); } });
  }, [focus]);
  const request = useCallback((patch: DSLPatch, before: BoardDSL) => {
    if (!patch.ops.length && !patch.presentation?.plan) return;
    revision.current++;
    cancelAnimationFrame(frame.current);
    setSettling(true);
    const layoutOp = [...patch.ops].reverse().find(op => op.op === 'layout');
    const board = current.current.getBoard();
    const planIds = patch.presentation?.plan ? spatialNodeIds(patch.presentation.plan, board) : [];
    const all = planIds.length > 0 && planIds.length === board.nodes.length || layoutOp?.op === 'layout' && (layoutOp.scope === 'all' || patch.ops.every(op => op.op === 'layout'));
    const ids = [...planIds, ...patch.ops.flatMap(op => op.op === 'add_node' ? [op.node.id] : op.op === 'update_node' ? [op.nodeId] : [])];
    const moved = board.nodes.filter(node => { const old = before.nodes.find(old => old.id === node.id); return old && (old.x !== node.x || old.y !== node.y); }).map(node => node.id);
    const positions = new Map<string, { x: number; y: number }>();
    if (!patch.ops.some(op => op.op === 'layout')) for (const op of patch.ops) {
      if (op.op === 'add_node') positions.set(op.node.id, { x: op.node.x, y: op.node.y });
      if (op.op === 'update_node' && (op.changes.x !== undefined || op.changes.y !== undefined)) {
        const node = board.nodes.find(node => node.id === op.nodeId);
        if (node) positions.set(node.id, { x: op.changes.x ?? node.x, y: op.changes.y ?? node.y });
      }
    }
    const spatial = layoutOp?.op === 'layout' && layoutOp.algorithm && ['horizontal', 'vertical', 'mindmap', 'matrix', 'timeline', 'swimlane'].includes(layoutOp.algorithm);
    const positioned = patch.ops.some(op => op.op === 'update_node' && (op.changes.x !== undefined || op.changes.y !== undefined));
    const preserve = patch.presentation?.layout === 'preserve';
    const managed = hasManagedComposition(before) && !positioned && !preserve && (!patch.presentation?.plan || all);
    const compose = !preserve && !positioned && !spatial && (!before.nodes.length || all || managed || patch.ops.some(op => op.op === 'add_node'));
    plan.current = { sessionId: current.current.sessionId, pending: true, compose, freePlacement: preserve || positioned || !!spatial || !!patch.presentation?.plan && !all, keepWidth: managed && !all, algorithm: !preserve && layoutOp?.op === 'layout' ? layoutOp.algorithm : undefined, positions,
      movable: all || compose && managed || !before.nodes.length ? undefined : new Set([...ids, ...moved]), focusIds: before.nodes.length && !all ? ids : undefined };
  }, []);
  useEffect(() => {
    const canvas = options.boardRef.current;
    if (!canvas) return;
    let previousWidth = canvas.clientWidth, previousHeight = canvas.clientHeight;
    const observer = new ResizeObserver(() => {
      const reframing = Math.abs(canvas.clientWidth - previousWidth) > 2 || Math.abs(canvas.clientHeight - previousHeight) > 80;
      previousWidth = canvas.clientWidth; previousHeight = canvas.clientHeight;
      if (reframing && !plan.current.pending && !current.current.suspendViewport) focus(lastFocused.current);
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [options.boardRef, focus]);
  return { isSettling, onNodesMeasured, request, focus, getMeasuredBoard, getMeasurements: () => sizes.current };
}
