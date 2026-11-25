import { describe, expect, it } from 'vitest';
import type { BoardDSL } from '../../types/dsl';
import { createPastedNode, extractMaterialUrl, formatBoardBriefContext, readBoardBrief, setBoardBrief } from '../boardBrief';
import { markdownExportFilename, synthesizeBoardMarkdown } from '../boardMarkdown';

function sampleBoard(): BoardDSL {
  return {
    version: '0.1',
    board: { id: 'b1', title: '产品增长策略', viewport: { x: 0, y: 0, zoom: 1 } },
    nodes: [
      {
        id: 'n1',
        type: 'card',
        x: 80,
        y: 80,
        width: 320,
        height: 160,
        title: '核心推演',
        body: '对比不同价格档位的影响。',
        tags: ['concept'],
        visual: { html: '<p>demo</p>', state: { price: 49, conversion: 4, _inputs: { price: '49' } }, height: 300 },
      },
      {
        id: 'n2',
        type: 'note',
        x: 440,
        y: 80,
        width: 280,
        height: 140,
        title: '核心风险',
        body: '用户口头喜欢不代表愿意付费。',
        tags: ['risk'],
      },
      {
        id: 'n3',
        type: 'card',
        x: 80,
        y: 320,
        width: 320,
        height: 140,
        title: '访谈笔记',
        body: '3 位用户希望可自助购买。\n来源：https://example.com/notes',
        tags: ['evidence'],
      },
    ],
    edges: [{ id: 'e1', from: 'n3', to: 'n1', label: '支撑', type: 'arrow' }],
    groups: [{ id: 'g1', title: '核心方案', nodeIds: ['n1', 'n2'] }],
    metadata: {},
  };
}

describe('boardBrief & smart paste', () => {
  it('stores, reads and formats board brief cleanly', () => {
    const base = sampleBoard();
    expect(readBoardBrief(base)).toEqual({});
    expect(formatBoardBriefContext(base)).toBe('');

    const updated = setBoardBrief(base, { goal: '两周内上线 MVP', constraints: '2 人团队' });
    expect(readBoardBrief(updated)).toEqual({ goal: '两周内上线 MVP', constraints: '2 人团队' });
    expect(formatBoardBriefContext(updated)).toContain('两周内上线 MVP');
    expect(formatBoardBriefContext(updated)).toContain('2 人团队');

    const cleared = setBoardBrief(updated, {});
    expect(readBoardBrief(cleared)).toEqual({});
  });

  it('extracts source URLs from standalone links and trailing 来源 lines', () => {
    expect(extractMaterialUrl('https://docs.example.com/guide')).toEqual({
      text: '',
      url: 'https://docs.example.com/guide',
    });
    expect(extractMaterialUrl('重要观察\n来源：https://example.com/post')).toEqual({
      text: '重要观察',
      url: 'https://example.com/post',
    });
    expect(extractMaterialUrl('普通段落')).toEqual({ text: '普通段落', url: null });
  });

  it('creates evidence cards for pasted URLs and structured cards for pasted text', () => {
    const urlNode = createPastedNode('https://www.example.com/article?id=1', 'p1', 100, 200);
    expect(urlNode?.tags).toEqual(['evidence']);
    expect(urlNode?.title).toBe('参考链接 · example.com');
    expect(urlNode?.body).toBe('来源：https://www.example.com/article?id=1');

    const textNode = createPastedNode('# 增长实验想法\n- 优化首屏转化\n- 缩短试用路径', 'p2', 120, 240);
    expect(textNode?.title).toBe('增长实验想法');
    expect(textNode?.body).toBe('- 优化首屏转化\n- 缩短试用路径');
    expect(createPastedNode('   \n  ', 'p3', 0, 0)).toBeNull();
  });

  it.each([
    '- [ ] 核实访谈\n- [ ] 整理结论',
    '1. 核实访谈\n2. 整理结论',
    '+ 核实访谈\n+ 整理结论',
  ])('keeps every item when pasted text starts with a list', body => {
    expect(createPastedNode(body, 'list', 10, 20)).toMatchObject({ title: '粘贴的笔记', body });
  });
});

describe('synthesizeBoardMarkdown', () => {
  it('synthesizes brief, groups, tags, visual state, source links and edges', () => {
    const board = setBoardBrief(sampleBoard(), { goal: '验证定价', constraints: '不雇佣销售' });
    const md = synthesizeBoardMarkdown(board);

    expect(md).toContain('# 产品增长策略');
    expect(md).toContain('> **目标**：验证定价');
    expect(md).toContain('> **约束与前提**：不雇佣销售');
    expect(md).toContain('## 核心方案');
    expect(md).toContain('### [概念] 核心推演');
    expect(md).toContain('> 交互状态：price=49 · conversion=4');
    expect(md).toContain('### [风险] 核心风险');
    expect(md).toContain('## 其他内容');
    expect(md).toContain('- 来源：<https://example.com/notes>');
    expect(md).toContain('## 关键关联');
    expect(md).toContain('- 访谈笔记 → 核心推演（支撑）');
  });

  it('supports synthesizing only a selected subset of nodes', () => {
    const md = synthesizeBoardMarkdown(sampleBoard(), ['n2']);
    expect(md).toContain('核心风险');
    expect(md).not.toContain('核心推演');
    expect(md).not.toContain('访谈笔记');
    expect(markdownExportFilename('产品 / 增长策略')).toBe('产品-增长策略.md');
  });
});
