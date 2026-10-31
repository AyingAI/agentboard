export interface AvailableCli {
  id: string;
  name: string;
  available: boolean;
  version?: string;
}

export interface StarterTask {
  id: string;
  title: string;
  description: string;
  prompt: string;
}

export const STARTER_TASKS: StarterTask[] = [
  {
    id: 'product',
    title: '探索产品想法',
    description: '把想法展开成可以比较、试验的内容',
    prompt: '我想探索一个产品想法。请先了解我的目标，然后自由选择最有帮助的表达：可以是可操作的方案对比、可试用的原型，也可以是结构图。我的想法是：',
  },
  {
    id: 'architecture',
    title: '看懂一个系统',
    description: '让机制、数据流和关联变得可见',
    prompt: '请用一个可以操作的视觉，带我理解浏览器缓存如何工作。表达形式由你决定，最好能改变条件并观察不同路径，再让我基于图中细节继续追问。',
  },
  {
    id: 'delivery',
    title: '试着改变条件',
    description: '用交互推演理解变化与取舍',
    prompt: '帮我理解复利与定期投入的关系。请自由创造一个可交互的解释器，让我调整投入、年限和假设收益率，观察差异。清楚标明这是数学模拟，不是收益预测；保存我的参数，方便继续讨论。',
  },
];

export function availableClis(clis: AvailableCli[]) {
  return clis.filter((cli) => cli.available);
}

export function recommendedCli(clis: AvailableCli[]) {
  return availableClis(clis)[0] ?? null;
}
