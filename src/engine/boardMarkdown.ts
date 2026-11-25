import type { BoardDSL, BoardNode } from '../types/dsl';
import { extractMaterialUrl, readBoardBrief } from './boardBrief';

const TAG_ZH: Record<string, string> = {
  concept: '概念',
  module: '模块',
  actor: '角色',
  input: '输入',
  output: '产出',
  decision: '决策',
  risk: '风险',
  question: '待确认',
  assumption: '假设',
  metric: '指标',
  evidence: '证据',
  action: '行动',
};

function sanitizeHeading(text: string): string {
  return text.replace(/\s*\n\s*/g, ' ').trim() || '未命名卡片';
}

function formatVisualStateSummary(node: BoardNode): string {
  const state = node.visual?.state;
  if (!state || typeof state !== 'object') return '';
  const entries = Object.entries(state).filter(([key, value]) => key !== '_inputs' && value !== undefined && value !== null && value !== '');
  const fallbackInputs = entries.length === 0 && state._inputs && typeof state._inputs === 'object'
    ? Object.entries(state._inputs as Record<string, unknown>).filter(([, value]) => value !== undefined && value !== null && value !== '')
    : [];
  const pairs = (entries.length ? entries : fallbackInputs)
    .slice(0, 8)
    .map(([key, value]) => `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`);
  return pairs.length ? `> 交互状态：${pairs.join(' · ')}` : '';
}

function formatNodeSection(node: BoardNode, headingLevel: '##' | '###'): string {
  const tag = node.tags?.find(t => TAG_ZH[t]);
  const badge = tag ? `[${TAG_ZH[tag]}] ` : node.type === 'note' ? '[便签] ' : '';
  const parts = [`${headingLevel} ${badge}${sanitizeHeading(node.title)}`];
  const { text, url } = extractMaterialUrl(node.body);
  if (text.trim()) parts.push(text.trim());
  if (url) parts.push(`- 来源：<${url}>`);
  const visualSummary = formatVisualStateSummary(node);
  if (visualSummary) parts.push(visualSummary);
  return parts.join('\n\n');
}

export function synthesizeBoardMarkdown(board: BoardDSL, selectedIds?: string[]): string {
  const selectedSet = selectedIds?.length ? new Set(selectedIds) : null;
  const targetNodes = selectedSet
    ? board.nodes.filter(node => selectedSet.has(node.id))
    : board.nodes;
  const targetIds = new Set(targetNodes.map(node => node.id));
  const nodeById = new Map(targetNodes.map(node => [node.id, node]));

  const lines: string[] = [`# ${sanitizeHeading(board.board.title)}`];
  const brief = readBoardBrief(board);
  if (brief.goal || brief.constraints) {
    const metaLines: string[] = [];
    if (brief.goal) metaLines.push(`> **目标**：${brief.goal.replace(/\n+/g, ' ')}`);
    if (brief.constraints) metaLines.push(`> **约束与前提**：${brief.constraints.replace(/\n+/g, '；')}`);
    lines.push(metaLines.join('\n'));
  }

  if (!targetNodes.length) {
    lines.push('_当前范围内暂无卡片内容。_');
    return `${lines.join('\n\n')}\n`;
  }

  const groupedIds = new Set<string>();
  for (const group of board.groups) {
    const members = group.nodeIds
      .map(id => nodeById.get(id))
      .filter((node): node is BoardNode => Boolean(node));
    if (!members.length) continue;
    lines.push(`## ${sanitizeHeading(group.title)}`);
    for (const member of members) {
      groupedIds.add(member.id);
      lines.push(formatNodeSection(member, '###'));
    }
  }

  const ungrouped = targetNodes
    .filter(node => !groupedIds.has(node.id))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  if (ungrouped.length) {
    if (groupedIds.size > 0) lines.push('## 其他内容');
    for (const node of ungrouped) {
      lines.push(formatNodeSection(node, groupedIds.size > 0 ? '###' : '##'));
    }
  }

  const relevantEdges = board.edges.filter(edge => targetIds.has(edge.from) && targetIds.has(edge.to));
  if (relevantEdges.length) {
    const edgeLines = relevantEdges.map(edge => {
      const fromTitle = sanitizeHeading(nodeById.get(edge.from)?.title ?? edge.from);
      const toTitle = sanitizeHeading(nodeById.get(edge.to)?.title ?? edge.to);
      const connector = edge.type === 'line' ? '—' : '→';
      return `- ${fromTitle} ${connector} ${toTitle}${edge.label ? `（${edge.label}）` : ''}`;
    });
    lines.push(`## 关键关联\n\n${edgeLines.join('\n')}`);
  }

  return `${lines.join('\n\n')}\n`;
}

export function markdownExportFilename(title: string): string {
  const safeTitle = title.trim().replace(/[\\/:*?"<>|\s]+/g, '-').replace(/-+/g, '-').slice(0, 60) || 'board';
  return `${safeTitle}.md`;
}
