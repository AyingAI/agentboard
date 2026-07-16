import type { BoardDSL } from '../types/dsl';

export interface CanvasViewport {
  panOffset: { x: number; y: number };
  zoom: number;
}

export function boardBounds(board: BoardDSL) {
  if (board.nodes.length === 0) return null;
  const minX = Math.min(...board.nodes.map((node) => node.x));
  const minY = Math.min(...board.nodes.map((node) => node.y));
  const maxX = Math.max(...board.nodes.map((node) => node.x + node.width));
  const maxY = Math.max(...board.nodes.map((node) => node.y + node.height));
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

export function fitBoardViewport(
  board: BoardDSL,
  viewportWidth: number,
  viewportHeight: number,
  padding = 80,
): CanvasViewport {
  const bounds = boardBounds(board);
  if (!bounds) return { panOffset: { x: 0, y: 0 }, zoom: 1 };

  const availableWidth = Math.max(1, viewportWidth - padding * 2);
  const availableHeight = Math.max(1, viewportHeight - padding * 2);
  const zoom = Math.min(1.6, Math.max(0.35, Math.min(
    availableWidth / Math.max(bounds.width, 1),
    availableHeight / Math.max(bounds.height, 1),
  )));

  return {
    zoom,
    panOffset: {
      x: (viewportWidth - bounds.width * zoom) / 2 - bounds.minX * zoom,
      y: (viewportHeight - bounds.height * zoom) / 2 - bounds.minY * zoom,
    },
  };
}

export function zoomAroundPoint(
  current: CanvasViewport,
  nextZoom: number,
  point: { x: number; y: number },
): CanvasViewport {
  const worldX = (point.x - current.panOffset.x) / current.zoom;
  const worldY = (point.y - current.panOffset.y) / current.zoom;
  return {
    zoom: nextZoom,
    panOffset: {
      x: point.x - worldX * nextZoom,
      y: point.y - worldY * nextZoom,
    },
  };
}
