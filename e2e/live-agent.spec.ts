import { test, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

test('live CLI generates and revises a working visual with preserved user state', async ({ page }) => {
  const cliId = process.env.AGENTBOARD_LIVE_CLI;
  test.skip(!cliId, 'Opt in with AGENTBOARD_LIVE_CLI=codex (uses the installed CLI and its authentication).');
  test.setTimeout(900000);
  await page.addInitScript(cliId => {
    if (window.top !== window) return;
    if (!localStorage.getItem('agentboard.config')) localStorage.setItem('agentboard.config', JSON.stringify({ provider: 'local-cli', cliId }));
  }, cliId!);
  // Reuse an earlier genuine CLI response when debugging presentation, avoiding another generation charge.
  if (process.env.AGENTBOARD_LIVE_SEED) {
    const seed = JSON.parse(await readFile(process.env.AGENTBOARD_LIVE_SEED, 'utf8'));
    const nodes = seed.ops.filter((op: any) => op.op === 'add_node').map((op: any) => op.node);
    await page.addInitScript(nodes => {
      if (window.top !== window) return;
      if (localStorage.getItem('agentboard.sessions')) return;
      const board = { version: '0.1', board: { id: 'live-board', title: '复利实验室', viewport: { x: 0, y: 0, zoom: 1 } }, nodes, edges: [], groups: [], metadata: {} };
      localStorage.setItem('agentboard.sessions', JSON.stringify({ activeId: 'live', sessions: [{ id: 'live', title: '复利实验室', board, createdAt: Date.now(), updatedAt: Date.now() }] }));
    }, nodes);
  }
  await page.goto('/');
  const input = page.locator('.prompt-bar textarea');
  await input.fill('请直接创建一个漂亮、清楚、可交互的复利解释器，设计形式由你选择。只需一个视觉卡片，标题「复利实验室」。本金1000，假设年利率5%；年份滑块 id="years"，范围1到30，默认5；金额输出 id="result"。用 agentboard.getState()/setState 保存 years，重新运行时恢复。明确标注数学模拟。请直接返回完整可运行的 visual.html，不读取文件、不调用工具、不修改仓库，也不需要授权问题。');
  if (!process.env.AGENTBOARD_LIVE_SEED) await input.press('Enter');
  const node = page.locator('.board-node.visual-node').first();
  await expect(node).toBeVisible({ timeout: 600000 });
  const frame = node.frameLocator('iframe');
  await expect(frame.locator('#years')).toBeVisible({ timeout: 20000 });
  await frame.locator('#years').focus();
  await frame.locator('#years').press('End');
  await expect.poll(() => page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('agentboard.sessions')!);
    return data.sessions.find((s: any) => s.id === data.activeId).board.nodes.find((n: any) => n.visual)?.visual.state?.years;
  })).toBe(30);
  const before = await frame.locator('#result').textContent();
  expect(before).toBeTruthy();
  await node.getByRole('button', { name: '与 Agent 讨论', exact: true }).click();
  await input.fill('保持用户当前的30年参数和原有计算功能，为这个视觉增加一段收益增长的解释。请更新同一个节点的 visual.html，保留 id=years、id=result 和交互状态，不新建节点、不调用任何工具。');
  await input.press('Enter');
  await expect(page.locator('.patch-proposal-toast')).toBeVisible({ timeout: 600000 });
  await page.locator('.patch-proposal-toast').getByRole('button', { name: '预览前后变化' }).click();
  await expect(page.locator('.review-comparison')).toBeVisible();
  await page.locator('.patch-review-dialog').getByRole('button', { name: '确认应用', exact: true }).click();
  await expect(frame.locator('#years')).toHaveValue('30', { timeout: 20000 });
  await page.reload();
  await expect(page.locator('.board-node.visual-node').first().frameLocator('iframe').locator('#years')).toHaveValue('30');
  await mkdir('docs/verification', { recursive: true });
  await page.screenshot({ path: 'docs/verification/agentboard-v0.3-live.png', fullPage: true });
  const exported = await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('agentboard.sessions')!);
    const session = data.sessions.find((s: any) => s.id === data.activeId);
    return { format: 'agentboard.board.v1', exportedAt: new Date().toISOString(), title: session.title, board: session.board };
  });
  await writeFile('docs/verification/live-visual.agentboard.json', JSON.stringify(exported, null, 2));
});
