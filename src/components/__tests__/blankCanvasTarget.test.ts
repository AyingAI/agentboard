import { describe, it, expect } from 'vitest';
import { isBlankCanvasTarget, normalizeEdgeLabel, offsetEdgePoints } from '../BoardCanvas';

/**
 * 纯逻辑测试：用最小 Element stub 验证 isBlankCanvasTarget 的判定，
 * 不引入 jsdom / testing-library（项目约束：不加新依赖）。
 */
function elementWith(...classes: string[]): Element {
  return { classList: new DOMTokenListStub(classes) } as unknown as Element;
}

class DOMTokenListStub {
  private set: Set<string>;
  constructor(classes: string[]) {
    this.set = new Set(classes);
  }
  contains(token: string): boolean {
    return this.set.has(token);
  }
}

describe('isBlankCanvasTarget', () => {
  it('空白区域应触发创建卡片', () => {
    expect(isBlankCanvasTarget(elementWith('board-canvas'))).toBe(true);
    expect(isBlankCanvasTarget(elementWith('canvas-content'))).toBe(true);
    expect(isBlankCanvasTarget(elementWith('edge-layer'))).toBe(true);
    expect(isBlankCanvasTarget(elementWith('canvas-empty-hint'))).toBe(true);
  });

  it('带额外修饰 class 的画布根仍应触发', () => {
    expect(isBlankCanvasTarget(elementWith('board-canvas', 'space-held', 'panning'))).toBe(true);
  });

  it('节点 / 连接点 / 边线 / edge label / group / 文本不应触发', () => {
    expect(isBlankCanvasTarget(elementWith('board-node'))).toBe(false);
    expect(isBlankCanvasTarget(elementWith('connect-handle'))).toBe(false);
    expect(isBlankCanvasTarget(elementWith('edge-hit-area'))).toBe(false);
    expect(isBlankCanvasTarget(elementWith('edge-line'))).toBe(false);
    expect(isBlankCanvasTarget(elementWith('edge-label'))).toBe(false);
    expect(isBlankCanvasTarget(elementWith('edge-label-input'))).toBe(false);
    expect(isBlankCanvasTarget(elementWith('group-boundary'))).toBe(false);
    expect(isBlankCanvasTarget(elementWith('node-title'))).toBe(false);
    expect(isBlankCanvasTarget(elementWith('node-body'))).toBe(false);
  });

  it('null target 不触发', () => {
    expect(isBlankCanvasTarget(null)).toBe(false);
  });
});

describe('offsetEdgePoints', () => {
  it('为竖向反向边生成横向偏移，避免两条箭头重叠', () => {
    const down = offsetEdgePoints({ x: 100, y: 50 }, { x: 100, y: 150 }, 10);
    const up = offsetEdgePoints({ x: 100, y: 150 }, { x: 100, y: 50 }, 10);

    expect(down.start.x).toBe(90);
    expect(down.end.x).toBe(90);
    expect(up.start.x).toBe(110);
    expect(up.end.x).toBe(110);
  });

  it('amount 为 0 时保持原线段不偏移', () => {
    const start = { x: 10, y: 20 };
    const end = { x: 110, y: 20 };

    expect(offsetEdgePoints(start, end, 0)).toEqual({ start, end });
  });
});

describe('normalizeEdgeLabel', () => {
  it('trim 普通文本后返回', () => {
    expect(normalizeEdgeLabel('  hello  ')).toBe('hello');
    expect(normalizeEdgeLabel('world')).toBe('world');
  });

  it('纯空格字符串返回 undefined（清除 label）', () => {
    expect(normalizeEdgeLabel('')).toBeUndefined();
    expect(normalizeEdgeLabel('   ')).toBeUndefined();
    expect(normalizeEdgeLabel('\t\n')).toBeUndefined();
  });

  it('中间有内容的字符串不会变成 undefined', () => {
    expect(normalizeEdgeLabel(' a ')).toBe('a');
  });
});
