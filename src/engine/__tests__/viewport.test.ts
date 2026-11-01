import { describe, expect, it } from 'vitest';
import type { BoardDSL } from '../../types/dsl';
import { boardBounds, fitBoardViewport, readingBoardViewport, zoomAroundPoint } from '../viewport';

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

it('includes group titles and margins in overview bounds', () => {
  const grouped = { ...board, groups: [{ id: 'g', title: '阶段一', nodeIds: ['n1'] }] };
  expect(boardBounds(grouped)?.minY).toBe(48);
  expect(boardBounds(grouped)?.minX).toBe(72);
});

it('fits very large boards without clipping at the old minimum zoom', () => {
  const large = { ...board, nodes: [{ ...board.nodes[0], height: 12000 }] };
  const view = fitBoardViewport(large, 1200, 800, 40);
  expect(view.zoom).toBeLessThan(.35);
  expect(12000 * view.zoom).toBeLessThanOrEqual(720);
});

it('fits a near-screen-sized first section above the composer while retaining readable scale', () => {
  const section = { ...board, nodes: [{ ...board.nodes[0], width: 740, height: 720 }, { ...board.nodes[1], x: 900, y: 1100, width: 740, height: 720 }], groups: [{ id: 'a', title: '第一节', nodeIds: ['n1'] }, { id: 'b', title: '第二节', nodeIds: ['n2'] }] };
  const view = readingBoardViewport(section, 1280, 760);
  expect(view.zoom).toBeGreaterThanOrEqual(.8); expect(view.zoom).toBeLessThan(1);
  expect(section.nodes[0].y * view.zoom + view.panOffset.y).toBeGreaterThanOrEqual(24);
  expect((section.nodes[0].y + section.nodes[0].height + 28) * view.zoom + view.panOffset.y).toBeLessThanOrEqual(736);
});

it('does not shrink a very long section into unreadable text to fit its entire height', () => {
  const long = { ...board, nodes: [{ ...board.nodes[0], width: 700, height: 4000 }] };
  expect(readingBoardViewport(long, 1280, 760).zoom).toBeGreaterThanOrEqual(.8);
});
