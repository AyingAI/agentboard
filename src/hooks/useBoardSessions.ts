import { useCallback, useState } from 'react';
import type { ActivityEntry, BoardDSL, BoardHistory, BoardSession, RunState } from '../types/dsl';
import { emptyBoard } from '../data/initialBoard';
import { loadSessions, saveSessions } from '../storage';

function makeId(): string {
  return `session_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function newSession(board: BoardDSL): BoardSession {
  return {
    id: makeId(),
    title: board.board.title || '新白板',
    board,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function useBoardSessions() {
  const [data, setData] = useState(() => loadSessions(emptyBoard));

  const sessions = data.sessions;
  const activeId = data.activeId;
  const activeSession = sessions.find((s) => s.id === activeId) ?? sessions[0];
  const recovery = data.recovery;

  const persist = useCallback((next: typeof data) => {
    setData(next);
    saveSessions(next);
  }, []);

  const createSession = useCallback(() => {
    const freshBoard = JSON.parse(JSON.stringify(emptyBoard)) as BoardDSL;
    // Auto-name with sequential number
    const existing = data.sessions.filter((s) => s.title.startsWith('白板'));
    const num = existing.length + 1;
    freshBoard.board.title = `白板 ${num}`;
    const session = newSession(freshBoard);
    persist({
      sessions: [...data.sessions, session],
      activeId: session.id,
    });
  }, [data, persist]);

  const createSessionFromBoard = useCallback((board: BoardDSL, title?: string) => {
    const importedBoard = structuredClone(board);
    if (title?.trim()) importedBoard.board.title = title.trim();
    const session = newSession(importedBoard);
    persist({
      sessions: [...data.sessions, session],
      activeId: session.id,
    });
    return session.id;
  }, [data, persist]);

  const dismissRecovery = useCallback(() => {
    if (!data.recovery) return;
    const { recovery: _recovery, ...next } = data;
    persist(next);
  }, [data, persist]);

  const switchSession = useCallback(
    (id: string) => {
      if (data.sessions.find((s) => s.id === id)) {
        persist({ ...data, activeId: id });
      }
    },
    [data, persist],
  );

  const renameSession = useCallback(
    (id: string, title: string) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      persist({
        sessions: data.sessions.map((s) =>
          s.id === id ? { ...s, title: trimmed, updatedAt: Date.now() } : s,
        ),
        activeId: data.activeId,
      });
    },
    [data, persist],
  );

  const deleteSession = useCallback(
    (id: string) => {
      if (data.sessions.length <= 1) return; // keep at least one
      const next = {
        sessions: data.sessions.filter((s) => s.id !== id),
        activeId: data.activeId === id ? data.sessions.find((s) => s.id !== id)!.id : data.activeId,
      };
      persist(next);
    },
    [data, persist],
  );

  const updateActiveBoard = useCallback(
    (board: BoardDSL, history?: BoardHistory) => {
      persist({
        sessions: data.sessions.map((s) =>
          s.id === data.activeId ? {
            ...s,
            board,
            history: history ?? s.history,
            updatedAt: Date.now(),
          } : s,
        ),
        activeId: data.activeId,
      });
    },
    [data, persist],
  );

  const resetBoard = useCallback((history?: BoardHistory) => {
    const fresh = JSON.parse(JSON.stringify(emptyBoard)) as BoardDSL;
    fresh.board.title = activeSession.title;
    updateActiveBoard(fresh, history);
  }, [activeSession?.title, updateActiveBoard]);

  const updateActiveAgentState = useCallback(
    (activities: ActivityEntry[], runs: Record<string, RunState>) => {
      persist({
        sessions: data.sessions.map((s) =>
          s.id === data.activeId ? { ...s, activities, runs } : s,
        ),
        activeId: data.activeId,
      });
    },
    [data, persist],
  );

  return {
    sessions,
    activeId,
    activeSession,
    recovery,
    createSession,
    createSessionFromBoard,
    dismissRecovery,
    switchSession,
    renameSession,
    deleteSession,
    updateActiveBoard,
    updateActiveAgentState,
    resetBoard,
  };
}
