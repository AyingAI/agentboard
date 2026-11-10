import type { BoardDSL, BoardNode } from '../types/dsl';

export const EXPLORATIONS = {
  research: {
    label: '选题研究',
    title: '研究一个选题',
    description: '把资料铺开，找到自己的切入点和提纲。',
    question: '这次想讲什么？',
    placeholder: '例如：老厂房改造后，谁真正用上了这些空间？',
    output: '选题提纲',
    sections: ['暂定角度', '素材与出处', '还要核实什么'],
  },
  experience: {
    label: '活动策划',
    title: '策划一次活动或旅行',
    description: '整理地点、故事和时间安排，形成一份体验方案。',
    question: '想为谁安排什么活动或旅行？',
    placeholder: '例如：为建筑史初学者策划一场 90 分钟的老厂房探访',
    output: '体验方案',
    sections: ['候选主题与取舍', '体验与资料出处', '待核实事项'],
  },
} as const;

export type ExplorationKind = keyof typeof EXPLORATIONS;
export interface Exploration {
  kind: ExplorationKind;
  example?: boolean;
  resumeId?: string;
}
const META = 'agentboard.exploration';

export function readExploration(board: BoardDSL): Exploration | null {
  const value = board.metadata[META] as Partial<Exploration> | null | undefined;
  if (value?.kind !== 'research' && value?.kind !== 'experience') return null;
  return {
    kind: value.kind,
    example: value.example === true,
    resumeId: board.nodes.find(node => node.id === value.resumeId)?.id,
  };
}

export function setExploration(board: BoardDSL, exploration: Exploration): BoardDSL {
  return { ...board, metadata: { ...board.metadata, [META]: exploration } };
}

export function sourceLink(value: string): string | null {
  if (!/^https?:\/\/[^\s]+$/i.test(value)) return null;
  try {
    const url = new URL(value);
    return url.username || url.password ? null : url.href;
  } catch {
    return null;
  }
}

// Keep source text in the editable card body so older boards and Agent contexts
// carry the same citation without introducing a second copy of the content.
export function splitMaterial(body: string) {
  const match = /(?:^|\n)来源：([^\s]+)\s*$/.exec(body);
  const url = match ? sourceLink(match[1]) : null;
  return { text: match && url ? body.slice(0, match.index).trimEnd() : body, url };
}

function card(id: string, title: string, body: string, tag: string, x: number, y: number): BoardNode {
  return { id, title, body, x, y, width: 300, height: 130, type: 'card', tags: [tag], createdBy: 'user' };
}

export function materialCard(id: string, value: string, title: string, source: string, x: number, y: number) {
  const text = value.trim();
  const pastedLink = sourceLink(text);
  const url = sourceLink(source.trim()) ?? pastedLink;
  const excerpt = pastedLink && url === pastedLink ? '' : text;
  const label = title.trim() || (excerpt ? excerpt.split('\n')[0].slice(0, 42) : url ? new URL(url).hostname : '资料');
  return card(id, label, [excerpt, url && `来源：${url}`].filter(Boolean).join('\n\n'), 'evidence', x, y);
}

const EXAMPLES = {
  research: {
    title: '老厂房改造后，谁真正用上了这些空间？',
    material: ['店主采访', '店主认为，咖啡店开业后周末客流增加。访谈样本只包含一家店。'],
    contrast: ['社区居民的回忆', '一位居民喜欢这里以前可以自由休息的广场，希望保留不消费也能停留的空间。'],
    angle: ['从客流转向公共性', '从「有没有吸引人」追到「哪些人能留下来」。这仍是选题假设。'],
    open: ['补一个反例', '找一个改造后仍保有公共活动的案例，核对使用人群与规则。'],
  },
  experience: {
    title: '给建筑史初学者策划 90 分钟的老厂房探访',
    material: ['候选体验 · 看厂房结构', '从屋架、采光和原来的生产动线入手，找几个能边走边观察的细节。'],
    contrast: ['候选体验 · 听工人的一天', '围绕交接班和休息空间串起一段故事，用口述资料补充场地细节。'],
    angle: ['先试「从空间读工作」', '把两个方向串在一起。先观察建筑，再用一个工人的故事解释空间的用途。'],
    open: ['核实雨天备选', '确认哪些空间可进入、能否容纳小组，以及下雨时如何保留核心体验。'],
  },
} as const;

export function createExplorationBoard(kind: ExplorationKind, question: string, firstMaterial = '', example = false): BoardDSL {
  const sample = EXAMPLES[kind];
  const title = example ? sample.title : question.trim();
  const nodes = [card('question', title, example ? '以下内容为演示资料，可打开卡片查看，也可以添加自己的线索。' : '', 'question', 64, 68)];
  if (example) {
    nodes.push(
      card('material-a', sample.material[0], sample.material[1], 'evidence', 64, 245),
      card('material-b', sample.contrast[0], sample.contrast[1], 'evidence', 64, 423),
      card('direction', sample.angle[0], sample.angle[1], 'assumption', 442, 245),
      card('open-question', sample.open[0], sample.open[1], 'action', 442, 423),
    );
    if (kind === 'research') nodes.push(card('outline', '初步提纲', '开头呈现店主和居民的不同感受。\n解释客流和公共空间的区别。\n用补访或对比案例验证暂定角度。', 'output', 820, 245));
  } else if (firstMaterial.trim()) {
    nodes.push(materialCard('material-a', firstMaterial, '', '', 64, 245));
  }
  return setExploration({
    version: '0.1',
    board: { id: `exploration_${Date.now()}_${Math.random().toString(16).slice(2)}`, title, viewport: { x: 0, y: 0, zoom: 1 } },
    nodes,
    groups: [],
    edges: example ? [
      { id: 'a-direction', from: 'material-a', to: 'direction', type: 'line', label: '提供线索' },
      { id: 'b-direction', from: 'material-b', to: 'direction', type: 'line', label: '补充视角' },
      { id: 'direction-open', from: 'direction', to: 'open-question', label: '下一步' },
    ] : [],
    metadata: {},
  }, { kind, example, resumeId: example ? 'open-question' : undefined });
}

function markdownText(value: string) {
  return value.replace(/[\\`*_[\]<>]/g, '\\$&');
}

export function explorationDraft(board: BoardDSL, kind: ExplorationKind, selectedIds: string[]) {
  const task = EXPLORATIONS[kind];
  const selectedSet = new Set(selectedIds);
  const linkedIds = new Set(board.edges.flatMap(edge => selectedSet.has(edge.from) ? [edge.to] : selectedSet.has(edge.to) ? [edge.from] : []));
  const selected = selectedIds.length ? board.nodes.filter(node => selectedSet.has(node.id) || (linkedIds.has(node.id) && node.tags?.includes('evidence'))) : board.nodes;
  const subject = board.nodes.find(node => node.tags?.includes('question'));
  const directions: BoardNode[] = [];
  const material: BoardNode[] = [];
  const open: BoardNode[] = [];
  const outline: BoardNode[] = [];
  for (const node of selected) {
    if (node === subject) continue;
    if (node.tags?.some(tag => ['question', 'risk', 'action'].includes(tag))) open.push(node);
    else if (kind === 'research' && node.tags?.includes('output')) outline.push(node);
    else if (node.tags?.some(tag => ['assumption', 'decision', 'output'].includes(tag))) directions.push(node);
    else material.push(node);
  }

  function list(nodes: BoardNode[]) {
    if (!nodes.length) return '待补充';
    return nodes.map(node => {
      const { text, url } = splitMaterial(node.body);
      const link = url ? `（来源：<${url.replace(/[<>]/g, char => encodeURIComponent(char))}>）` : '';
      const title = `- ${markdownText(node.title.replace(/\s*\n\s*/g, ' '))}${link}`;
      return text ? `${title}\n${text.split('\n').map(line => `  ${markdownText(line)}`).join('\n')}` : title;
    }).join('\n\n');
  }

  return [
    `# ${markdownText(board.board.title.replace(/\s*\n\s*/g, ' '))}`,
    readExploration(board)?.example ? '> 示例草稿。内容为演示资料。' : '',
    subject?.body && !readExploration(board)?.example ? `## ${kind === 'research' ? '研究问题' : '受众与目标'}\n\n${markdownText(subject.body)}` : '',
    `## ${task.sections[0]}\n\n${list(directions)}`,
    `## ${task.sections[1]}\n\n${list(material)}`,
    kind === 'research' ? `## 提纲\n\n${list(outline)}` : '',
    `## ${task.sections[2]}\n\n${list(open)}`,
  ].filter(Boolean).join('\n\n') + '\n';
}
