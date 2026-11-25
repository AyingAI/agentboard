import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function openEmptyBoard(page: Page, withAgent = false) {
  await page.addInitScript((withAgent) => {
    if (window.top !== window) return;
    if (withAgent) {
      localStorage.setItem('agentboard.config', JSON.stringify({ provider: 'local-cli', cliId: 'claude' }));
    }
  }, withAgent);
  await page.route('**/api/clis**', route => route.fulfill({
    json: withAgent ? [{ id: 'claude', name: 'Claude Code', available: true, version: '2.1.0' }] : [],
  }));
  await page.goto('/');
}

test('zero-config interactive showcase launches from welcome, runs live visual sliders, toggles checklists and undoes cleanly', async ({ page }) => {
  await openEmptyBoard(page, false);
  await expect(page.locator('.composer-wrapper')).toHaveClass(/is-expanded/);

  await page.getByRole('button', { name: /免配置体验：打开交互式画布示例/ }).click();
  await expect(page.locator('.board-node')).toHaveCount(4);
  await expect(page.locator('.visual-loading')).toHaveCount(0);

  // Interactive visual works immediately and persists state
  const frame = page.locator('[data-node-id="showcase_sandbox"]').frameLocator('iframe');
  await expect(frame.locator('#price-val')).toHaveText('¥49');
  await frame.getByRole('button', { name: '高客单专业版' }).click();
  await expect(frame.locator('#price-val')).toHaveText('¥149');

  // Interactive Markdown checklist toggles in place and supports undo
  const checklistCard = page.locator('[data-node-id="showcase_checklist"]');
  const secondTask = checklistCard.locator('input[type="checkbox"]').nth(1);
  await expect(secondTask).not.toBeChecked();
  await secondTask.click();
  await expect(secondTask).toBeChecked();

  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(checklistCard.locator('input[type="checkbox"]').nth(1)).not.toBeChecked();
});

test('Shift+Click multi-select enables contextual grouping, ungrouping, role switching and duplication', async ({ page }) => {
  await openEmptyBoard(page, true);
  await page.getByRole('button', { name: /免配置体验/ }).click();
  await expect(page.locator('.board-node')).toHaveCount(4);

  // Single-select shows contextual toolbar and switches semantic role
  await page.locator('[data-node-id="showcase_evidence"] > h2').click();
  const toolbar = page.getByRole('toolbar', { name: '选中内容快捷操作' });
  await expect(toolbar).toBeVisible();
  await expect(toolbar.getByRole('button', { name: '✦ 展开细化' })).toBeVisible();
  await toolbar.getByRole('button', { name: /📌 证据/ }).click();
  await page.getByRole('menuitem', { name: '⚠️ 风险便签' }).click();
  await expect(page.locator('[data-node-id="showcase_evidence"]')).toHaveClass(/tag-risk/);

  // Shift+Click adds a second card and creates/dissolves a group
  await page.locator('[data-node-id="showcase_risk"] > h2').click({ modifiers: ['Shift'] });
  await expect(toolbar).toContainText('已选 2 项');
  await expect(page.locator('.group-boundary')).toHaveCount(2);
  await toolbar.getByRole('button', { name: '🗂️ 编为一组' }).click();
  await expect(page.locator('.group-boundary')).toHaveCount(3);
  await toolbar.getByRole('button', { name: '解除编组' }).click();
  await expect(page.locator('.group-boundary')).toHaveCount(2);

  // Duplicate selected cards
  await toolbar.getByRole('button', { name: '复制' }).click();
  await expect(page.locator('.board-node')).toHaveCount(6);
});

test('smart canvas paste, persistent board brief injection and universal markdown deliverable export work together', async ({ page }) => {
  const requests: any[] = [];
  await page.route('**/api/agent/run', async route => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({
      contentType: 'application/x-ndjson',
      body: JSON.stringify({ type: 'result', text: JSON.stringify({ type: 'dsl_patch', summary: '已结合目标完成分析。', ops: [] }) }) + '\n',
    });
  });

  await openEmptyBoard(page, true);
  await page.getByRole('button', { name: '自由开始，先记一条想法' }).click();
  await page.keyboard.press('Escape');
  await page.locator('.board-canvas').click({ position: { x: 40, y: 40 } });

  // Smart paste URL & multi-line markdown onto canvas
  await page.evaluate(() => {
    const pasteText = (text: string) => {
      const event = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'clipboardData', {
        value: { getData: (type: string) => (type === 'text/plain' ? text : '') },
      });
      document.body.dispatchEvent(event);
    };
    pasteText('https://example.com/pricing-benchmark');
    pasteText('# 访谈洞察\n- [ ] 核实团队付费周期');
  });

  await expect(page.locator('.board-node')).toHaveCount(3);
  await expect(page.locator('.card-source-link')).toContainText('example.com');
  await expect(page.locator('.md-task')).toContainText('核实团队付费周期');

  // Set persistent board brief and verify it reaches the Agent request
  await page.getByRole('button', { name: /目标/ }).click();
  const briefDialog = page.getByRole('dialog', { name: '白板目标与约束' });
  await briefDialog.getByPlaceholder(/两周内验证/).fill('本月完成三档定价验证');
  await briefDialog.getByPlaceholder(/2 人团队/).fill('必须支持自助试用');
  await briefDialog.getByRole('button', { name: '保存目标' }).click();
  await expect(page.locator('.topbar-brief-btn')).toHaveClass(/has-brief/);

  await page.locator('.prompt-bar textarea').fill('给出下一步建议');
  await page.locator('.prompt-bar textarea').press('Enter');
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].userMessage).toContain('本月完成三档定价验证');
  expect(requests[0].userMessage).toContain('必须支持自助试用');

  // Open universal deliverable Markdown export modal (defaults to whole board)
  await page.getByRole('button', { name: '导出文档', exact: true }).click();
  const exportDialog = page.getByRole('dialog', { name: '导出 Markdown 文档' });
  await expect(exportDialog).toBeVisible();
  const markdownValue = await exportDialog.locator('.deliverable-textarea').inputValue();
  expect(markdownValue).toContain('本月完成三档定价验证');
  expect(markdownValue).toContain('example.com/pricing-benchmark');
  expect(markdownValue).toContain('访谈洞察');

  // Switch export scope to current selection
  await exportDialog.getByLabel(/当前选中/).check();
  const selectedOnly = await exportDialog.locator('.deliverable-textarea').inputValue();
  expect(selectedOnly).toContain('访谈洞察');
  expect(selectedOnly).not.toContain('example.com/pricing-benchmark');
});

test('global insights read untouched cards after pasting a complete checklist', async ({ page }) => {
  const requests: string[] = [];
  await page.route('**/api/agent/run', async route => {
    requests.push(route.request().postDataJSON().userMessage);
    await route.fulfill({
      contentType: 'application/x-ndjson',
      body: JSON.stringify({
        type: 'result',
        text: JSON.stringify({ type: 'dsl_patch', summary: '已完成全局分析', ops: [] }),
      }) + '\n',
    });
  });

  await openEmptyBoard(page, true);
  await page.getByRole('button', { name: /免配置体验/ }).click();
  await page.evaluate(() => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', '- [ ] 核实访谈\n- [ ] 整理结论');
    document.body.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }));
  });
  await expect(page.locator('.board-node')).toHaveCount(5);
  const firstTask = page.getByRole('checkbox', { name: '核实访谈' });
  await firstTask.check();
  await expect(firstTask).toBeChecked();
  await expect(page.getByRole('checkbox', { name: '整理结论' })).not.toBeChecked();

  await page.getByRole('button', { name: /AI 洞察/ }).click();
  await page.getByRole('menuitem', { name: /全局找盲点/ }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0]).toContain('Current board DSL');
  expect(requests[0]).toContain('- [x] 核实访谈');
  expect(requests[0]).toContain('1 位自由职业者倾向一次性买断');
});

test('switching a semantic role preserves and persists custom tags on an existing card', async ({ page }) => {
  await page.addInitScript(() => {
    if (window.top !== window || localStorage.getItem('agentboard.sessions')) return;
    const title = '已有定价白板';
    const board = {
      version: '0.1',
      board: { id: 'pricing', title, viewport: { x: 0, y: 0, zoom: 1 } },
      nodes: [{
        id: 'pricing-result', type: 'card', title: '定价依据', body: '已完成访谈',
        tags: ['output', 'pricing', 'customer-research'], x: 80, y: 80, width: 320, height: 120,
      }],
      edges: [], groups: [], metadata: {},
    };
    localStorage.setItem('agentboard.sessions', JSON.stringify({
      activeId: 'pricing', sessions: [{ id: 'pricing', title, board, createdAt: 1, updatedAt: 1 }],
    }));
  });
  await openEmptyBoard(page);
  await page.getByRole('heading', { name: '定价依据' }).click();
  await page.getByRole('button', { name: /普通卡片/ }).click();
  await page.getByRole('menuitem', { name: /风险便签/ }).click();
  await page.reload();

  const card = page.locator('[data-node-id="pricing-result"]');
  await expect(card).toHaveClass(/tag-risk/);
  await expect(card).toHaveClass(/tag-pricing/);
  await expect(card).toHaveClass(/tag-customer-research/);
  await expect(card).not.toHaveClass(/tag-output/);
});

test('the board menu opens Markdown export and downloads a file at phone width', async ({ page }) => {
  await openEmptyBoard(page);
  await page.getByRole('button', { name: /免配置体验/ }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: /独立产品定价与增长推演/ }).click();
  await page.getByRole('dialog', { name: '切换白板' }).getByRole('button', { name: '导出文档', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '导出 Markdown 文档' });
  await expect(dialog).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: '下载 .md', exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.md$/);
  expect(await readFile(await download.path(), 'utf8')).toContain('早期用户访谈线索');
});
