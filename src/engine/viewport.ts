import type { BoardDSL } from '../types/dsl';

export interface CanvasViewport {
  panOffset: { x: number; y: number };
  zoom: number;
}

export function boardBounds(board: BoardDSL) {
  if (board.nodes.length === 0) return null;
  const members = new Set(board.groups.flatMap(group => group.nodeIds));
  const minX = Math.min(...board.nodes.map(node => node.x - (members.has(node.id) ? 28 : 0)));
  const minY = Math.min(...board.nodes.map(node => node.y - (members.has(node.id) ? 52 : 0)));
  const maxX = Math.max(...board.nodes.map(node => node.x + node.width + (members.has(node.id) ? 28 : 0)));
  const maxY = Math.max(...board.nodes.map(node => node.y + node.height + (members.has(node.id) ? 28 : 0)));
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
  const zoom = Math.min(1.6, Math.max(0.05, Math.min(
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

/** Keep text readable on large boards; the full overview remains an explicit command. */
export function readingBoardViewport(board: BoardDSL, width: number, height: number, focusId?: string): CanvasViewport {
  const overview = fitBoardViewport(board, width, height, 32);
  if (!board.nodes.length) return { panOffset: { x: 0, y: 0 }, zoom: 1 };
  if (!focusId && overview.zoom >= .8) {
    const bounds = boardBounds(board)!;
    const zoom = Math.min(1, overview.zoom);
    return { zoom, panOffset: { x: (width - bounds.width * zoom) / 2 - bounds.minX * zoom, y: (height - bounds.height * zoom) / 2 - bounds.minY * zoom } };
  }
  const node = board.nodes.find(node => node.id === focusId) || [...board.nodes].sort((a, b) => a.y - b.y || a.x - b.x)[0];
  const group = !focusId ? board.groups.find(group => group.nodeIds.includes(node.id)) : undefined;
  const regionNodes = group ? board.nodes.filter(item => group.nodeIds.includes(item.id)) : !focusId
    ? board.nodes.filter(item => Math.abs(item.y - node.y) < 40) : [node];
  const region = boardBounds({ ...board, nodes: regionNodes, groups: group ? [group] : [] })!;
  const padding = width < 640 ? 18 : 40;
  const zoom = Math.min(1, Math.max(width < 640 ? .45 : .8, (width - 2 * padding) / region.width));
  const fitsRegion = region.width * zoom <= width - padding * 2;
  const topPadding = board.groups.some(group => group.nodeIds.includes(node.id)) ? 68 : 24;
  return { zoom, panOffset: {
    x: fitsRegion ? (width - region.width * zoom) / 2 - region.minX * zoom : padding - node.x * zoom,
    y: Math.max(topPadding, Math.min(80, (height - node.height * zoom) / 2)) - node.y * zoom,
  } };
}
