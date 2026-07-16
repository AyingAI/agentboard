import type { BoardDSL, BoardHistory } from '../types/dsl';

export const MAX_BOARD_HISTORY = 25;

function cloneBoard(board: BoardDSL) {
  return structuredClone(board);
}

export function normalizeHistory(history?: BoardHistory): BoardHistory {
  return {
    past: Array.isArray(history?.past) ? history.past.slice(-MAX_BOARD_HISTORY) : [],
    future: Array.isArray(history?.future) ? history.future.slice(0, MAX_BOARD_HISTORY) : [],
  };
}

export function recordBoardChange(history: BoardHistory | undefined, currentBoard: BoardDSL): BoardHistory {
  const current = normalizeHistory(history);
  return {
    past: [...current.past, cloneBoard(currentBoard)].slice(-MAX_BOARD_HISTORY),
    future: [],
  };
}

export function undoBoardChange(
  history: BoardHistory | undefined,
  currentBoard: BoardDSL,
): { board: BoardDSL; history: BoardHistory } | null {
  const current = normalizeHistory(history);
  const previousBoard = current.past[current.past.length - 1];
  if (!previousBoard) return null;
  return {
    board: cloneBoard(previousBoard),
    history: {
      past: current.past.slice(0, -1),
      future: [cloneBoard(currentBoard), ...current.future].slice(0, MAX_BOARD_HISTORY),
    },
  };
}

export function redoBoardChange(
  history: BoardHistory | undefined,
  currentBoard: BoardDSL,
): { board: BoardDSL; history: BoardHistory } | null {
  const current = normalizeHistory(history);
  const nextBoard = current.future[0];
  if (!nextBoard) return null;
  return {
    board: cloneBoard(nextBoard),
    history: {
      past: [...current.past, cloneBoard(currentBoard)].slice(-MAX_BOARD_HISTORY),
      future: current.future.slice(1),
    },
  };
}
