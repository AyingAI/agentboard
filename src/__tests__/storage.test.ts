import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyBoard } from '../data/initialBoard';
import { loadSessions } from '../storage';
import type { BoardDSL } from '../types/dsl';

function createLocalStorageStub(): Storage {
  const items = new Map<string, string>();

  return {
    get length() {
      return items.size;
    },
    clear() {
      items.clear();
    },
    getItem(key: string) {
      return items.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(items.keys())[index] ?? null;
    },
    removeItem(key: string) {
      items.delete(key);
    },
    setItem(key: string, value: string) {
      items.set(key, value);
    },
  };
}

function boardWithOneNode(): BoardDSL {
  return {
    ...emptyBoard,
    board: { ...emptyBoard.board, title: '本地历史' },
    nodes: [
      {
        id: 'node_local_history',
        type: 'card',
        x: 0,
        y: 0,
        width: 240,
        height: 120,
        title: '只存在本机',
        body: '',
        createdBy: 'user',
      },
    ],
  };
}

describe('session storage', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorageStub());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts a brand-new checkout with an empty board when no local history exists', () => {
    const data = loadSessions(emptyBoard);

    expect(data.sessions).toHaveLength(1);
    expect(data.sessions[0].board.nodes).toEqual([]);
    expect(data.sessions[0].board.edges).toEqual([]);
    expect(data.sessions[0].board.groups).toEqual([]);
    expect(data.sessions[0].board.board.title).toBe('新白板');
  });

  it('recovers from the latest local backup when primary session storage is corrupted', () => {
    const backup = {
      sessions: [{
        id: 'session_backup',
        title: '恢复的白板',
        board: boardWithOneNode(),
        createdAt: 1,
        updatedAt: 2,
      }],
      activeId: 'session_backup',
    };
    localStorage.setItem('agentboard.sessions', '{broken');
    localStorage.setItem('agentboard.sessions.backup', JSON.stringify(backup));

    const data = loadSessions(emptyBoard);

    expect(data.activeId).toBe('session_backup');
    expect(data.recovery?.source).toBe('backup');
    expect(data.sessions[0].board.nodes[0].title).toBe('只存在本机');
  });

  it('loads persisted transaction history for undo and redo after refresh', () => {
    const currentBoard = boardWithOneNode();
    const previousBoard = { ...emptyBoard, board: { ...emptyBoard.board, title: '之前版本' } };
    const nextBoard = { ...currentBoard, board: { ...currentBoard.board, title: '重做版本' } };
    localStorage.setItem('agentboard.sessions', JSON.stringify({
      sessions: [{
        id: 'session_history',
        title: '本地历史',
        board: currentBoard,
        history: { past: [previousBoard], future: [nextBoard] },
        createdAt: 1,
        updatedAt: 2,
      }],
      activeId: 'session_history',
    }));

    const data = loadSessions(emptyBoard);

    expect(data.sessions[0].history?.past[0].board.title).toBe('之前版本');
    expect(data.sessions[0].history?.future[0].board.title).toBe('重做版本');
  });

  it('keeps existing history isolated in browser localStorage only', () => {
    const localSession = {
      sessions: [
        {
          id: 'session_local_history',
          title: '本地历史',
          board: boardWithOneNode(),
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      activeId: 'session_local_history',
    };

    localStorage.setItem('agentboard.sessions', JSON.stringify(localSession));

    const data = loadSessions(emptyBoard);

    expect(data.activeId).toBe('session_local_history');
    expect(data.sessions[0].board.nodes).toHaveLength(1);
    expect(data.sessions[0].board.nodes[0].title).toBe('只存在本机');
  });
});
