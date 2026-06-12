import { useCallback, useRef, useState } from 'react';
import type { BoardDSL, BoardEdge } from '../types/dsl';

interface TempLine {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

export function useEdgeCreation(
  getBoard: () => BoardDSL,
  setBoard: (b: BoardDSL) => void,
  boardRef: React.RefObject<HTMLDivElement | null>,
) {
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [tempLine, setTempLine] = useState<TempLine | null>(null);
  const tempLineRef = useRef(tempLine);
  tempLineRef.current = tempLine;

  const startConnection = useCallback(
    (fromNodeId: string, fromX: number, fromY: number) => {
      setConnectingFrom(fromNodeId);
      setTempLine({ fromX, fromY, toX: fromX, toY: fromY });
    },
    [],
  );

  const updateConnection = useCallback((_e: PointerEvent, toX: number, toY: number) => {
    setTempLine((prev) => prev ? { ...prev, toX, toY } : null);
  }, []);

  const finishConnection = useCallback(
    (targetNodeId: string | null) => {
      const from = connectingFrom;
      setConnectingFrom(null);
      setTempLine(null);

      if (!from || !targetNodeId || from === targetNodeId) return;

      const board = getBoard();
      const edgeId = `edge_${from}_${targetNodeId}`;

      // Don't create duplicate edges
      if (board.edges.some((e) => e.from === from && e.to === targetNodeId)) return;

      const newEdge: BoardEdge = {
        id: edgeId,
        from,
        to: targetNodeId,
        label: '',
        type: 'arrow',
        style: { stroke: '#7f8794' },
      };

      setBoard({
        ...board,
        edges: [...board.edges, newEdge],
      });
    },
    [connectingFrom, getBoard, setBoard],
  );

  const cancelConnection = useCallback(() => {
    setConnectingFrom(null);
    setTempLine(null);
  }, []);

  return {
    connectingFrom,
    tempLine,
    startConnection,
    updateConnection,
    finishConnection,
    cancelConnection,
  };
}
