import type { BoardNode } from '../types/dsl';

const CHINESE_COUNT: Record<string, number> = {
  一: 1,
  二: 2,
  两: 2,
  三: 3,
};

export function inferRequestedDeepDiveNodeCount(request: string): number | null {
  const digitMatch = request.match(/(?:用|分成|拆成|生成|新增|创建)?\s*([1-3])\s*个(?:信息)?节点/);
  if (digitMatch) return Number(digitMatch[1]);

  const chineseMatch = request.match(/(?:用|分成|拆成|生成|新增|创建)?\s*([一二两三])\s*个(?:信息)?节点/);
  if (chineseMatch) return CHINESE_COUNT[chineseMatch[1]] ?? null;

  return null;
}

export function buildNodeDeepDivePrompt(node: BoardNode, request: string): string {
  if (node.visual) return [
    '围绕当前视觉继续共创。自由选择最有帮助的内容与交互，不受固定卡片数量或组件类型限制。',
    `目标节点 ID: ${node.id}`,
    `目标节点标题: ${node.title}`,
    `用户需求: ${request}`,
    '从上下文读取完整 visual.html 与当前 visual.state。优先更新已有视觉，保留用户交互状态与无关内容；需要新表达时可以新增视觉。',
  ].join('\n');
  const requestedCount = inferRequestedDeepDiveNodeCount(request);
  const countInstruction = requestedCount
    ? [
      `- 我明确要求 ${requestedCount} 个节点时，必须返回 ${requestedCount} 个 add_node 操作；不要把多个角度合并成一个综合节点。`,
      '- 为了不挤占操作数预算，不要返回 add_edge；AgentBoard 会在本地自动把每个新增节点用普通 line 连回目标节点。',
    ]
    : [
      '- 根据用户目标完成有价值的扩展，自行决定节点数量，也可以创建开放交互视觉。',
      '- 不要返回 add_edge；AgentBoard 会在本地自动把每个新增节点用普通 line 连回目标节点。',
    ];

  return [
    '请基于当前选中的单个节点做深度研究和扩展，不要把整张白板重新生成或重排。',
    '',
    `目标节点 ID: ${node.id}`,
    `目标节点标题: ${node.title}`,
    `目标节点正文: ${node.body || '(空)'}`,
    `目标节点标签: ${node.tags?.join(', ') || '(无)'}`,
    '',
    `我的深挖需求: ${request}`,
    '',
    '输出要求:',
    ...countInstruction,
    '- 如果我要求「分别」讲述多个方面，每个方面应拆成独立节点，不要合并到一张卡里。',
    '- 新增节点放在目标节点右侧或下方附近，保持原有白板布局稳定。',
    '- 如果只是补充或修正目标节点内容，使用 update_node，不要重复创建同义节点。',
    '- 除非我明确要求整理全图，否则不要使用 layout scope "all"。',
    '- 如果信息不足，先提出关键问题、假设或待验证点，不要硬编。',
  ].join('\n');
}
