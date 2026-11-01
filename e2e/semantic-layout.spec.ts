import { test, expect, type Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const node = (id: string, title: string, tag: string, body: string, x = 80, y = 80) => ({ id, type: 'card', title, body, tags: [tag], x, y, width: 320, height: 150, createdBy: 'agent' });
const visual = { html: `<style>body{margin:0;padding:24px;font:14px/1.8 system-ui;color:#445d7c;background:#fbfcff}h2{font-size:21px;color:#2d4567}label{display:block;margin:24px 0}input{width:90%;accent-color:#7a9ccc}output{display:block;color:#537eaa;font-size:26px;font-weight:600}p{color:#98a9bf;font-size:12px}</style><h2>用一个小实验，换来真实证据</h2><p>布局测试场景 · 以下为示例参数</p><label>访谈人数 <input type="range" id="people" min="1" max="20" value="5"></label><output id="result">5 位用户</output><script>const p=document.getElementById('people');p.addEventListener('input',()=>{document.getElementById('result').textContent=p.value+' 位用户';agentboard.setState({people:Number(p.value)})});</script>`, state: {}, height: 430 };
function scenario() {
  const nodes = [
    node('decision', '先验证哪一个产品方向？', 'decision', '先比较真实需求、验证成本和已有证据，再决定把精力投在哪里。'),
    { ...node('a', '方向 A · 会议行动助手', 'concept', '把会议讨论整理成可以追踪的行动。', 80, 400), width: 740, visual },
    node('ae', '已有证据 · 用户会手动补清单', 'evidence', '示例观察：会后需要人工整理待办。尚未验证使用频次。', 80, 1100),
    node('ar', '需要验证 · 是否持续使用', 'risk', '一次觉得有用，不代表每周都愿意继续使用。', 80, 1400),
    { ...node('b', '方向 B · 定价解释工具', 'concept', '帮助独立开发者比较不同定价假设。', 980, 400), width: 740, visual: { ...visual, html: visual.html.replace('用一个小实验，换来真实证据', '先把定价假设摊开比较') } },
    node('be', '已有证据 · 经常反复调整价格', 'evidence', '示例观察：创作者需要解释不同方案的取舍。', 980, 1100),
    node('br', '需要验证 · 解释能否促成行动', 'risk', '漂亮的对比页面不能替代真实购买与用户反馈。', 980, 1400),
    { ...node('c', '方向 C · 可执行讨论白板', 'concept', '让讨论产出进入真实的下一步行动。', 1880, 400), width: 740, visual: { ...visual, html: visual.html.replace('用一个小实验，换来真实证据', '从讨论走到行动') } },
    node('ce', '已有证据 · 信息常停留在聊天里', 'evidence', '示例观察：需要把分散信息组织成可讨论的对象。', 1880, 1100),
    node('cr', '需要验证 · 理解与操作是否更容易', 'risk', '图多并不自动意味着沟通更高效。', 1880, 1400),
  ];
  const groups = ['a', 'b', 'c'].map((id, i) => ({ id: `g${id}`, title: ['会议行动助手', '定价解释工具', '可执行讨论白板'][i], nodeIds: [id, `${id}e`, `${id}r`] }));
  return { version: '0.1', board: { id: 'semantic-test', title: '让布局帮助做选择', viewport: { x: 0, y: 0, zoom: 1 } }, nodes, groups, edges: [], metadata: {} };
}
const plan = { description: '先看共同问题，再横向比较三个方向；每个方向把证据与风险放在一起。', root: { direction: 'column', children: [{ nodeId: 'decision' }, { direction: 'row', children: ['a', 'b', 'c'].map(id => ({ groupId: `g${id}`, direction: 'column' })) }] } };
async function init(page: Page, board: unknown, configured = true) {
  await page.addInitScript(({ board, configured }) => {
    if (window.top !== window) return;
    if (!localStorage.getItem('agentboard.sessions')) localStorage.setItem('agentboard.sessions', JSON.stringify({ activeId: 's', sessions: [{ id: 's', title: '让布局帮助做选择', board, createdAt: 1, updatedAt: 1 }] }));
    if (configured) localStorage.setItem('agentboard.config', JSON.stringify({ provider: 'local-cli', cliId: 'pi' }));
  }, { board, configured });
  await page.route('**/api/clis**', route => route.fulfill({ json: configured ? [{ id: 'pi', name: 'Pi CLI', available: true, version: '1.4.0' }] : [] }));
  await page.goto('/');
  await expect(page.locator('.canvas-content')).not.toHaveClass(/presentation-settling/);
}
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('agentboard.sessions')!).sessions[0]);
async function respond(page: Page, value: unknown, requests: any[] = []) {
  await page.route('**/api/agent/run', route => { requests.push(route.request().postDataJSON()); return route.fulfill({ contentType: 'application/x-ndjson', body: JSON.stringify({ type: 'result', text: JSON.stringify(value) }) + '\n' }); });
}
const response = { type: 'dsl_patch', summary: '根据实际内容重组了空间关系，三个方向并排比较，证据与风险就近。', ops: [], presentation: { layout: 'auto', plan } };

test('smart layout reads content, changes only spatial structure and opens a readable map', async ({ page }) => {
  const requests: any[] = []; await respond(page, response, requests); await init(page, scenario());
  const before = await stored(page);
  await page.locator('.prompt-bar textarea').fill('保留这段未发送的想法');
  await page.getByRole('button', { name: '智能布局', exact: true }).click();
  await expect(page.locator('.semantic-map-node')).toHaveCount(10);
  expect(requests).toHaveLength(1); expect(requests[0].userMessage).toContain('用户会手动补清单'); expect(requests[0].userMessage).not.toContain('<script>');
  await expect(page.locator('.spatial-reading-note')).toContainText(plan.description);
  const after = await stored(page);
  const content = (nodes: any[]) => nodes.map(({ x, y, height, ...rest }) => rest);
  expect(content(after.board.nodes)).toEqual(content(before.board.nodes)); expect(after.board.groups).toEqual(before.board.groups); expect(after.board.edges).toEqual(before.board.edges);
  expect(after.history.past.length).toBe((before.history?.past?.length ?? 0) + 1);
  await expect(page.locator('.prompt-bar textarea')).toHaveValue('保留这段未发送的想法');
  await page.getByRole('button', { name: '关闭完成提示', exact: true }).click();
  await page.locator('.prompt-bar textarea').fill(''); await page.locator('.canvas-header').click({ position: { x: 450, y: 12 } });
  const canvas = (await page.locator('.semantic-map').boundingBox())!;
  const cards = await page.locator('.semantic-map-node').evaluateAll(es => es.map(e => { const r = e.getBoundingClientRect(), t = e.querySelector('strong')!; return { id: (e as HTMLElement).dataset.mapNodeId, x: r.x, y: r.y, right: r.right, bottom: r.bottom, font: Number.parseFloat(getComputedStyle(t).fontSize) }; }));
  for (const card of cards) { expect(card.x).toBeGreaterThanOrEqual(canvas.x); expect(card.right).toBeLessThanOrEqual(canvas.x + canvas.width); expect(card.y).toBeGreaterThanOrEqual(canvas.y); expect(card.bottom).toBeLessThan(canvas.y + canvas.height - 40); }
  const a = cards.find(n => n.id === 'a')!, b = cards.find(n => n.id === 'b')!, c = cards.find(n => n.id === 'c')!;
  expect(Math.abs(a.y - b.y)).toBeLessThan(2); expect(Math.abs(b.y - c.y)).toBeLessThan(2); expect(a.x).toBeLessThan(b.x); expect(b.x).toBeLessThan(c.x);
  await page.screenshot({ path: 'docs/verification/semantic-v037-comparison.png', animations: 'disabled' });
  await page.reload(); await expect(page.locator('.semantic-map-node')).toHaveCount(10);
  expect((await stored(page)).history.past.length).toBe(after.history.past.length);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect.poll(async () => (await stored(page)).board.metadata['agentboard.presentation']?.spatialPlan).toBeUndefined();
});

test('map details run the original interactive content and preserve state across close and reload', async ({ page }) => {
  await respond(page, response); await init(page, scenario()); await page.getByRole('button', { name: '智能布局', exact: true }).click();
  await expect(page.locator('.semantic-map-node')).toHaveCount(10);
  await page.getByRole('button', { name: '查看内容：方向 A · 会议行动助手', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '方向 A · 会议行动助手', exact: true }); await expect(dialog).toBeVisible();
  const frame = dialog.frameLocator('iframe'); await frame.locator('#people').focus(); await frame.locator('#people').press('End');
  await expect(frame.locator('#result')).toHaveText('20 位用户');
  await page.screenshot({ path: 'docs/verification/semantic-v037-detail.png', animations: 'disabled' });
  await dialog.getByRole('button', { name: '返回结构视图', exact: true }).click();
  await page.getByRole('button', { name: '查看内容：方向 A · 会议行动助手', exact: true }).click();
  await expect(dialog.frameLocator('iframe').locator('#people')).toHaveValue('20');
  await dialog.getByRole('button', { name: '返回结构视图', exact: true }).click();
  await page.reload(); await expect(page.locator('.semantic-map-node')).toHaveCount(10);
  await page.getByRole('button', { name: '查看内容：方向 A · 会议行动助手', exact: true }).click();
  await expect(page.getByRole('dialog').frameLocator('iframe').locator('#people')).toHaveValue('20');
  await page.getByRole('button', { name: '围绕这项继续讨论', exact: true }).click();
  await expect(page.locator('.prompt-bar textarea')).toBeFocused(); await expect(page.locator('.prompt-scope-button')).toContainText('方向 A');
});

test('spatial-only action cannot rewrite content or apply a stale plan', async ({ page }) => {
  const before = scenario(); await respond(page, { ...response, ops: [{ op: 'update_node', nodeId: 'decision', changes: { body: '不允许的改写' } }] });
  await init(page, before); await page.getByRole('button', { name: '智能布局', exact: true }).click();
  await expect(page.locator('.run-recovery')).toBeVisible();
  expect((await stored(page)).board.nodes[0].body).toBe(before.nodes[0].body);
  expect((await stored(page)).board.metadata['agentboard.presentation']?.spatialPlan).toBeUndefined();
});

test('new generation can provide its semantic composition in the same response', async ({ page }) => {
  const content = scenario(); await respond(page, { ...response, ops: [...content.nodes.map(node => ({ op: 'add_node', node })), ...content.groups.map(group => ({ op: 'add_group', group }))] });
  await init(page, { ...content, nodes: [], groups: [] }); await page.locator('.prompt-bar textarea').fill('帮我比较这几个产品方向'); await page.locator('.prompt-bar textarea').press('Enter');
  await expect(page.locator('.semantic-map-node')).toHaveCount(10);
  expect((await stored(page)).history.past).toHaveLength(1);
  await page.getByRole('button', { name: '内容', exact: true }).click(); await expect(page.locator('.board-node')).toHaveCount(10);
  await page.getByRole('button', { name: '结构', exact: true }).click(); await expect(page.locator('.semantic-map-node')).toHaveCount(10);
});

test('adding a card from the structure map opens the editable canvas and preserves the original nodes', async ({ page }) => {
  await respond(page, response); await init(page, scenario()); await page.getByRole('button', { name: '智能布局', exact: true }).click();
  await expect(page.locator('.semantic-map-node')).toHaveCount(10);
  await page.getByRole('button', { name: '+ 卡片', exact: true }).click();
  await expect(page.locator('.board-node')).toHaveCount(11); await expect(page.locator('.title-inline')).toBeFocused();
  await page.locator('.title-inline').fill('我补充的实际观察'); await page.locator('.title-inline').press('Enter');
  expect((await stored(page)).board.nodes.map((n: any) => n.title)).toContain('我补充的实际观察');
  await page.getByRole('button', { name: '结构', exact: true }).click(); await expect(page.locator('.semantic-map-node')).toHaveCount(11);
});

test('an argument gets a different spatial explanation, with evidence and risks on opposite sides', async ({ page }) => {
  const nodes = [node('e1', '证据 · 重复出现的需求', 'evidence', '示例观察，尚需扩大样本。'), node('e2', '证据 · 已有替代方案', 'evidence', '用户已经为问题投入时间。'), node('judgement', '判断 · 先做一个小实验', 'decision', '在证据充分前，保持投入可逆。'), node('risk', '风险 · 意愿不等于行为', 'risk', '记录实际操作，而不只记录口头评价。'), node('action', '下一步 · 交付最小结果', 'action', '与真实用户完成一次小范围交付。')];
  const edges = [{ id: 'e1j', from: 'e1', to: 'judgement', label: '支持' }, { id: 'e2j', from: 'e2', to: 'judgement', label: '支持' }, { id: 'rj', from: 'risk', to: 'judgement', type: 'line', label: '约束' }, { id: 'ja', from: 'judgement', to: 'action', label: '下一步' }];
  const argument = { description: '判断居中，左侧看证据、右侧看风险，下面接行动。', root: { direction: 'column', children: [{ direction: 'row', children: [{ direction: 'column', label: '支持证据', children: [{ nodeId: 'e1' }, { nodeId: 'e2' }] }, { nodeId: 'judgement' }, { direction: 'column', label: '待验证的风险', children: [{ nodeId: 'risk' }] }] }, { nodeId: 'action' }] } };
  await respond(page, { ...response, presentation: { layout: 'auto', plan: argument } }); await init(page, { ...scenario(), nodes, groups: [], edges });
  await page.getByRole('button', { name: '智能布局', exact: true }).click(); await expect(page.locator('.semantic-map-node')).toHaveCount(5);
  await page.getByRole('button', { name: '关闭完成提示', exact: true }).click();
  const left = (await page.locator('[data-map-node-id="e1"]').boundingBox())!, center = (await page.locator('[data-map-node-id="judgement"]').boundingBox())!, right = (await page.locator('[data-map-node-id="risk"]').boundingBox())!;
  expect(left.x).toBeLessThan(center.x); expect(center.x).toBeLessThan(right.x);
  await expect(page.locator('.semantic-map-edges > g')).toHaveCount(4);
  await page.screenshot({ path: 'docs/verification/semantic-v037-argument.png', animations: 'disabled' });
});

test('edits made while the model is planning cannot be overwritten by its stale result', async ({ page }) => {
  let release = () => {}; const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/agent/run', async route => { await gate; await route.fulfill({ contentType: 'application/x-ndjson', body: JSON.stringify({ type: 'result', text: JSON.stringify(response) }) + '\n' }).catch(() => {}); });
  try {
    await init(page, scenario()); await page.getByRole('button', { name: '智能布局', exact: true }).click();
    await expect(page.locator('.agent-run-overlay')).toBeVisible();
    await page.locator('[data-node-id="decision"] h2').dblclick();
    await page.locator('.title-inline').fill('工作期间更新的问题'); await page.locator('.title-inline').press('Enter');
    release(); await expect(page.locator('.run-recovery')).toBeVisible();
    expect((await stored(page)).board.nodes[0].title).toBe('工作期间更新的问题');
    expect((await stored(page)).board.metadata['agentboard.presentation']?.spatialPlan).toBeUndefined();
  } finally { release(); }
});

test('local structure fallback uses relationships and remains usable on a phone', async ({ page }) => {
  await init(page, scenario(), false); await page.getByRole('button', { name: '智能布局', exact: true }).click(); await expect(page.locator('.semantic-map-node')).toHaveCount(10);
  await expect(page.locator('.spatial-note-source')).toHaveText('根据已有关系整理');
  await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole('button', { name: '总览', exact: true }).click();
  await page.screenshot({ path: 'docs/verification/semantic-v037-mobile.png', animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '查看内容：先验证哪一个产品方向？', exact: true }).click(); await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '返回结构视图', exact: true }).click();
});

test('real CLI understands existing content and returns a spatial plan without rewriting it', async ({ page }) => {
  const cliId = process.env.AGENTBOARD_LIVE_SPATIAL;
  test.skip(!cliId, 'Opt in with AGENTBOARD_LIVE_SPATIAL=pi; uses model quota.'); test.setTimeout(300000);
  let content = scenario();
  if (process.env.AGENTBOARD_SPATIAL_SEED) content = JSON.parse(await readFile(process.env.AGENTBOARD_SPATIAL_SEED, 'utf8'));
  await page.addInitScript(({ board, cliId }) => { if (window.top !== window) return; localStorage.setItem('agentboard.config', JSON.stringify({ provider: 'local-cli', cliId })); localStorage.setItem('agentboard.sessions', JSON.stringify({ activeId: 'live', sessions: [{ id: 'live', title: '真实内容的空间组织', board, createdAt: 1, updatedAt: 1 }] })); }, { board: content, cliId });
  await page.goto('/'); await page.getByRole('button', { name: '智能布局', exact: true }).click();
  await expect(page.locator('.semantic-map-node, .run-recovery').first()).toBeVisible({ timeout: 240000 });
  await expect(page.locator('.run-recovery')).toHaveCount(0);
  await expect(page.locator('.semantic-map-node')).toHaveCount(content.nodes.length);
  const session = await stored(page);
  expect(session.board.nodes.map((n: any) => [n.id, n.title, n.body, n.visual])).toEqual(content.nodes.map(n => [n.id, n.title, n.body, (n as any).visual]));
  await mkdir('docs/verification', { recursive: true });
  await page.getByRole('button', { name: '关闭完成提示', exact: true }).click();
  await page.screenshot({ path: 'docs/verification/semantic-v037-live.png', animations: 'disabled' });
  await writeFile('docs/verification/semantic-v037-live.agentboard.json', JSON.stringify(session.board, null, 2));
  console.log(JSON.stringify({ cliId, nodes: content.nodes.length, spatialPlan: session.board.metadata['agentboard.presentation'].spatialPlan, unchangedContent: true }));
});
