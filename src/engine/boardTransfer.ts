import type { BoardDSL, BoardSession } from '../types/dsl';
import { validateBoard } from './validation';

export const BOARD_EXPORT_FORMAT = 'agentboard.board.v1';

export interface BoardExportFile {
  format: typeof BOARD_EXPORT_FORMAT;
  exportedAt: string;
  title: string;
  board: BoardDSL;
}

export function createBoardExport(session: BoardSession): BoardExportFile {
  return {
    format: BOARD_EXPORT_FORMAT,
    exportedAt: new Date().toISOString(),
    title: session.title,
    board: structuredClone(session.board),
  };
}

export function parseBoardImport(text: string): { title: string; board: BoardDSL } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('文件不是有效的 JSON。');
  }

  const record = value as Partial<BoardExportFile> & Partial<BoardDSL>;
  const board = record.format === BOARD_EXPORT_FORMAT ? record.board : value as BoardDSL;
  if (!board || typeof board !== 'object') throw new Error('文件中没有找到白板数据。');

  const errors = validateBoard(board);
  if (errors.length > 0) {
    throw new Error(`白板校验失败：${errors[0].message}`);
  }

  const title = record.format === BOARD_EXPORT_FORMAT && typeof record.title === 'string'
    ? record.title
    : board.board.title || '导入的白板';
  return { title, board: structuredClone(board) };
}

export function boardExportFilename(title: string) {
  const safeTitle = title.trim().replace(/[\\/:*?"<>|\s]+/g, '-').replace(/-+/g, '-').slice(0, 60) || 'board';
  return `${safeTitle}.agentboard.json`;
}
