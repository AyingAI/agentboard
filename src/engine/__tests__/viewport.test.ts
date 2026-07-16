import { describe, expect, it } from 'vitest';
import type { BoardDSL } from '../../types/dsl';
import { boardBounds, fitBoardViewport, zoomAroundPoint } from '../viewport';

const board: BoardDSL = {
  version: '0.1',
  board: { id: 'b1', title: 'Board', viewport: { x: 0, y: 0, zoom: 1 } },
  nodes: [
    { id: 'n1', type: 'card', x: 100, y: 100, width: 200, height: 100, title: 'One', body: '' },
    { id: 'n2', type: 'card', x: 500, y: 300, width: 200, height: 100, title: 'Two', body: '' },
  ],
  edges: [],
  groups: [],
  metadata: {},
};

describe('canvas viewport helpers', () => {
  it('calculates board bounds', () => {
    expect(boardBounds(board)).toEqual({
      minX: 100,
      minY: 100,
      maxX: 700,
      maxY: 400,
      width: 600,
      height: 300,
    });
  });

  it('fits and centers board content in a viewport', () => {
    const result = fitBoardViewport(board, 1000, 600, 100);
    expect(result.zoom).toBeCloseTo(4 / 3);
    expect(result.panOffset.x).toBeCloseTo(-33.333, 2);
    expect(result.panOffset.y).toBeCloseTo(-33.333, 2);
  });

  it('preserves the world point under the zoom anchor', () => {
    const result = zoomAroundPoint(
      { panOffset: { x: 100, y: 50 }, zoom: 1 },
      2,
      { x: 300, y: 250 },
    );
    expect(result).toEqual({ panOffset: { x: -100, y: -150 }, zoom: 2 });
  });
});
