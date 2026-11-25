import type { BoardBrief, BoardDSL, BoardNode } from '../types/dsl';

export const BRIEF_METADATA_KEY = 'agentboard.brief';

export function safeHttpUrl(raw: string): string | null {
  const value = raw.trim();
  if (!/^https?:\/\/[^\s]+$/i.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function readBoardBrief(board: BoardDSL): BoardBrief {
  const raw = board.metadata[BRIEF_METADATA_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const record = raw as Record<string, unknown>;
  const goal = typeof record.goal === 'string' && record.goal.trim() ? record.goal.trim() : undefined;
  const constraints = typeof record.constraints === 'string' && record.constraints.trim() ? record.constraints.trim() : undefined;
  return { ...(goal ? { goal } : {}), ...(constraints ? { constraints } : {}) };
}

export function setBoardBrief(board: BoardDSL, brief: BoardBrief): BoardDSL {
  const goal = brief.goal?.trim();
  const constraints = brief.constraints?.trim();
  const nextMeta = { ...board.metadata };
  if (!goal && !constraints) {
    delete nextMeta[BRIEF_METADATA_KEY];
  } else {
    nextMeta[BRIEF_METADATA_KEY] = {
      ...(goal ? { goal } : {}),
      ...(constraints ? { constraints } : {}),
    };
  }
  return { ...board, metadata: nextMeta };
}

export function formatBoardBriefContext(board: BoardDSL): string {
  const brief = readBoardBrief(board);
  if (!brief.goal && !brief.constraints) return '';
  return `白板目标与核心约束（用户设定的持久上下文，请结合当前指令遵守）：\n${JSON.stringify(brief)}`;
}

export function extractMaterialUrl(body: string): { text: string; url: string | null } {
  const trimmed = body.trim();
  const direct = safeHttpUrl(trimmed);
  if (direct) return { text: '', url: direct };
  const match = /(?:^|\n)来源：([^\s]+)\s*$/.exec(body);
  const url = match ? safeHttpUrl(match[1]) : null;
  return {
    text: match && url ? body.slice(0, match.index).trimEnd() : body,
    url,
  };
}

export function createPastedNode(clipboardText: string, id: string, x: number, y: number): BoardNode | null {
  const trimmed = clipboardText.trim();
  if (!trimmed) return null;

  const url = safeHttpUrl(trimmed);
  if (url) {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return {
      id,
      type: 'card',
      x: Math.round(x),
      y: Math.round(y),
      width: 300,
      height: 120,
      title: `参考链接 · ${hostname}`,
      body: `来源：${url}`,
      tags: ['evidence'],
      createdBy: 'user',
    };
  }

  const lines = trimmed.split(/\r?\n/).map(line => line.trimEnd());
  const nonEmpty = lines.filter(line => line.trim().length > 0);
  const rawFirstLine = lines[0];
  const startsWithList = /^(?:[-*+]|\d+[.)、])\s+/.test(rawFirstLine);
  const firstLine = rawFirstLine.replace(/^#{1,6}\s+/, '').trim();

  let title = '粘贴的笔记';
  let body = trimmed;
  if (!startsWithList && nonEmpty.length > 1 && firstLine.length > 0 && firstLine.length <= 48) {
    title = firstLine;
    body = lines.slice(1).join('\n').trim();
  } else if (!startsWithList && firstLine.length > 0) {
    title = firstLine.length > 32 ? `${firstLine.slice(0, 32)}…` : firstLine;
  }

  return {
    id,
    type: 'card',
    x: Math.round(x),
    y: Math.round(y),
    width: trimmed.length > 260 ? 360 : 320,
    height: 140,
    title,
    body,
    createdBy: 'user',
  };
}
