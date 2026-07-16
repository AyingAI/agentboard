import type { BoardDSL, BoardSession } from './types/dsl';
import type { AgentConfig } from './types/dsl';

const SESSIONS_KEY = 'agentboard.sessions';
const OLD_BOARD_KEY = 'agentboard.phase1.board';
const CONFIG_KEY = 'agentboard.config';
const SESSIONS_BACKUP_KEY = 'agentboard.sessions.backup';

export type StorageRecovery = {
  source: 'backup';
  message: string;
};

interface SessionsData {
  sessions: BoardSession[];
  activeId: string;
  recovery?: StorageRecovery;
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
    // Clear old key after migration
    localStorage.removeItem(OLD_BOARD_KEY);
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
  const raw = localStorage.getItem(SESSIONS_KEY);
  if (raw) {
    try {
      const data = JSON.parse(raw) as SessionsData;
      if (data.sessions?.length > 0 && data.activeId) return data;
    } catch {
      const backupRaw = localStorage.getItem(SESSIONS_BACKUP_KEY);
      if (backupRaw) {
        try {
          const backup = JSON.parse(backupRaw) as SessionsData;
          if (backup.sessions?.length > 0 && backup.activeId) {
            return {
              ...backup,
              recovery: { source: 'backup', message: '主存储损坏，已从最近一次本地备份恢复。' },
            };
          }
        } catch {
          // Both copies are invalid; continue to migration or a fresh board.
        }
      }
    }
  }

  // Try migration from old format
  const migrated = migrateOldBoard();
  if (migrated) {
    const data: SessionsData = { sessions: [migrated], activeId: migrated.id };
    saveSessions(data);
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
  saveSessions(data);
  return data;
}

export function saveSessions(data: SessionsData): void {
  const current = localStorage.getItem(SESSIONS_KEY);
  if (current) localStorage.setItem(SESSIONS_BACKUP_KEY, current);
  const { recovery: _recovery, ...persisted } = data;
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(persisted));
}

export function clearSessionsStorage(): void {
  localStorage.removeItem(SESSIONS_KEY);
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
