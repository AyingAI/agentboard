import { useCallback, useEffect, useRef, useState } from 'react';
import type { BoardDSL } from '../types/dsl';

interface DragState {
  nodeId: string;
  offsetX: number;
  offsetY: number;
}

export function useDrag(
  getBoard: () => BoardDSL,
  setBoard: (board: BoardDSL) => void,
) {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  // Pointer move/up listeners when drag is active
  useEffect(() => {
    if (!dragState) return;
    const activeDrag = dragState;

    function onPointerMove(event: PointerEvent) {
      const el = boardRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const current = getBoard();

      setBoard({
        ...current,
        nodes: current.nodes.map((node) =>
          node.id === activeDrag.nodeId
            ? {
                ...node,
                x: Math.round(event.clientX - rect.left + el.scrollLeft - activeDrag.offsetX),
                y: Math.round(event.clientY - rect.top + el.scrollTop - activeDrag.offsetY),
              }
            : node,
        ),
      });
    }

    function onPointerUp() {
      setDragState(null);
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [dragState, getBoard, setBoard]);

  const handleNodePointerDown = useCallback(
    (nodeId: string, event: React.PointerEvent) => {
      const nodeEl = event.currentTarget as HTMLElement;
      const nodeRect = nodeEl.getBoundingClientRect();
      setDragState({
        nodeId,
        offsetX: event.clientX - nodeRect.left,
        offsetY: event.clientY - nodeRect.top,
      });
    },
    [],
  );

  return { dragState, boardRef, handleNodePointerDown };
}
