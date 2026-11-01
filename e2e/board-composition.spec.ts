import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const card = (id: string, title: string, x: number, y: number, width = 320, body = '记录真实观察，保留判断依据。\n把不确定的地方变成可执行的下一步。') => ({ id, title, type: 'card', body, x, y, width, height: 150, createdBy: 'agent' });
function richVisual(kind: 'table' | 'choices' | 'plan') {
  const content = kind === 'table' ? `<h2>先对比，再做选择</h2><p>布局验证场景 · 以下数据为示例</p><table><thead><tr><th>方向</th><th>投入</th><th>验证方式</th></tr></thead><tbody>${['线下体验', '远程咨询', '小型工具', '内容订阅'].map((name, i) => `<tr><td><strong>${name}</strong><small>从最小的真实需求开始</small></td><td><span class="bar" style="width:${40 + i * 13}%"></span><small>约 ${2 + i} 天 · 示例</small></td><td>先收集证据<br><small>再决定是否继续</small></td></tr>`).join('')}</tbody></table><footer>对比的是路径，不是替你做决定。</footer>`
    : kind === 'choices' ? `<h2>把候选方向摊开看</h2><p>点击一个方向，记录你想先验证的假设。</p><div class="grid">${['目标人群', '真实痛点', '最小方案', '付费动机', '验证渠道', '成功信号'].map((name, i) => `<button type="button" onclick="document.querySelectorAll('button').forEach(b=>b.classList.remove('active'));this.classList.add('active');agentboard.setState({choice:'${name}'})"><small>0${i + 1}</small><strong>${name}</strong><span>从具体行为开始，而不是停留在想象。</span></button>`).join('')}</div><footer>示例交互 · 你的选择会保留在卡片中。</footer>`
    : `<h2>用三天换来真实反馈</h2><p>先做一个小实验，让下一步有据可依。</p>${['找到 5 位目标用户', '交付一个最小结果', '复盘证据，决定去留'].map((name, i) => `<section><b>DAY 0${i + 1}</b><h3>${name}</h3><p>记录发生了什么、用户做了什么，以及还不知道什么。</p></section>`).join('')}<label><input id="done" type="checkbox"> 我已经完成第一轮访谈</label><footer>布局验证场景 · 示例计划</footer>`;
  return `<style>*{box-sizing:border-box}body{padding:22px;font:13px/1.7 system-ui;color:#435570;background:#fff;margin:0}h2{font-size:20px;letter-spacing:-.03em;color:#263850;margin:0 0 4px}p{color:#8b9bb0;font-size:12px;margin:0 0 22px}table{width:100%;border-collapse:collapse}th{background:#f3f6fb;font-size:10px;text-align:left;color:#8b9cb4;padding:10px}td{padding:15px 10px;border-bottom:1px solid #edf1f7;width:33%}small{display:block;font-size:10px;color:#92a2b8;font-weight:400}strong{display:block;font-size:12px}.bar{display:block;height:5px;background:#6e97cc;border-radius:4px;margin:6px 0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}button{padding:15px;background:#f7f9fd;border:1px solid #e1e8f3;text-align:left;color:#4d6587;border-radius:9px;cursor:pointer}button strong{margin:5px 0}button span{font-size:11px;color:#8b9db8}button.active{border-color:#718fbd;background:#eaf1fc}footer{font-size:10px;color:#9cabc0;margin-top:20px}section{border-left:2px solid #ccdbef;padding:10px 18px;background:#f7f9fd;margin:12px 0}section b{font-size:10px;color:#93a7c2}section h3{font-size:13px;margin:4px 0}section p{font-size:11px;margin:0}label{font-size:11px;color:#6c829f}</style>${content}`;
}
const scenario = () => {
  const nodes = [
    { ...card('compare', '广度比较：四种选择，先看差异', 80, 100, 740, '把投入、反馈周期和验证方式放在一起比较。'), tags: ['concept'], visual: { html: richVisual('table'), state: {}, height: 400 } },
    { ...card('risk', '先识别三个风险', 80, 800, 320, '用户说喜欢，不等于愿意使用。\n一时的热情，不等于持续的需求。\n用可观察的行为代替主观评分。'), type: 'note', tags: ['risk'] },
    { ...card('directions', '候选方向：把可能性摆到桌面上', 920, 1200, 740, '从一个清晰的假设出发，不急着选最终答案。'), tags: ['concept'], visual: { html: richVisual('choices'), state: {}, height: 480 } },
    { ...card('evidence', '先收证据，再放大投入', 920, 2000, 320, '找具体的人，问过去真实发生的事。\n记下付出的时间、金钱和替代方案。'), tags: ['evidence'] },
    { ...card('assumption', '把未知写出来', 920, 2250, 320, '假设：用户遇到问题的频次足够高。\n待验证：他们是否已经主动找过解决办法。'), type: 'note', tags: ['assumption'] },
    { ...card('plan', '从计划到行动：三天最小验证', 1760, 2700, 740, '实验越小，越容易得到可以行动的反馈。'), tags: ['action'], visual: { html: richVisual('plan'), state: {}, height: 420 } },
    { ...card('decision', '事先约定判断标准', 1760, 3400, 320, '继续：出现真实使用和后续请求。\n调整：问题存在，方案仍不匹配。\n暂停：证据不足时继续收集，不急着下结论。'), tags: ['decision'] },
  ];
  const groups = [
    { id: 'compare-group', title: '看清选择', nodeIds: ['compare', 'risk'] },
    { id: 'direction-group', title: '找到值得验证的方向', nodeIds: ['directions', 'evidence', 'assumption'] },
    { id: 'plan-group', title: '开始小步行动', nodeIds: ['plan', 'decision'] },
  ];
  return { version: '0.1', board: { id: 'composition', title: '从想法到验证 · 布局测试', viewport: { x: 0, y: 0, zoom: 1 } }, nodes, groups, edges: [], metadata: {} };
};
async function init(page: Page, board: unknown) {
  await page.addInitScript(board => {
    if (window.top !== window) return;
    if (!localStorage.getItem('agentboard.sessions')) localStorage.setItem('agentboard.sessions', JSON.stringify({ activeId: 's', sessions: [{ id: 's', title: '从想法到验证 · 布局测试', board, createdAt: 1, updatedAt: 1 }] }));
    localStorage.setItem('agentboard.config', JSON.stringify({ provider: 'local-cli', cliId: 'pi' }));
  }, board);
  await page.route('**/api/clis**', route => route.fulfill({ json: [{ id: 'pi', name: 'Pi CLI', available: true, version: '1.4.0' }] }));
  await page.goto('/');
}
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('agentboard.sessions')!).sessions[0]);
async function settled(page: Page, count: number) {
  await expect.poll(async () => (await page.locator('.board-node').count()) + (await page.locator('.semantic-map-node').count())).toBe(count);
  await expect(page.locator('.canvas-content.presentation-settling')).toHaveCount(0);
  if (await page.locator('.semantic-map-node').count()) await page.getByRole('button', { name: '内容', exact: true }).click();
  await expect(page.locator('.board-node')).toHaveCount(count);
  await expect(page.locator('.canvas-content')).not.toHaveClass(/presentation-settling/);
}
async function collisionCount(page: Page, selector = '.board-node') {
  return page.locator(selector).evaluateAll(elements => {
    const boxes = elements.map(e => e.getBoundingClientRect());
    return boxes.flatMap((a, i) => boxes.slice(i + 1).filter(b => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1)).length;
  });
}
async function respond(page: Page, patch: unknown) {
  await page.route('**/api/agent/run', route => route.fulfill({ contentType: 'application/x-ndjson', body: JSON.stringify({ type: 'result', text: JSON.stringify(patch) }) + '\n' }));
}
async function submit(page: Page, text = '整理清楚这个想法') {
  await page.locator('.prompt-bar textarea').fill(text); await page.locator('.prompt-bar textarea').press('Enter');
}

test('legacy staircase is repaired once with readable sections, persistent visuals and undo', async ({ page }) => {
  const before = scenario(); await init(page, before); await settled(page, 7);
  await expect.poll(async () => (await stored(page)).history?.past?.length).toBe(1);
  const first = await stored(page);
  expect(first.board.nodes[0].x).toBe(first.board.nodes[2].x);
  expect(first.board.nodes[2].x).toBe(first.board.nodes[5].x);
  expect(first.board.nodes[0].y).toBe(first.board.nodes[1].y);
  expect(await collisionCount(page)).toBe(0);
  expect(await collisionCount(page, '.group-boundary')).toBe(0);
  expect(Number((await page.locator('.canvas-zoom-value').innerText()).replace('%', ''))).toBeGreaterThanOrEqual(80);
  await page.screenshot({ path: 'docs/verification/composition-v036-reading.png', animations: 'disabled' });
  await page.getByRole('button', { name: '总览', exact: true }).click();
  const canvas = (await page.locator('.board-canvas').boundingBox())!;
  const boxes = await page.locator('.group-boundary').evaluateAll(es => es.map(e => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, right: b.right, bottom: b.bottom }; }));
  for (const box of boxes) { expect(box.x).toBeGreaterThanOrEqual(canvas.x); expect(box.right).toBeLessThanOrEqual(canvas.x + canvas.width); expect(box.y).toBeGreaterThanOrEqual(canvas.y); expect(box.bottom).toBeLessThan(canvas.y + canvas.height); }
  await page.screenshot({ path: 'docs/verification/composition-v036-overview.png', animations: 'disabled' });
  await expect(page.getByRole('button', { name: '进入板块：找到值得验证的方向', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '进入板块：找到值得验证的方向', exact: true }).click();
  await expect(page.locator('.board-overview-labels')).toHaveCount(0);
  await expect(page.locator('[data-node-id="directions"]')).toBeInViewport();
  await page.getByTitle('阅读找到值得验证的方向', { exact: true }).click();
  await expect(page.locator('[data-node-id="directions"]')).toBeInViewport();
  const visual = page.locator('[data-node-id="directions"]').frameLocator('iframe');
  await visual.getByRole('button', { name: /真实痛点/ }).click();
  await expect.poll(async () => (await stored(page)).board.nodes.find((n: any) => n.id === 'directions').visual.state.choice).toBe('真实痛点');
  const interactionHistoryLength = (await stored(page)).history.past.length;
  await page.reload(); await settled(page, 7);
  const reloaded = await stored(page);
  expect(reloaded.board.nodes.map((n: any) => [n.x, n.y])).toEqual(first.board.nodes.map((n: any) => [n.x, n.y]));
  expect(reloaded.history.past).toHaveLength(interactionHistoryLength);
  for (let i = 0; i < interactionHistoryLength; i++) await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect.poll(async () => (await stored(page)).board.nodes[2].x).toBe(before.nodes[2].x);
  await respond(page, { type: 'dsl_patch', summary: '按内容关系智能布局', ops: [], presentation: { layout: 'auto', plan: { description: '三个板块并列，便于比较。', root: { direction: 'row', children: before.groups.map(group => ({ groupId: group.id, direction: 'column' })) } } } });
  await page.getByRole('button', { name: '智能布局', exact: true }).click();
  await expect(page.locator('.semantic-map-node')).toHaveCount(7);
  await expect.poll(async () => (await stored(page)).board.nodes[2].x).not.toBe(before.nodes[2].x);
  await expect(page.getByRole('button', { name: '重做', exact: true })).toBeDisabled();
});

test('new model content composes automatically, reflows measured revisions and shares the agent undo', async ({ page }) => {
  const content = scenario();
  await respond(page, { type: 'dsl_patch', summary: '布局验证：模拟模型返回七张卡片。', ops: [...content.nodes.map(node => ({ op: 'add_node', node })), ...content.groups.map(group => ({ op: 'add_group', group }))] });
  await init(page, { ...content, nodes: [], groups: [] }); await submit(page); await settled(page, 7);
  await expect(page.locator('.patch-result-toast')).toBeVisible();
  expect(await collisionCount(page, '.group-boundary')).toBe(0);
  const before = await stored(page); expect(before.history.past).toHaveLength(1);
  const oldY = before.board.nodes[1].y;
  await page.getByRole('button', { name: '关闭完成提示', exact: true }).click();
  await respond(page, { type: 'dsl_patch', summary: '补充更长的说明。', ops: [{ op: 'update_node', nodeId: 'compare', changes: { body: '这里保留完整证据，让后面的板块随真实尺寸顺延。\n'.repeat(30) } }] });
  await submit(page, '把第一张卡片说明展开');
  await expect(page.locator('.patch-proposal-toast')).toBeVisible();
  await page.locator('.patch-proposal-toast').getByRole('button', { name: '预览前后变化', exact: true }).click();
  await page.locator('.patch-review-dialog').getByRole('button', { name: '确认应用', exact: true }).click();
  await expect.poll(async () => (await stored(page)).board.nodes[1].y).toBeGreaterThan(oldY);
  expect(await collisionCount(page, '.group-boundary')).toBe(0);
  expect(await collisionCount(page)).toBe(0);
  const revised = await stored(page); expect(revised.history.past).toHaveLength(2);
  await page.locator('.patch-result-toast').getByRole('button', { name: '撤销', exact: true }).click();
  await expect.poll(async () => (await stored(page)).board.nodes[1].y).toBe(oldY);
});

test('explicit spatial intent remains a mindmap, and manual cards stay anchored on follow-up', async ({ page }) => {
  const nodes = Array.from({ length: 6 }, (_, i) => card(`n${i}`, `主题 ${i}`, 80, 80));
  const content = { ...scenario(), nodes: [], groups: [] };
  await respond(page, { type: 'dsl_patch', summary: '思维导图', ops: [...nodes.map(node => ({ op: 'add_node', node })), { op: 'layout', algorithm: 'mindmap', scope: 'changed' }] });
  await init(page, content); await submit(page, '画一个思维导图'); await settled(page, 6);
  const initial = await stored(page);
  expect(new Set(initial.board.nodes.map((n: any) => n.x)).size).toBeGreaterThan(2);
  expect(await collisionCount(page)).toBe(0);
  const oldPositions = initial.board.nodes.map((n: any) => [n.id, n.x, n.y]);
  await respond(page, { type: 'dsl_patch', summary: '增加一张补充卡片', ops: [{ op: 'add_node', node: card('new', '补充证据', 80, 80) }] });
  await submit(page, '增加一张证据卡片'); await settled(page, 7);
  expect((await stored(page)).board.nodes.slice(0, 6).map((n: any) => [n.id, n.x, n.y])).toEqual(oldPositions);
  expect(await collisionCount(page)).toBe(0);
});

test('branched flows use measured directional layers and section navigation fits a narrow screen', async ({ page }) => {
  const nodes = ['start', 'left', 'right', 'end'].map((id, i) => card(id, ['理解目标', '收集证据', '设计实验', '判断与行动'][i], 80, 80, 300, ('保留完整的信息，让流程读起来更自然。\n').repeat(i === 2 ? 10 : 2)));
  const edges = [['start', 'left'], ['start', 'right'], ['left', 'end'], ['right', 'end']].map(([from, to], i) => ({ id: `e${i}`, from, to, type: 'arrow' }));
  await respond(page, { type: 'dsl_patch', summary: '分支流程验证场景', ops: [...nodes.map(node => ({ op: 'add_node', node })), ...edges.map(edge => ({ op: 'add_edge', edge })), { op: 'layout', algorithm: 'dagre', scope: 'changed' }] });
  await init(page, { ...scenario(), nodes: [], groups: [] }); await submit(page, '把执行过程画成流程图'); await settled(page, 4);
  const flow = (await stored(page)).board;
  for (const edge of edges) {
    const source = flow.nodes.find((n: any) => n.id === edge.from), target = flow.nodes.find((n: any) => n.id === edge.to);
    expect(target.y).toBeGreaterThan(source.y + source.height);
  }
  expect(await collisionCount(page)).toBe(0);
  await page.getByRole('button', { name: '总览', exact: true }).click();
  await page.screenshot({ path: 'docs/verification/composition-v036-flow.png', animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'docs/verification/composition-v036-mobile.png', animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole('button', { name: '智能布局', exact: true })).toBeVisible();
});

test('dragging opts out of global reflow, and later additions preserve the manual arrangement', async ({ page }) => {
  const content = { ...scenario(), nodes: [], groups: [] };
  const nodes = [card('a', '第一张卡片', 80, 80), card('b', '第二张卡片', 80, 80)];
  await respond(page, { type: 'dsl_patch', summary: '两张卡片', ops: nodes.map(node => ({ op: 'add_node', node })) });
  await init(page, content); await submit(page); await settled(page, 2);
  await page.getByRole('button', { name: '关闭完成提示', exact: true }).click();
  const header = (await page.locator('[data-node-id="a"] > h2').boundingBox())!;
  await page.mouse.move(header.x + 40, header.y + 10); await page.mouse.down();
  await page.mouse.move(header.x + 40, header.y + 110, { steps: 6 }); await page.mouse.up();
  const moved = (await stored(page)).board.nodes;
  expect(moved[0].y).toBeGreaterThan(moved[1].y);
  await respond(page, { type: 'dsl_patch', summary: '新增一张卡片', ops: [{ op: 'add_node', node: card('c', '补充证据', 80, 80) }] });
  await submit(page, '增加一张证据卡片'); await settled(page, 3);
  const added = (await stored(page)).board.nodes;
  expect(added.slice(0, 2).map((n: any) => [n.x, n.y])).toEqual(moved.map((n: any) => [n.x, n.y]));
  expect(await collisionCount(page)).toBe(0);
  await page.reload(); await settled(page, 3);
  expect((await stored(page)).board.nodes.map((n: any) => [n.x, n.y])).toEqual(added.map((n: any) => [n.x, n.y]));
});

test('a model can preserve custom spatial meaning outside the named layout patterns', async ({ page }) => {
  const nodes = [card('center', '自定义空间：中间的想法', 600, 500), card('above', '上方的观察', 600, 80), card('left', '左侧的可能', 80, 500), card('right', '右侧的可能', 1120, 500)];
  await respond(page, { type: 'dsl_patch', summary: '保留这组自定义空间关系', presentation: { layout: 'preserve' }, ops: nodes.map(node => ({ op: 'add_node', node })) });
  await init(page, { ...scenario(), nodes: [], groups: [] }); await submit(page); await settled(page, 4);
  const positions = (await stored(page)).board.nodes.map((n: any) => [n.id, n.x, n.y]);
  expect(positions).toEqual(nodes.map(n => [n.id, n.x, n.y]));
  expect(await collisionCount(page)).toBe(0);
  await page.reload(); await settled(page, 4);
  expect((await stored(page)).board.nodes.map((n: any) => [n.id, n.x, n.y])).toEqual(positions);
  await respond(page, { type: 'dsl_patch', summary: '重新理解空间关系', ops: [], presentation: { layout: 'auto', plan: { description: '核心问题与相关方向。', root: { direction: 'orbit', children: nodes.map(node => ({ nodeId: node.id })) } } } });
  await page.getByRole('button', { name: '智能布局', exact: true }).click();
  await expect.poll(async () => (await stored(page)).board.nodes.map((n: any) => [n.x, n.y])).not.toEqual(nodes.map(n => [n.x, n.y]));
});

test('a real CLI generates a mixed visual board with a usable automatic composition', async ({ page }) => {
  const cliId = process.env.AGENTBOARD_LIVE_COMPOSITION;
  test.skip(!cliId, 'Opt in with AGENTBOARD_LIVE_COMPOSITION=pi; uses the installed CLI and model quota.');
  test.setTimeout(300000);
  await page.addInitScript(cliId => { if (window.top === window) localStorage.setItem('agentboard.config', JSON.stringify({ provider: 'local-cli', cliId })); }, cliId!);
  await page.goto('/');
  await submit(page, '这是 AgentBoard 的真实排版验证。请只根据现有信息创建一个可操作的白板，解释如何把产品想法变成可验证的行动。不读文件、不调用任何工具、不修改仓库，不需要外部事实。分为「看清选择」和「开始小步验证」两个分组，每组至少一张宽约740的交互视觉卡片和一张宽约320的短说明便签。交互形式和内容由你决定，展示清楚的示例或假设，使用自包含HTML，不加载远程依赖。每张视觉有一个可操作的控件，并保存状态。给出清楚的标题和阅读顺序，不需要在回复中安排用户确认。请直接返回完整合法的DSLPatch。');
  await expect(page.locator('.patch-result-toast, .run-recovery, .interaction-toast').first()).toBeVisible({ timeout: 240000 });
  await expect(page.locator('.run-recovery, .interaction-toast')).toHaveCount(0);
  await expect.poll(() => page.locator('.board-node.visual-node').count()).toBeGreaterThanOrEqual(2);
  const count = await page.locator('.board-node').count(); await settled(page, count);
  await expect(page.locator('.visual-frame.is-loading')).toHaveCount(0);
  expect(await collisionCount(page)).toBe(0);
  expect(await collisionCount(page, '.group-boundary')).toBe(0);
  expect(Number((await page.locator('.canvas-zoom-value').innerText()).replace('%', ''))).toBeGreaterThanOrEqual(80);
  const session = await stored(page);
  expect(session.board.groups.length).toBeGreaterThanOrEqual(2);
  await mkdir('docs/verification', { recursive: true });
  await page.getByRole('button', { name: '关闭完成提示', exact: true }).click();
  await page.getByTitle(`阅读${session.board.groups[0].title}`, { exact: true }).click();
  await page.screenshot({ path: 'docs/verification/composition-v036-live.png', animations: 'disabled' });
  await page.getByRole('button', { name: '总览', exact: true }).click();
  await page.screenshot({ path: 'docs/verification/composition-v036-live-overview.png', animations: 'disabled' });
  await writeFile('docs/verification/composition-v036-live.agentboard.json', JSON.stringify(session.board, null, 2));
  console.log(JSON.stringify({ cliId, nodes: count, groups: session.board.groups.length, visualCards: await page.locator('.board-node.visual-node').count(), collisions: 0 }));
});
