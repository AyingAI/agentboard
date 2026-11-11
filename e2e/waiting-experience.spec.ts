import { test, expect, type Page } from '@playwright/test';
import { createServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { BoardNode, DSLPatch } from '../src/types/dsl';

async function streamingAgent(page: Page) {
  const streams: ServerResponse[] = [];
  const requests: any[] = [];
  const server = createServer((request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Headers', '*');
    if (request.method === 'OPTIONS') { response.end(); return; }
    let body = '';
    request.on('data', chunk => body += chunk);
    request.on('end', () => {
      requests.push(JSON.parse(body));
      response.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache' });
      response.flushHeaders(); streams.push(response);
      response.write(JSON.stringify({ type: 'progress', event: { type: 'connected', message: '已连接 Pi CLI · 1.4.0' } }) + '\n');
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  await page.route('**/api/agent/run', route => route.continue({ url: `http://127.0.0.1:${port}/run` }));
  await page.route('**/api/agent/run/*', route => route.fulfill({ json: { status: 'cancelled' } }));
  return {
    requests,
    send: (event: unknown) => streams.at(-1)!.write(JSON.stringify(event) + '\n'),
    finish: (value: DSLPatch = { type: 'dsl_patch', summary: '你的想法已整理好', ops: [] }) => { streams.at(-1)!.end(JSON.stringify({ type: 'result', text: JSON.stringify(value) }) + '\n'); },
    close: async () => { streams.forEach(stream => stream.destroy()); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); },
  };
}
async function start(page: Page) {
  await page.addInitScript(() => { if (window.top === window) localStorage.setItem('agentboard.config', JSON.stringify({ provider: 'local-cli', cliId: 'pi' })); });
  await page.route('**/api/clis**', route => route.fulfill({ json: [{ id: 'pi', name: 'Pi CLI', available: true, version: '1.4.0' }] }));
  await page.goto('/');
}
async function submit(page: Page) {
  await page.locator('.prompt-bar textarea').fill('比较三种产品方向，做成可以探索的画布');
  await page.locator('.prompt-bar textarea').press('Enter');
  await expect(page.locator('.run-connection')).toContainText('连接保持中');
}

const firstCard: BoardNode = { id: 'first-card', type: 'card', title: '三种产品方向对比', body: '比较上手难度、验证成本和复用性。', x: 60, y: 60, width: 320, height: 140 };

test('the first written content names a default board once and persists across canvas undo and reload', async ({ page }) => {
  const agent = await streamingAgent(page);
  try {
    await start(page);
    await page.getByTitle('新建白板', { exact: true }).click();
    const title = page.locator('.current-board-title');
    await expect(title).toHaveText('白板 1');

    await submit(page);
    agent.finish({ type: 'dsl_patch', summary: '可以比较三个方向。', boardTitle: '仅聊天时给出的标题', ops: [] });
    await expect(page.locator('.patch-result-toast')).toBeVisible();
    await expect(title).toHaveText('白板 1');

    await submit(page);
    agent.finish({ type: 'dsl_patch', summary: '已整理产品方向。', boardTitle: '产品方向与验证计划', ops: [{ op: 'add_node', node: firstCard }] });
    await expect(title).toHaveText('产品方向与验证计划');
    await page.locator('.patch-result-toast').getByRole('button', { name: '撤销', exact: true }).click();
    await expect(page.locator('[data-node-id="first-card"]')).toHaveCount(0);

    await page.reload();
    await expect(title).toHaveText('产品方向与验证计划');
    await submit(page);
    agent.finish({ type: 'dsl_patch', summary: '已补充比较。', boardTitle: '另一个标题', ops: [{ op: 'add_node', node: firstCard }] });
    await expect(page.locator('[data-node-id="first-card"]')).toBeVisible();
    await expect(title).toHaveText('产品方向与验证计划');
    const storedTitle = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem('agentboard.sessions')!);
      return data.sessions.find((session: { id: string }) => session.id === data.activeId).board.board.title;
    });
    expect(storedTitle).toBe('产品方向与验证计划');
  } finally { await agent.close(); }
});

test('a reviewed first result names the board from its content only after approval', async ({ page }) => {
  const agent = await streamingAgent(page);
  try {
    await start(page);
    await submit(page);
    agent.finish({ type: 'dsl_patch', summary: '准备了对比草稿。', ops: [
      { op: 'add_node', node: firstCard },
      { op: 'update_node', nodeId: firstCard.id, changes: { body: '验证需求强度与交付成本。' } },
    ] });
    await expect(page.getByRole('button', { name: '确认应用' })).toBeVisible();
    await expect(page.locator('.current-board-title')).toHaveText('新白板');
    await page.reload();
    await page.getByRole('button', { name: '确认应用' }).click();
    await expect(page.locator('.current-board-title')).toHaveText(firstCard.title);
  } finally { await agent.close(); }
});

test('a manual title entered while the first run is pending wins over automatic naming', async ({ page }) => {
  const agent = await streamingAgent(page);
  try {
    await start(page);
    await submit(page);
    const title = page.locator('.current-board-title');
    await title.dblclick();
    const editor = page.locator('.board-title-edit');
    await editor.fill('白板 9');
    await editor.press('Enter');
    agent.finish({ type: 'dsl_patch', summary: '已整理产品方向。', boardTitle: '产品方向与验证计划', ops: [{ op: 'add_node', node: firstCard }] });
    await expect(page.locator('[data-node-id="first-card"]')).toBeVisible();
    await expect(title).toHaveText('白板 9');
  } finally { await agent.close(); }
});

test('real streamed activity updates a single composer while the next draft remains editable', async ({ page }) => {
  const agent = await streamingAgent(page);
  try {
    await start(page);
    await submit(page);
    await expect(page.locator('.empty-board-working')).toBeVisible();
    const branch = page.locator('.working-branch path').first();
    await expect.poll(() => branch.evaluate(element => element.getAnimations().some(animation => animation.playState === 'running'))).toBe(true);
    await expect(page.locator('.empty-board-welcome')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '停止生成', exact: true })).toHaveCount(1);
    const input = page.locator('.prompt-bar textarea');
    await expect(input).toBeEnabled();
    await input.fill('接下来重点讨论方案二');
    agent.send({ type: 'progress', event: { type: 'tool', message: '正在阅读材料', toolName: 'read' } });
    await expect(page.locator('.run-latest-event')).toHaveText('正在阅读材料');
    agent.send({ type: 'progress', event: { type: 'output', message: '正在生成内容', outputChars: 1240, previewTitles: ['方向比较', '关键假设'] } });
    await expect(page.locator('.run-preview')).toContainText('关键假设');
    const statusBounds = await page.locator('.agent-run-overlay').boundingBox();
    const inputBounds = await input.boundingBox();
    expect(statusBounds!.y + statusBounds!.height).toBeLessThan(inputBounds!.y);
    await page.getByRole('button', { name: '查看执行详情' }).click();
    await expect(page.locator('.run-event-timeline')).toContainText('正在阅读材料');
    await expect(page.locator('.run-log-metrics')).toHaveText('已接收 1,240 字符 · 1 次工具活动');
    await page.getByRole('button', { name: '关闭活动面板' }).click();
    agent.finish();
    await expect(page.locator('.patch-result-toast')).toBeVisible();
    await expect(input).toHaveValue('接下来重点讨论方案二');
    await expect(page.locator('.agent-run-overlay')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '发送', exact: true })).toBeEnabled();
  } finally { await agent.close(); }
});

test('stopping preserves the next draft and retry reuses the original request', async ({ page }) => {
  const agent = await streamingAgent(page);
  try {
    await start(page); await submit(page);
    await page.locator('.prompt-bar textarea').fill('我的下一步想法');
    await page.getByRole('button', { name: '停止生成', exact: true }).click();
    await expect(page.getByRole('status', { name: '生成恢复' })).toContainText('已停止这次生成');
    await expect(page.locator('.prompt-bar textarea')).toHaveValue('我的下一步想法');
    expect(agent.requests.length).toBe(1);
    await page.getByRole('button', { name: /重新尝试/ }).click();
    await expect.poll(() => agent.requests.length).toBe(2);
    expect(agent.requests[1].userMessage).toContain('比较三种产品方向');
    await expect(page.locator('.prompt-bar textarea')).toHaveValue('我的下一步想法');
    agent.finish();
    await expect(page.locator('.patch-result-toast')).toBeVisible();
  } finally { await agent.close(); }
});

test('long waits stay honest and reduced motion disables decorative animation', async ({ page }) => {
  const agent = await streamingAgent(page);
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.clock.install();
    await start(page); await submit(page);
    await page.clock.fastForward(65000);
    await expect(page.locator('.run-heading-copy')).toContainText('还没有收到可展示的内容');
    await expect(page.locator('.run-connection')).toContainText('等待下一次反馈');
    expect(await page.locator('.run-signal i').first().evaluate(element => getComputedStyle(element).animationName)).toBe('none');
    expect(await page.locator('.working-branch path').first().evaluate(element => getComputedStyle(element).animationName)).toBe('none');
    await expect(page.locator('.agent-run-overlay')).not.toContainText('%');
    agent.send({ type: 'progress', event: { type: 'heartbeat', message: '本地进程仍在运行' } });
    await expect(page.locator('.run-connection')).toContainText('连接保持中');
    agent.finish();
  } finally { await agent.close(); }
});

test('failure offers recovery in the composer without losing the request', async ({ page }) => {
  const agent = await streamingAgent(page);
  try {
    await start(page); await submit(page);
    agent.send({ type: 'error', message: '模型服务暂时不可用，请稍后重试' });
    await expect(page.getByRole('status', { name: '生成恢复' })).toContainText('模型服务暂时不可用');
    await expect(page.locator('.empty-board-welcome')).toBeVisible();
    await page.getByRole('button', { name: '关闭生成提示' }).click();
    await expect(page.getByRole('status', { name: '生成恢复' })).toHaveCount(0);
  } finally { await agent.close(); }
});

test('waiting feedback and input fit a compact viewport', async ({ page }) => {
  const agent = await streamingAgent(page);
  try {
    await page.setViewportSize({ width: 390, height: 700 });
    await start(page); await submit(page);
    agent.send({ type: 'progress', event: { type: 'output', message: '生成中', outputChars: 6000, previewTitles: ['一个很长的内容标题，测试在小窗口中的折行和裁剪', '方案比较'] } });
    await expect(page.locator('.run-preview')).toBeVisible();
    const composer = await page.locator('.composer-wrapper').boundingBox();
    expect(composer!.x).toBeGreaterThanOrEqual(0); expect(composer!.x + composer!.width).toBeLessThanOrEqual(390);
    expect(composer!.y).toBeGreaterThan(0); expect(composer!.y + composer!.height).toBeLessThanOrEqual(700);
    agent.finish();
  } finally { await agent.close(); }
});

test('reloading an unfinished request offers retry instead of an orphan running indicator', async ({ page }) => {
  const agent = await streamingAgent(page);
  try {
    await start(page); await submit(page);
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('agentboard.sessions')!).sessions[0].activities.some((item: any) => item.progressStatus === 'running'))).toBe(true);
    await page.reload();
    await expect(page.getByRole('status', { name: '生成恢复' })).toContainText('页面重新载入');
    await expect(page.locator('.agent-run-overlay')).toHaveCount(0);
    await page.getByRole('button', { name: /重新尝试/ }).click();
    await expect.poll(() => agent.requests.length).toBe(2);
    expect(agent.requests[1].userMessage).toContain('比较三种产品方向');
    agent.finish();
    await expect(page.locator('.patch-result-toast')).toBeVisible();
  } finally { await agent.close(); }
});

test('existing visuals remain interactive while another request is working', async ({ page }) => {
  const agent = await streamingAgent(page);
  try {
    await page.addInitScript(() => {
      if (window.top !== window) return;
      const node = { id: 'lab', type: 'card', title: '方案推演', body: '调节参数，继续探索。', x: 80, y: 100, width: 620, height: 360,
        visual: { html: '<style>body{font-family:system-ui;color:#425c82;padding:26px;background:#fafcff}h2{font-weight:600}input{width:100%;accent-color:#6c8cbf}p{color:#7e90a9;font-size:13px}output{display:block;font-size:32px;margin-top:24px}</style><h2>让想法变得可以探索</h2><p>移动滑杆，试试看不同投入带来的变化。</p><label for="budget">投入强度</label><input id="budget" type="range" min="1" max="10" value="4"><output id="value">4</output><script>const slider=document.getElementById("budget"),out=document.getElementById("value");slider.oninput=()=>{out.textContent=slider.value;agentboard.setState({budget:Number(slider.value)})}</script>', state: { budget: 4 }, height: 290 } };
      const board = { version: '0.1', board: { id: 'board', title: '推演空间', viewport: { x: 0, y: 0, zoom: 1 } }, nodes: [node], edges: [], groups: [], metadata: {} };
      localStorage.setItem('agentboard.sessions', JSON.stringify({ activeId: 's1', sessions: [{ id: 's1', title: '推演空间', board, createdAt: 1, updatedAt: 1 }] }));
    });
    await start(page); await submit(page);
    const frame = page.locator('[data-node-id="lab"]').frameLocator('iframe');
    await frame.locator('#budget').focus(); await frame.locator('#budget').press('End');
    await expect(frame.locator('#value')).toHaveText('10');
    await expect(page.locator('.visual-error')).toHaveCount(0);
    agent.send({ type: 'progress', event: { type: 'output', message: '生成中', outputChars: 2200, previewTitles: ['方向比较', '关键假设'] } });
    await expect(page.locator('.run-preview')).toContainText('关键假设');
    agent.finish();
    await expect(page.locator('.patch-result-toast')).toBeVisible();
    await expect(frame.locator('#value')).toHaveText('10');
  } finally { await agent.close(); }
});


test('a lost local run retries the same task without asking for a smaller scope', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/agent/run', route => {
    calls++;
    const event = calls === 1 ? { type: 'progress', event: { type: 'connected', message: '已连接' } }
      : { type: 'result', text: JSON.stringify({ type: 'dsl_patch', summary: '已恢复原任务', ops: [{ op: 'add_node', node: firstCard }] }) };
    return route.fulfill({ contentType: 'application/x-ndjson', body: JSON.stringify(event) + '\n' });
  });
  await page.route('**/api/agent/run/*', route => route.fulfill({ status: 404 }));
  await start(page);
  await page.locator('.prompt-bar textarea').fill('比较三种产品方向，做成可以探索的画布');
  await page.locator('.prompt-bar textarea').press('Enter');
  const recovery = page.getByRole('status', { name: '生成恢复' });
  await expect(recovery).toContainText('原请求已保留');
  await expect(page.locator('.interaction-toast')).toHaveCount(0);
  expect(calls).toBe(1);
  await recovery.getByRole('button', { name: '重新尝试' }).click();
  await expect(page.locator('[data-node-id="first-card"]')).toContainText(firstCard.title);
  expect(calls).toBe(2);
  const session = await page.evaluate(() => JSON.parse(localStorage.getItem('agentboard.sessions')!).sessions[0]);
  expect(Object.keys(session.runs)).toHaveLength(1);
  expect(session.activities.filter((item: any) => item.kind === 'user_message')).toHaveLength(1);
});
