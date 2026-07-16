import { describe, expect, it } from 'vitest';
import type { BoardDSL } from '../../types/dsl';
import { MAX_BOARD_HISTORY, recordBoardChange, redoBoardChange, undoBoardChange } from '../history';

function board(title: string): BoardDSL {
  return {
    version: '0.1',
    board: { id: 'b1', title, viewport: { x: 0, y: 0, zoom: 1 } },
    nodes: [],
    edges: [],
    groups: [],
    metadata: {},
  };
}

describe('board history', () => {
  it('records the current board and clears the redo branch', () => {
    const history = recordBoardChange({ past: [board('A')], future: [board('C')] }, board('B'));
    expect(history.past.map((item) => item.board.title)).toEqual(['A', 'B']);
    expect(history.future).toEqual([]);
  });

  it('undoes and then redoes a transaction', () => {
    const current = board('B');
    const undo = undoBoardChange({ past: [board('A')], future: [] }, current);
    expect(undo?.board.board.title).toBe('A');
    expect(undo?.history.future[0].board.title).toBe('B');

    const redo = redoBoardChange(undo?.history, undo!.board);
    expect(redo?.board.board.title).toBe('B');
    expect(redo?.history.past[0].board.title).toBe('A');
  });

  it('returns null when no transaction is available', () => {
    expect(undoBoardChange(undefined, board('A'))).toBeNull();
    expect(redoBoardChange(undefined, board('A'))).toBeNull();
  });

  it('caps persistent history size', () => {
    let history = { past: [] as BoardDSL[], future: [] as BoardDSL[] };
    for (let index = 0; index < MAX_BOARD_HISTORY + 5; index += 1) {
      history = recordBoardChange(history, board(String(index)));
    }
    expect(history.past).toHaveLength(MAX_BOARD_HISTORY);
    expect(history.past[0].board.title).toBe('5');
  });
});
