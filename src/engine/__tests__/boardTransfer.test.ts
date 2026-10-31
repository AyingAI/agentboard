import { describe, expect, it } from 'vitest';
import type { BoardDSL, BoardSession } from '../../types/dsl';
import { boardExportFilename, createBoardExport, parseBoardImport } from '../boardTransfer';

const board: BoardDSL = {
  version: '0.1',
  board: { id: 'b1', title: '架构 / 草稿', viewport: { x: 0, y: 0, zoom: 1 } },
  nodes: [],
  edges: [],
  groups: [],
  metadata: {},
};

const session: BoardSession = {
  id: 's1',
  title: '架构 / 草稿',
  board,
  createdAt: 1,
  updatedAt: 2,
};

describe('board transfer', () => {
  it('exports and imports a validated board envelope', () => {
    const exported = createBoardExport(session);
    const imported = parseBoardImport(JSON.stringify(exported));
    expect(exported.format).toBe('agentboard.board.v1');
    expect(imported.title).toBe(session.title);
    expect(imported.board).toEqual(board);
  });

  it('accepts a raw BoardDSL file for compatibility', () => {
    expect(parseBoardImport(JSON.stringify(board)).board.board.id).toBe('b1');
  });

  it('rejects malformed and invalid board data', () => {
    expect(() => parseBoardImport('{bad')).toThrow('有效的 JSON');
    expect(() => parseBoardImport(JSON.stringify({ version: '0.1', nodes: [] }))).toThrow('白板校验失败');
  });

  it('creates a filesystem-safe filename', () => {
    expect(boardExportFilename('架构 / 草稿')).toBe('架构-草稿.agentboard.json');
  });

  it.each([null, [], 12])('rejects non-object imports with a useful error: %j', value => {
    expect(() => parseBoardImport(JSON.stringify(value))).toThrow('没有找到白板数据');
  });

  it.each([
    { nodes: [null] },
    { groups: [null] },
    { edges: [null] },
    { board: { id: 'b', title: 'bad', viewport: { x: 0, y: 0, zoom: 0 } } },
    { nodes: [{ id: 'n', type: 'card', title: 'bad', body: '', x: 'wrong', y: 0, width: 200, height: 100 }] },
    { nodes: [{ id: 'n', type: 'card', title: 'bad', body: '', x: 0, y: 0, width: 200, height: 100, tags: 'wrong' }] },
  ])('rejects malformed content before it can crash the canvas: %j', changes => {
    expect(() => parseBoardImport(JSON.stringify({ ...board, ...changes }))).toThrow('白板校验失败');
  });
});
