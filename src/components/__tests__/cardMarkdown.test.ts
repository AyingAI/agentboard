import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import CardMarkdown, { toggleChecklistLine } from '../CardMarkdown';

describe('CardMarkdown', () => {
  it('renders unfinished tasks as text and goes on to render the next checklist item', () => {
    const html = renderToStaticMarkup(createElement(CardMarkdown, { body: '- [ ] \t\n普通段落\n- [ ] 核实证据' }));
    expect(html).toContain('<li>[ ]');
    expect(html).toContain('普通段落');
    expect(html).toContain('核实证据');
    expect(html.match(/type="checkbox"/g)).toHaveLength(1);
  });
});

describe('toggleChecklistLine', () => {
  it('toggles an unchecked markdown task to checked and back while preserving surrounding lines', () => {
    const initial = [
      '本周验证：',
      '- [x] 完成原型',
      '- [ ] 访谈 5 位用户',
      '- [ ] 整理报告',
    ].join('\n');

    const checked = toggleChecklistLine(initial, 2);
    expect(checked).toBe([
      '本周验证：',
      '- [x] 完成原型',
      '- [x] 访谈 5 位用户',
      '- [ ] 整理报告',
    ].join('\n'));

    const unchecked = toggleChecklistLine(checked, 1);
    expect(unchecked).toBe([
      '本周验证：',
      '- [ ] 完成原型',
      '- [x] 访谈 5 位用户',
      '- [ ] 整理报告',
    ].join('\n'));
  });

  it('ignores non-task lines safely', () => {
    const body = '普通段落\n- 普通列表项';
    expect(toggleChecklistLine(body, 0)).toBe(body);
    expect(toggleChecklistLine(body, 1)).toBe(body);
    expect(toggleChecklistLine(body, 99)).toBe(body);
  });

  it('changes only the marker when the body uses CRLF line endings', () => {
    const body = '+ [ ] 第一项\r\n- [ ] \t\r\n* [X] 第三项';
    expect(toggleChecklistLine(body, 1)).toBe(body);
    expect(toggleChecklistLine(body, 2)).toBe('+ [ ] 第一项\r\n- [ ] \t\r\n* [ ] 第三项');
  });
});
