import { describe, expect, it } from 'vitest';
import type { BoardNode } from '../../types/dsl';
import { buildNodeDeepDivePrompt, inferRequestedDeepDiveNodeCount } from '../deepDive';

const targetNode: BoardNode = {
  id: 'node_target',
  type: 'card',
  x: 100,
  y: 100,
  width: 240,
  height: 120,
  title: '桂林为何甲天下',
  body: '研究桂林旅行的背景。',
  tags: ['input'],
};

describe('inferRequestedDeepDiveNodeCount', () => {
  it('should detect Chinese and numeric node count requests', () => {
    expect(inferRequestedDeepDiveNodeCount('分别用三个节点来讲述地理、历史、人文')).toBe(3);
    expect(inferRequestedDeepDiveNodeCount('请生成 3 个节点')).toBe(3);
    expect(inferRequestedDeepDiveNodeCount('拆成两个节点')).toBe(2);
  });
});

describe('buildNodeDeepDivePrompt', () => {
  it('should require exactly the requested number of add_node ops without edges', () => {
    const prompt = buildNodeDeepDivePrompt(targetNode, '针对这个，分别用三个节点来讲述地理、历史、人文');

    expect(prompt).toContain('必须返回 3 个 add_node 操作');
    expect(prompt).toContain('不要把多个角度合并成一个综合节点');
    expect(prompt).toContain('不要返回 add_edge');
    expect(prompt).toContain('AgentBoard 会在本地自动把每个新增节点用普通 line 连回目标节点');
    expect(prompt).toContain('每个方面应拆成独立节点');
  });

  it('should keep flexible 1-3 node guidance when no exact count is requested', () => {
    const prompt = buildNodeDeepDivePrompt(targetNode, '补充相关证据');

    expect(prompt).toContain('新增 1-3 个高价值关联节点');
    expect(prompt).toContain('不要返回 add_edge');
    expect(prompt).not.toContain('必须返回 3 个 add_node 操作');
  });
});
