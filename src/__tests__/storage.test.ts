import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyBoard } from '../data/initialBoard';
import { loadSessions, saveSessions } from '../storage';
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

  it.each([null, '{}', '{"sessions":[null],"activeId":"bad"}'])('recovers a backup when the primary is missing or structurally invalid: %s', raw => {
    const backup = { sessions: [{ id: 's', title: '草稿', board: boardWithOneNode(), createdAt: 1, updatedAt: 1 }], activeId: 's' };
    if (raw) localStorage.setItem('agentboard.sessions', raw);
    localStorage.setItem('agentboard.sessions.backup', JSON.stringify(backup));
    expect(loadSessions(emptyBoard)).toMatchObject({ ...backup, recovery: { source: 'backup' } });
  });

  it('preserves the good backup when saving immediately after recovery', () => {
    const backup = { sessions: [{ id: 's', title: '本地内容', board: boardWithOneNode(), createdAt: 1, updatedAt: 1 }], activeId: 's' };
    localStorage.setItem('agentboard.sessions', '{broken');
    localStorage.setItem('agentboard.sessions.backup', JSON.stringify(backup));
    const recovered = loadSessions(emptyBoard);
    saveSessions(recovered);
    expect(JSON.parse(localStorage.getItem('agentboard.sessions.backup')!)).toEqual(backup);
    localStorage.setItem('agentboard.sessions', '{broken again');
    expect(loadSessions(emptyBoard).sessions[0].board.nodes[0].title).toBe('只存在本机');
  });

  it('still saves the primary when writing the backup exceeds the storage quota', () => {
    const data = loadSessions(emptyBoard);
    const original = localStorage.setItem.bind(localStorage);
    vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (key.endsWith('.backup')) throw new DOMException('full', 'QuotaExceededError');
      original(key, value);
    });
    data.sessions[0].draft = '下一步讨论';
    expect(() => saveSessions(data)).not.toThrow();
    expect(loadSessions(emptyBoard).sessions[0].draft).toBe('下一步讨论');
  });

  it('opens a usable board with a visible recovery notice when storage is unavailable', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new DOMException('disabled', 'SecurityError'); });
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new DOMException('disabled', 'SecurityError'); });
    expect(loadSessions(emptyBoard)).toMatchObject({ sessions: [{ board: emptyBoard }], recovery: { source: 'unavailable' } });
  });

  it('falls back to an existing session when the stored active id is stale', () => {
    localStorage.setItem('agentboard.sessions', JSON.stringify({ sessions: [{ id: 's', title: '本地内容', board: boardWithOneNode(), createdAt: 1, updatedAt: 1 }], activeId: 'deleted' }));
    expect(loadSessions(emptyBoard).activeId).toBe('s');
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
