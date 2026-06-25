import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { BoardDSL } from '../types/dsl';

interface DragState {
  nodeId: string;
  nodeIds: string[];
  pointerStartX: number;
  pointerStartY: number;
  starts: Array<{ nodeId: string; x: number; y: number }>;
}

interface ViewTransform {
  panOffset: { x: number; y: number };
  zoom: number;
}

interface NodeMoveEndEvent {
  nodeId: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  moves: Array<{
    nodeId: string;
    from: { x: number; y: number };
    to: { x: number; y: number };
  }>;
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

      const deltaX = worldX - activeDrag.pointerStartX;
      const deltaY = worldY - activeDrag.pointerStartY;
      const startsById = new Map(activeDrag.starts.map((start) => [start.nodeId, start]));

      setBoard({
        ...current,
        nodes: current.nodes.map((node) => {
          const start = startsById.get(node.id);
          return start
            ? {
                ...node,
                x: Math.round(start.x + deltaX),
                y: Math.round(start.y + deltaY),
              }
            : node;
        }),
      });
    }

    function onPointerUp() {
      const current = getBoard();
      const moves = activeDrag.starts
        .map((start) => {
          const node = current.nodes.find((item) => item.id === start.nodeId);
          if (!node || (node.x === start.x && node.y === start.y)) return null;
          return {
            nodeId: start.nodeId,
            from: { x: start.x, y: start.y },
            to: { x: node.x, y: node.y },
          };
        })
        .filter(Boolean) as NodeMoveEndEvent['moves'];
      const primaryMove = moves.find((move) => move.nodeId === activeDrag.nodeId) ?? moves[0];
      if (primaryMove) {
        onNodeMoveEnd?.({
          nodeId: activeDrag.nodeId,
          from: primaryMove.from,
          to: primaryMove.to,
          moves,
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
    (nodeId: string, event: React.PointerEvent, dragNodeIds?: string[]) => {
      const el = boardRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const { panOffset, zoom } = viewRef.current;
      const pointerStartX = (event.clientX - rect.left - panOffset.x) / zoom;
      const pointerStartY = (event.clientY - rect.top - panOffset.y) / zoom;
      const board = getBoard();
      const uniqueNodeIds = Array.from(new Set([...(dragNodeIds?.length ? dragNodeIds : [nodeId])]));
      const starts = uniqueNodeIds
        .map((id) => {
          const node = board.nodes.find((item) => item.id === id);
          return node ? { nodeId: id, x: node.x, y: node.y } : null;
        })
        .filter(Boolean) as DragState['starts'];
      if (starts.length === 0) return;

      setDragState({
        nodeId,
        nodeIds: starts.map((start) => start.nodeId),
        pointerStartX,
        pointerStartY,
        starts,
      });
    },
    [getBoard],
  );

  return { dragState, boardRef, handleNodePointerDown };
}
