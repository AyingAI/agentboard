import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { BoardDSL } from '../types/dsl';

interface DragState {
  nodeId: string;
  offsetX: number;
  offsetY: number;
  startX: number;
  startY: number;
}

interface ViewTransform {
  panOffset: { x: number; y: number };
  zoom: number;
}

interface NodeMoveEndEvent {
  nodeId: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

const EDGE_PAN_ZONE = 56;
const MAX_EDGE_PAN_STEP = 18;

function edgePanStep(distanceToEdge: number) {
  const distance = Math.max(0, distanceToEdge);
  return Math.ceil(((EDGE_PAN_ZONE - distance) / EDGE_PAN_ZONE) * MAX_EDGE_PAN_STEP);
}

export function useDrag(
  getBoard: () => BoardDSL,
  setBoard: (board: BoardDSL) => void,
  viewTransform: ViewTransform,
  setPanOffset: Dispatch<SetStateAction<{ x: number; y: number }>>,
  onNodeMoveEnd?: (event: NodeMoveEndEvent) => void,
) {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef(viewTransform);
  viewRef.current = viewTransform;

  // Pointer move/up listeners when drag is active
  useEffect(() => {
    if (!dragState) return;
    const activeDrag = dragState;

    function onPointerMove(event: PointerEvent) {
      const el = boardRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const current = getBoard();
      const localX = event.clientX - rect.left;
      const localY = event.clientY - rect.top;
      const { zoom } = viewRef.current;
      let { panOffset } = viewRef.current;

      let autoPanX = 0;
      let autoPanY = 0;
      if (localX < EDGE_PAN_ZONE) autoPanX = edgePanStep(localX);
      if (rect.width - localX < EDGE_PAN_ZONE) autoPanX = -edgePanStep(rect.width - localX);
      if (localY < EDGE_PAN_ZONE) autoPanY = edgePanStep(localY);
      if (rect.height - localY < EDGE_PAN_ZONE) autoPanY = -edgePanStep(rect.height - localY);

      if (autoPanX || autoPanY) {
        panOffset = { x: panOffset.x + autoPanX, y: panOffset.y + autoPanY };
        viewRef.current = { ...viewRef.current, panOffset };
        setPanOffset(panOffset);
      }

      const worldX = (localX - panOffset.x) / zoom;
      const worldY = (localY - panOffset.y) / zoom;

      setBoard({
        ...current,
        nodes: current.nodes.map((node) =>
          node.id === activeDrag.nodeId
            ? {
                ...node,
                x: Math.round(worldX - activeDrag.offsetX),
                y: Math.round(worldY - activeDrag.offsetY),
              }
            : node,
        ),
      });
    }

    function onPointerUp() {
      const current = getBoard();
      const node = current.nodes.find((item) => item.id === activeDrag.nodeId);
      if (node && (node.x !== activeDrag.startX || node.y !== activeDrag.startY)) {
        onNodeMoveEnd?.({
          nodeId: activeDrag.nodeId,
          from: { x: activeDrag.startX, y: activeDrag.startY },
          to: { x: node.x, y: node.y },
        });
      }
      setDragState(null);
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [dragState, getBoard, onNodeMoveEnd, setBoard, setPanOffset]);

  const handleNodePointerDown = useCallback(
    (nodeId: string, event: React.PointerEvent) => {
      const nodeEl = event.currentTarget as HTMLElement;
      const nodeRect = nodeEl.getBoundingClientRect();
      const node = getBoard().nodes.find((item) => item.id === nodeId);
      setDragState({
        nodeId,
        offsetX: (event.clientX - nodeRect.left) / viewRef.current.zoom,
        offsetY: (event.clientY - nodeRect.top) / viewRef.current.zoom,
        startX: node?.x ?? 0,
        startY: node?.y ?? 0,
      });
    },
    [getBoard],
  );

  return { dragState, boardRef, handleNodePointerDown };
}
