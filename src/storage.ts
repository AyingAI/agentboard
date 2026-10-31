import type { BoardDSL, BoardSession } from './types/dsl';
import type { AgentConfig } from './types/dsl';
import { validateBoard } from './engine/validation';
import { boardVisualErrors } from './visuals/contract';
import { applyVisualPatch } from './visuals/patch';

const SESSIONS_KEY = 'agentboard.sessions';
const OLD_BOARD_KEY = 'agentboard.phase1.board';
const CONFIG_KEY = 'agentboard.config';
const SESSIONS_BACKUP_KEY = 'agentboard.sessions.backup';

export type StorageRecovery = {
  source: 'backup' | 'unavailable' | 'invalid';
  message: string;
};

interface SessionsData {
  sessions: BoardSession[];
  activeId: string;
  recovery?: StorageRecovery;
}

function validBoard(value: BoardDSL): boolean {
  return validateBoard(value).length === 0 && boardVisualErrors(value).length === 0;
}

function readSessions(raw: string | null): SessionsData | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as SessionsData;
    if (!data || !Array.isArray(data.sessions) || !data.sessions.length) return null;
    const ids = new Set<string>();
    for (const session of data.sessions) {
      if (!session || typeof session.id !== 'string' || !session.id || ids.has(session.id) || typeof session.title !== 'string' || !validBoard(session.board)) return null;
      ids.add(session.id);
      // A damaged undo entry must not break an otherwise usable board.
      if (session.history) session.history = {
        past: Array.isArray(session.history.past) ? session.history.past.filter(validBoard) : [],
        future: Array.isArray(session.history.future) ? session.history.future.filter(validBoard) : [],
      };
      if (!Array.isArray(session.activities)) delete session.activities;
      if (!session.runs || typeof session.runs !== 'object' || Array.isArray(session.runs)) delete session.runs;
      if (session.runs) {
        session.runs = Object.fromEntries(Object.entries(session.runs).filter(([, run]) => run && typeof run.id === 'string' && typeof run.originalUserMessage === 'string' && Array.isArray(run.events)).map(([id, run]) => {
          const proposal = run.pendingProposal;
          if (proposal) {
            try {
              if (typeof proposal.id !== 'string' || typeof proposal.activityId !== 'string' || !validBoard(proposal.baseBoard) || !applyVisualPatch(proposal.baseBoard, proposal.patch).result.applied) delete run.pendingProposal;
            } catch { delete run.pendingProposal; }
          }
          return [id, run];
        }));
      }
      if (typeof session.draft !== 'string') delete session.draft;
    }
    return { sessions: data.sessions, activeId: ids.has(data.activeId) ? data.activeId : data.sessions[0].id };
  } catch { return null; }
}

function readStorage(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function makeSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

// ── Migration from old single-board format ──

function migrateOldBoard(): BoardSession | null {
  try {
    const raw = localStorage.getItem(OLD_BOARD_KEY);
    if (!raw) return null;
    const board = JSON.parse(raw) as BoardDSL;
    if (!validBoard(board)) return null;
    return {
      id: makeSessionId(),
      title: board.board.title || '已导入的白板',
      board,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

// ── Session storage ──

export function loadSessions(fallbackBoard: BoardDSL): SessionsData {
  const raw = readStorage(SESSIONS_KEY);
  const primary = readSessions(raw);
  if (primary) return primary;
  const backup = readSessions(readStorage(SESSIONS_BACKUP_KEY));
  if (backup) return { ...backup, recovery: { source: 'backup', message: '主存储缺失或损坏，已从最近一次本地备份恢复，请先导出白板。' } };

  // Try migration from old format
  const migrated = migrateOldBoard();
  if (migrated) {
    const data: SessionsData = { sessions: [migrated], activeId: migrated.id };
    try {
      saveSessions(data);
      localStorage.removeItem(OLD_BOARD_KEY);
    } catch {
      data.recovery = { source: 'unavailable', message: '本地存储不可用，已读取旧白板，请先导出，避免刷新后丢失修改。' };
    }
    return data;
  }

  // Fresh start
  const session: BoardSession = {
    id: makeSessionId(),
    title: fallbackBoard.board.title || '新白板',
    board: fallbackBoard,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const data: SessionsData = { sessions: [session], activeId: session.id };
  if (raw) data.recovery = { source: 'invalid', message: '本地白板数据损坏，未找到可用备份。已打开空白白板，可通过导入文件恢复。' };
  try { saveSessions(data); }
  catch { data.recovery = { source: 'unavailable', message: '本地存储不可用，当前修改仅保留在页面中，请及时导出白板。' }; }
  return data;
}

export function saveSessions(data: SessionsData): void {
  const current = readStorage(SESSIONS_KEY);
  // Never replace a good backup with the corrupt primary we just recovered from.
  // A full backup must not prevent a smaller primary write from succeeding.
  if (readSessions(current)) {
    try { localStorage.setItem(SESSIONS_BACKUP_KEY, current!); } catch { /* Keep the previous backup and still try saving. */ }
  }
  const { recovery: _recovery, ...persisted } = data;
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(persisted));
}

export function clearSessionsStorage(): void {
  localStorage.removeItem(SESSIONS_KEY);
  localStorage.removeItem(SESSIONS_BACKUP_KEY);
}

// ── Agent config persistence ──

const DEFAULT_CONFIG: AgentConfig = {
  provider: 'local-cli',
};

export function loadAgentConfig(): AgentConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return DEFAULT_CONFIG;
    return JSON.parse(raw) as AgentConfig;
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveAgentConfig(config: AgentConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}
