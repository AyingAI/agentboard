import { isDefaultBoardTitle } from '../data/initialBoard';
import type { BoardDSL } from '../types/dsl';

function titleCandidate(value: unknown): string | undefined {
  if (typeof value !== 'string') return;
  const line = value.trim().split(/\r?\n/, 1)[0].replace(/\s+/g, ' ').trim();
  if (!line || isDefaultBoardTitle(line) || /^(新卡片|无标题|概览|总结|untitled|new card|overview)$/i.test(line)) return;
  return Array.from(line).slice(0, 48).join('').trimEnd();
}

export function firstBoardTitle(before: BoardDSL, after: BoardDSL, suggestion: unknown, request?: string): string | undefined {
  if (!isDefaultBoardTitle(before.board.title)) return;

  const previousNodes = new Map(before.nodes.map(node => [node.id, node]));
  const writtenNodes = after.nodes.filter(node => {
    const previous = previousNodes.get(node.id);
    return (node.title !== previous?.title || node.body !== previous?.body || node.visual?.html !== previous?.visual?.html)
      && (node.body.trim() || node.visual || titleCandidate(node.title));
  });
  if (!writtenNodes.length) return;

  const question = writtenNodes.find(node => node.tags?.includes('question') && titleCandidate(node.title));
  const firstTitled = writtenNodes.find(node => titleCandidate(node.title));
  const firstWithBody = writtenNodes.find(node => node.body.trim());
  return titleCandidate(suggestion) ?? titleCandidate((question ?? firstTitled)?.title)
    ?? titleCandidate(firstWithBody?.body) ?? titleCandidate(request);
}
