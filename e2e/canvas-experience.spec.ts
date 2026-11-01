import { test, expect, type Page } from '@playwright/test';

const textNode = (id: string, x = 80, y = 80, body = '让信息有清楚的位置，读完即可继续行动。') => ({ id, type: 'card', title: `内容 ${id}`, body, x, y, width: 300, height: 120 });
const visual = { ...textNode('score'), title: '实测记分卡', width: 700, visual: { html: '<style>body{padding:24px;font:14px system-ui;color:#4b6387;background:#fbfcff}h2{font-weight:600}label{display:block;margin-top:18px}input{padding:8px;border:1px solid #d8e2f0;border-radius:6px;color:#4b6387}p{font-size:12px;color:#8b9db7}</style><h2>只填真实数据，让结果说话</h2><p>你的交互状态会一直保留。</p><label>真实访客数 <input id="visitors" type="number" value="300"></label><label>付费人数 <input id="paid" type="number" value="3"></label>', state: {}, height: 260 } };
const actions = [
  { id: 'simple', label: '切换极简记分卡', prompt: '将实测记分卡切换为极简版，保留当前参数和计算逻辑。', nodeIds: ['score'] },
  { id: 'history', label: '增加实测历史', prompt: '为实测记分卡增加每次实测结果的历史记录功能，保留当前交互状态。', nodeIds: ['score'] },
];
const patch = (ops: unknown[], extras: any = {}) => ({ type: 'dsl_patch', summary: '已将你的想法整理到画布。', ops, ...extras });
async function start(page: Page, nodes: unknown[] = []) {
  await page.addInitScript(nodes => {
    if (window.top !== window) return;
    if (!localStorage.getItem('agentboard.sessions')) {
      const board = { version: '0.1', board: { id: 'b', title: '共创画布', viewport: { x: 0, y: 0, zoom: 1 } }, nodes, groups: [], edges: [], metadata: {} };
      localStorage.setItem('agentboard.sessions', JSON.stringify({ activeId: 's', sessions: [{ id: 's', title: '共创画布', board, createdAt: 1, updatedAt: 1 }] }));
    }
    localStorage.setItem('agentboard.config', JSON.stringify({ provider: 'local-cli', cliId: 'pi' }));
  }, nodes);
  await page.route('**/api/clis**', route => route.fulfill({ json: [{ id: 'pi', name: 'Pi CLI', available: true, version: '1.4.0' }] }));
  await page.goto('/');
}
async function submit(page: Page, message = '继续完善这张画布') {
  await page.locator('.prompt-bar textarea').fill(message);
  await page.locator('.prompt-bar textarea').press('Enter');
}
async function answer(page: Page, value: unknown, requests: any[] = []) {
  await page.route('**/api/agent/run', async route => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ contentType: 'application/x-ndjson', body: JSON.stringify({ type: 'result', text: JSON.stringify(value) }) + '\n' });
  });
}
async function rectangles(page: Page) { return page.locator('.board-node').evaluateAll(nodes => nodes.map(node => { const rect = node.getBoundingClientRect(); return { id: (node as HTMLElement).dataset.nodeId, x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom }; })); }
async function overlapCount(page: Page) {
  const rects = await rectangles(page);
  return rects.flatMap((a, index) => rects.slice(index + 1).filter(b => a.x < b.right - 1 && a.right > b.x + 1 && a.y < b.bottom - 1 && a.bottom > b.y + 1)).length;
}
async function dockIsClear(page: Page) {
  const bounds = await page.evaluate(() => {
    const canvas = document.querySelector('.board-canvas')!.getBoundingClientRect();
    const dock = document.querySelector('.conversation-dock')!.getBoundingClientRect();
    return { canvasBottom: canvas.bottom, dockWidth: dock.width, canvasWidth: canvas.width, dockBottom: dock.bottom, viewportHeight: innerHeight };
  });
  expect(bounds.canvasBottom).toBeGreaterThanOrEqual(bounds.dockBottom);
  expect(bounds.dockWidth).toBeLessThan(bounds.canvasWidth);
  expect(bounds.dockBottom).toBeLessThanOrEqual(bounds.viewportHeight);
}

test('each follow-up is executable in one click and preserves the separate draft', async ({ page }) => {
  const requests: any[] = [];
  await answer(page, patch([], { actions, summary: '这次已经把记分卡做成可交互的推演工具。\n你可以继续尝试不同参数，输入内容会保留。\n'+ '解释会完整保留，但默认先把画布和可执行的下一步呈现出来。'.repeat(6) }), requests);
  await start(page, [visual]); await submit(page);
  await expect(page.getByRole('button', { name: '切换极简记分卡', exact: true })).toBeVisible();
  await page.locator('.prompt-bar textarea').fill('这里是我还没有发送的下一步想法');
  await page.screenshot({ animations: 'disabled', path: 'docs/verification/canvas-v033-actions.png' });
  await page.getByRole('button', { name: '增加实测历史', exact: true }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1].userMessage).toContain(actions[1].prompt);
  expect(requests[1].userMessage).toContain('Only work around the selected nodes: score');
  expect(requests[1].userMessage).not.toContain('这里是我还没有发送');
  await expect(page.locator('.prompt-bar textarea')).toHaveValue('这里是我还没有发送的下一步想法');
  await dockIsClear(page);
});

test('older combined offers become separate direct actions', async ({ page }) => {
  const requests: any[] = [];
  await answer(page, patch([], { questions: ['要不要我把记分卡改成「只填 4 个数字、其他全隐藏」的极简版，或者加一个把每次实测结果存成一条历史记录、方便对比多轮的功能？'] }), requests);
  await start(page, [visual]); await submit(page);
  await expect(page.locator('.reply-followups button')).toHaveCount(2);
  await page.locator('.reply-followups button').filter({ hasText: '历史记录' }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1].userMessage).toContain('请执行这一步：加一个');
  expect(requests[1].userMessage).not.toContain('请执行这一步：把记分卡改成');
});

test('rendered content and group bounds never overlap, overview fits and navigation restores readable scale', async ({ page }) => {
  const nodes = Array.from({ length: 14 }, (_, index) => ({ ...textNode(`n${index}`, 80 + index % 3 * 350, 80 + Math.floor(index / 3) * 200, ('观察真实行为，记录证据并继续验证。\n').repeat(index % 3 === 0 ? 18 : 8)), title: ['理解问题', '确定假设', '收集证据', '展开方案', '比较方向', '找到取舍', '设计实验', '真实反馈', '调整目标', '验证结果', '复盘判断', '下一步行动', '长期记录', '实测记分卡'][index] }));
  const groups = [0, 1, 2].map(index => ({ id: `g${index}`, title: ['理解与探索', '实验与验证', '判断与行动'][index], nodeIds: nodes.slice(index * 3, index * 3 + 3).map(node => node.id) }));
  const ops = [...nodes.map(node => ({ op: 'add_node', node })), ...groups.map(group => ({ op: 'add_group', group }))];
  await answer(page, patch(ops, { actions: [{ id: 'compare', label: '继续比较关键方向', prompt: '基于当前证据比较关键方向。' }] }));
  await start(page); await submit(page, '展开产品方向');
  await expect(page.locator('.semantic-map-node')).toHaveCount(14);
  await page.getByRole('button', { name: '内容', exact: true }).click();
  await expect(page.locator('.board-node')).toHaveCount(14);
  await expect.poll(() => overlapCount(page)).toBe(0);
  await expect.poll(async () => Number((await page.locator('.canvas-zoom-value').innerText()).replace('%', ''))).toBeGreaterThanOrEqual(80);
  await dockIsClear(page);
  await page.screenshot({ animations: 'disabled', path: 'docs/verification/canvas-v033-reading.png' });
  await page.getByRole('button', { name: '总览', exact: true }).click();
  const canvas = (await page.locator('.board-canvas').boundingBox())!;
  const bounds = await rectangles(page);
  for (const rect of bounds) {
    expect(rect.x).toBeGreaterThanOrEqual(canvas.x); expect(rect.right).toBeLessThanOrEqual(canvas.x + canvas.width + 1);
    expect(rect.y).toBeGreaterThanOrEqual(canvas.y); expect(rect.bottom).toBeLessThanOrEqual(canvas.y + canvas.height + 1);
  }
  await page.screenshot({ animations: 'disabled', path: 'docs/verification/canvas-v033-overview.png' });
  await page.getByRole('combobox', { name: '内容导航', exact: true }).click();
  await page.getByRole('option', { name: '实测记分卡', exact: true }).click();
  const focused = (await page.locator('[data-node-id="n13"]').boundingBox())!;
  expect(focused.y).toBeGreaterThanOrEqual(canvas.y); expect(focused.y).toBeLessThan(canvas.y + canvas.height / 2);
  expect(Number((await page.locator('.canvas-zoom-value').innerText()).replace('%', ''))).toBeGreaterThanOrEqual(80);
  const before = await page.locator('.canvas-content').getAttribute('style');
  await page.mouse.move(canvas.x + canvas.width - 20, canvas.y + 150); await page.mouse.wheel(0, 180);
  await expect.poll(() => page.locator('.canvas-content').getAttribute('style')).not.toBe(before);
});

test('collision corrections preserve existing positions and remain part of one-click undo', async ({ page }) => {
  const existing = [textNode('a', 80, 80), textNode('b', 80, 300)];
  await answer(page, patch([{ op: 'add_node', node: textNode('new', 80, 80) }]));
  await start(page, existing); await submit(page);
  await expect(page.locator('.board-node')).toHaveCount(3);
  await expect.poll(() => overlapCount(page)).toBe(0);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('agentboard.sessions')!).sessions[0]);
  expect(stored.board.nodes.find((node: any) => node.id === 'a').y).toBe(80);
  expect(stored.board.nodes.find((node: any) => node.id === 'b').y).toBe(300);
  expect(stored.history.past).toHaveLength(1);
  await page.locator('.patch-result-toast').getByRole('button', { name: '撤销', exact: true }).click();
  await expect(page.locator('.board-node')).toHaveCount(2);
  await expect(page.locator('[data-node-id="new"]')).toHaveCount(0);
});

test('selection context is compact and clearing it restores whole-board scope', async ({ page }) => {
  await start(page, [visual]);
  await page.locator('[data-node-id="score"] > h2').click();
  await page.locator('.prompt-bar textarea').click();
  await expect(page.locator('.prompt-scope-button')).toHaveText('实测记分卡');
  await expect(page.locator('.prompt-targets')).toHaveClass(/has-selection/);
  await expect(page.locator('.prompt-context-bar')).not.toContainText('1/3');
  await page.screenshot({ animations: 'disabled', path: 'docs/verification/canvas-v033-selection.png' });
  await page.getByRole('button', { name: '取消选中内容', exact: true }).click();
  await expect(page.locator('.prompt-scope-button')).toContainText('整张画布');
});

test('expanded completion and history leave a visible canvas in a compact window', async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 650 });
  await answer(page, patch([], { summary: ('完整说明仍然可以展开阅读，同时输入区拥有独立空间。\n').repeat(15), actions }));
  await start(page, [visual]); await submit(page);
  await page.getByRole('button', { name: /展开说明/ }).click();
  await dockIsClear(page);
  expect((await page.locator('.board-canvas').boundingBox())!.height).toBeGreaterThan(120);
  await page.screenshot({ animations: 'disabled', path: 'docs/verification/canvas-v033-compact.png' });
});
