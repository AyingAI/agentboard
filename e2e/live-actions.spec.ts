import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test('a real CLI produces executable options and a click continues without sending the draft', async ({ page }) => {
  const cliId = process.env.AGENTBOARD_LIVE_ACTIONS;
  test.skip(!cliId, 'Opt in with AGENTBOARD_LIVE_ACTIONS=pi; this uses the installed CLI and model quota.');
  test.setTimeout(300000);
  const requests: any[] = [];
  page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/api/agent/run')) requests.push(request.postDataJSON()); });
  await page.addInitScript(cliId => { if (window.top === window) localStorage.setItem('agentboard.config', JSON.stringify({ provider: 'local-cli', cliId })); }, cliId!);
  await page.goto('/');
  const input = page.locator('.prompt-bar textarea');
  await input.fill('这是 AgentBoard 的真实连接验证，只根据当前信息工作，不读取文件、不调用工具、不改动仓库。请直接创建三个简洁卡片，分别解释「提出假设」「小规模验证」「根据证据判断」，每张卡片只写一两句。把三个卡片放在同一行并留足间距。完成后通过 actions 给两个可直接执行的选项：第一项 label「补充验证清单」，prompt 为「请基于当前三个卡片新增一个简短的验证清单便签，只新增，不读取文件、不调用工具、不改动仓库」；第二项 label「加入判断标准」，prompt 为「为当前流程新增一个简短的判断标准便签，只新增」。请返回合法 DSLPatch，不要把执行选项写成问题。');
  await input.press('Enter');
  const waitForResult = async () => {
    await expect(page.locator('.patch-result-toast, .run-recovery, .interaction-toast').first()).toBeVisible({ timeout: 240000 });
    if (await page.locator('.run-recovery, .interaction-toast').count()) throw new Error(await page.locator('.run-recovery, .interaction-toast').first().innerText());
  };
  await waitForResult();
  await expect(page.getByRole('button', { name: '补充验证清单', exact: true })).toBeVisible();
  await expect(page.locator('.board-node')).toHaveCount(3);
  await input.fill('这一段是还没有发送的草稿，请保留');
  await page.getByRole('button', { name: '补充验证清单', exact: true }).click();
  await expect.poll(() => requests.length).toBe(2);
  await waitForResult();
  await expect.poll(() => page.locator('.board-node').count()).toBeGreaterThanOrEqual(4);
  await expect(input).toHaveValue('这一段是还没有发送的草稿，请保留');
  expect(requests[1].userMessage).not.toContain('这一段是还没有发送');
  const canvas = (await page.locator('.board-canvas').boundingBox())!, dock = (await page.locator('.conversation-dock').boundingBox())!;
  expect(canvas.y + canvas.height).toBeGreaterThanOrEqual(dock.y + dock.height);
  expect(dock.width).toBeLessThan(canvas.width);
  await mkdir('docs/verification', { recursive: true });
  await page.screenshot({ animations: 'disabled', path: 'docs/verification/canvas-v033-live-actions.png' });
  const data = await page.evaluate(() => JSON.parse(localStorage.getItem('agentboard.sessions')!));
  await writeFile('docs/verification/canvas-v033-live-actions.agentboard.json', JSON.stringify(data.sessions.find((session: any) => session.id === data.activeId).board, null, 2));
  console.log(JSON.stringify({ cliId, realRequests: requests.length, nodes: await page.locator('.board-node').count(), draftPreserved: true }));
});
