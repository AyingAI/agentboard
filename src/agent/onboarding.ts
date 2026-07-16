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
    title: '拆解产品想法',
    description: '从用户、问题、方案、风险和验证方式开始',
    prompt: '帮我把一个产品想法拆成用户、核心问题、解决方案、关键假设、主要风险和验证方式。先创建一张便于继续讨论的结构化白板。',
  },
  {
    id: 'architecture',
    title: '梳理技术架构',
    description: '整理模块、数据流、依赖和技术风险',
    prompt: '帮我梳理一个技术系统的架构，先创建模块、数据流、外部依赖和主要技术风险的结构化白板，保留后续逐个模块深挖的空间。',
  },
  {
    id: 'delivery',
    title: '生成执行计划',
    description: '形成阶段、任务、依赖、风险和交付物',
    prompt: '帮我把一个需求转成可执行计划，先创建阶段、关键任务、依赖关系、风险和交付物的结构化白板。',
  },
];

export function availableClis(clis: AvailableCli[]) {
  return clis.filter((cli) => cli.available);
}

export function recommendedCli(clis: AvailableCli[]) {
  return availableClis(clis)[0] ?? null;
}
