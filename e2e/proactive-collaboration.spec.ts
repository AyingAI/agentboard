import { expect, test, type Page } from '@playwright/test';
import { createExplorationBoard } from '../src/data/exploration';
import type { BoardDSL, CollaborationState, DiscoveryDraft, ImpactItem } from '../src/types/dsl';
import { impactProjectContext, nodePrints, semanticPrint } from '../src/agent/discoveries';

const finding: DiscoveryDraft = { kind: 'connection', title: '客流与公共使用是两个问题', reason: '店主谈客流，居民谈停留条件；两种观察可以同时成立。', prepared: '候选角度：谁能在改造后的空间留下来？\n补充比较：商业客流与不消费时的公共使用。', nodeIds: ['question', 'material-a'], action: { label: '准备补访问题', prompt: '针对公共使用的证据缺口，准备三个补访问题。' } };

async function setup(page: Page, kind: 'research' | 'experience' = 'research', options: { jev?: boolean; state?: CollaborationState; board?: BoardDSL } = {}) {
  const board = options.board ?? createExplorationBoard(kind, kind === 'research' ? '老厂房改造之后，谁能留下来？' : '为建筑史初学者策划 90 分钟体验', '店主说客流增加，居民说座位减少。');
  await page.addInitScript(({ board, options }) => {
    if (localStorage.getItem('proactive-test-seeded')) return;
    localStorage.setItem('proactive-test-seeded', 'yes');
    localStorage.setItem('agentboard.sessions', JSON.stringify({ activeId: 'test-project', sessions: [{ id: 'test-project', title: board.board.title, board, createdAt: 1, updatedAt: 1, collaboration: options.state }] }));
    localStorage.setItem('agentboard.config', JSON.stringify({ provider: 'local-cli', cliId: 'codex', ...(options.jev ? { jev: { enabled: true, apiKey: 'test-key', model: 'jev-latest' } } : {}) }));
  }, { board, options });
  await page.route('**/api/clis*', route => route.fulfill({ json: [{ id: 'codex', name: 'Codex CLI', available: true }] }));
  await page.route('**/api/agent/run/*', route => route.fulfill({ status: 204 }));
}

function result(discoveries: DiscoveryDraft[] = [finding], impacts?: ImpactItem[]) {
  return { contentType: 'application/x-ndjson', body: JSON.stringify({ type: 'result', text: JSON.stringify({ type: 'discovery', understanding: '从已有材料与目标出发。', discoveries, impacts }) }) + '\n' };
}

async function openSuggestions(page: Page) {
  await page.getByRole('button', { name: '查看建议', exact: true }).click();
}

async function openAnalysisSettings(page: Page) {
  if (!(await page.getByRole('tab', { name: 'Agent 建议' }).isVisible())) {
    await page.getByRole('button', { name: /^历史/ }).click();
  }
  await page.getByRole('tab', { name: 'Agent 建议' }).click();
  await page.getByText('白板分析设置', { exact: true }).click();
}

for (const useJev of [true, false]) {
  test(`a change reviews existing outcomes and preserves the draft for review ${useJev ? 'with Jev' : 'without Jev'}`, async ({ page }) => {
    const board = createExplorationBoard('experience', '策划一次工业遗产体验', '原流程包含 25 分钟屋架观察、20 分钟拍照。');
    board.nodes.push({ ...board.nodes[0], id: 'plan', title: '90 分钟流程', body: '原定总长 90 分钟。', tags: ['output'], x: 390, y: 360 },
      { ...board.nodes[0], id: 'roof-card', title: '屋架观察卡', body: '画下一个连接点，观察卡没有固定时长。', tags: ['output'], x: 750, y: 360 });
    board.edges.push({ id: 'plan-source', from: 'material-a', to: 'plan' });
    const state: CollaborationState = { discoveries: [], constraints: '总时长 90 分钟' };
    state.checkedPrint = semanticPrint(board, state);
    state.checkedNodes = nodePrints(board);
    state.checkedContext = impactProjectContext(board, state);
    await setup(page, 'experience', { board, state, jev: useJev });
    let preflights = 0;
    const answer = (value: string, preference = .98) => ({ type: 'choice', choice: value, probabilities: { [value]: preference } });
    await page.route('**/api/jev/evaluate', route => {
      const request = route.request().postDataJSON().request;
      if (request.questions.impact_0) {
        preflights++;
        expect(request.state.current.constraints).toContain('60 分钟');
        return route.fulfill({ json: { answers: { impact_0: answer('revise'), impact_1: answer('verify', .78) } } });
      }
      return route.fulfill({ json: { answers: { evidence_0: answer('grounded'), constraints_0: answer('fits'), intent_0: answer('faithful') } } });
    });
    await page.route('**/api/agent/run', route => {
      const body: string = route.request().postDataJSON().userMessage;
      const context = JSON.parse(body.slice(body.indexOf('\n') + 1));
      expect(context.impact.context.previous.constraints).toBe('总时长 90 分钟');
      expect(context.impact.suggestedChecks.map((item: ImpactItem) => item.nodeId)).toEqual([]);
      return route.fulfill(result([{ ...finding, kind: 'impact', title: '60 分钟精简草案', reason: '合并独立拍照，保留屋架观察。', prepared: '把拍照放入观察任务，另留转场时间。', nodeIds: ['plan', 'material-a'] }], [
        { nodeId: 'plan', status: 'revise', reason: '90 分钟流程超出新的上限。', sourceIds: ['material-a'] },
        { nodeId: 'roof-card', status: 'keep', reason: '观察任务可以随流程调整时长。', sourceIds: [] },
      ]));
    });
    await page.goto('/');
    await openAnalysisSettings(page);
    await page.getByRole('button', { name: '目标与条件' }).click();
    await page.getByLabel(/受众、限制与必须保留/).fill('总时长最多 60 分钟，保留屋架观察。');
    await page.getByRole('button', { name: '保存目标与条件' }).click();
    const report = page.getByRole('region', { name: '这次变化影响了什么' });
    await expect(report.getByText('90 分钟流程超出新的上限。')).toBeVisible();
    await report.getByText('可以沿用').click();
    await expect(report.getByRole('button', { name: /屋架观察卡/ })).toBeVisible();
    await expect(page.locator('[data-node-id="plan"]')).toContainText('原定总长 90 分钟。');
    await report.getByRole('button', { name: /查看调整草案/ }).click();
    const draft = page.locator('.discovery').filter({ has: page.getByRole('heading', { name: '60 分钟精简草案' }) });
    await expect(draft).toBeFocused();
    await page.reload();
    await expect(page.locator('.composer-suggestion')).toContainText('60 分钟精简草案');
    expect(preflights).toBe(0);
  });
}

test('new material produces a prepared discovery without chatting or Jev, persists and can be adopted without looping', async ({ page }) => {
  await setup(page);
  let calls = 0;
  await page.route('**/api/agent/run', route => { calls++; expect(route.request().postDataJSON().purpose).toBe('discovery'); return route.fulfill(result()); });
  await page.goto('/');
  await expect(page.locator('.canvas-panel .collaboration-panel')).toHaveCount(0);
  await expect(page.locator('.composer-suggestion')).toContainText(finding.prepared);
  await openSuggestions(page);
  const panel = page.locator('.activity-panel').getByRole('region', { name: 'Agent 建议' });
  await expect(panel.getByText(finding.prepared)).toBeVisible();
  await expect(page.locator('.composer-suggestion')).toHaveCount(0);
  await expect(page.locator('.board-node')).toHaveCount(2);
  await page.reload();
  await openSuggestions(page);
  await panel.getByRole('button', { name: '保留到白板' }).click();
  await expect(page.locator('.board-node')).toHaveCount(3);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(page.locator('.board-node')).toHaveCount(2);
  await panel.getByRole('button', { name: '已处理与待复查 · 1' }).click();
  await expect(panel.getByText('已撤回保留')).toBeVisible();
  await panel.getByRole('button', { name: '重新保留' }).click();
  await expect(page.locator('.board-node')).toHaveCount(3);
  await page.waitForTimeout(2300);
  expect(calls).toBe(1);
  await expect(panel.getByRole('button', { name: '已处理与待复查 · 1' })).toBeVisible();
  await page.getByRole('button', { name: '整理选题提纲' }).click();
  await expect(page.getByRole('textbox', { name: '选题提纲' })).toHaveValue(/谁能在改造后的空间留下来/);
});

test('changed conditions invalidate old findings and continue into a reviewed task despite Jev failure', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, 'experience', { jev: true });
  const requests: any[] = [];
  const alternative: DiscoveryDraft = { ...finding, kind: 'impact', title: '60 分钟可以保留核心观察', reason: '新的时间限制需要缩短讲述，转场仍待核实。', prepared: '保留屋架观察，压缩重复讲述；实际转场时间仍待确认。', action: { label: '展开精简方案', prompt: '准备 60 分钟的体验草稿并标明待核实时间。' } };
  await page.route('**/api/jev/evaluate', route => route.fulfill({ status: 503, json: { error: 'unavailable' } }));
  await page.route('**/api/agent/run', route => {
    const request = route.request().postDataJSON(); requests.push(request);
    if (request.purpose === 'discovery') return route.fulfill(result(request.userMessage.includes('改为 60 分钟') ? [alternative, finding] : [finding]));
    return route.fulfill({ contentType: 'application/x-ndjson', body: JSON.stringify({ type: 'result', text: JSON.stringify({ type: 'dsl_patch', summary: '准备精简方案', ops: [{ op: 'add_node', node: { id: 'short-plan', type: 'note', title: '60 分钟方案', body: alternative.prepared, tags: ['output'], x: 500, y: 500, width: 300, height: 140 } }] }) }) + '\n' });
  });
  await page.goto('/');
  await openSuggestions(page);
  await page.getByText('白板分析设置', { exact: true }).click();
  await page.getByRole('button', { name: '目标与条件' }).click();
  await page.getByLabel(/受众、限制与必须保留/).fill('改为 60 分钟，必须保留屋架观察。');
  await page.getByRole('button', { name: '保存目标与条件' }).click();
  await expect(page.getByRole('heading', { name: alternative.title })).toBeVisible();
  await expect(page.getByText('Jev 暂时不可用，已保留主 Agent 的全部发现')).toHaveCount(0);
  await page.getByRole('button', { name: '展开精简方案' }).click();
  await expect(page.getByText('探索建议', { exact: true })).toBeVisible();
  expect(requests.at(-1).userMessage).toContain('改为 60 分钟');
  expect(requests.at(-1).userMessage).toContain(alternative.prepared);
  await page.getByRole('button', { name: '确认应用' }).click();
  await expect(page.locator('[data-node-id="short-plan"]')).toHaveCount(1);
});

test('a saved automatic cap allows manual analysis and can be removed in settings', async ({ page }) => {
  await setup(page, 'research', { state: { discoveries: [], dailyLimit: 1 } });
  let calls = 0;
  await page.route('**/api/agent/run', route => { calls++; return route.fulfill(result()); });
  await page.goto('/');
  await openSuggestions(page);
  await page.getByRole('button', { name: '暂不采用' }).click();
  await page.getByText('白板分析设置', { exact: true }).click();
  await page.getByRole('button', { name: '暂停自动分析', exact: true }).click();
  await page.reload();
  await openAnalysisSettings(page);
  await expect(page.getByRole('button', { name: '启用自动分析' })).toBeDisabled();
  await page.getByRole('button', { name: '已处理与待复查 · 1' }).click();
  await expect(page.getByText('暂不采用', { exact: true })).toBeVisible();
  await page.waitForTimeout(2300);
  expect(calls).toBe(1);
  await page.getByRole('button', { name: '手动分析一次' }).click();
  await expect.poll(() => calls).toBe(2);
  await expect(page.getByRole('button', { name: '手动分析一次' })).toBeEnabled();
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('agentboard.sessions')!).sessions[0].collaboration);
  expect(await stored()).toMatchObject({ enabled: false, budget: { calls: 1 }, dailyLimit: 1 });

  await page.getByRole('button', { name: '调整上限' }).click();
  await expect(page.getByText('达到上限后，当天仍可手动分析和对话。', { exact: false })).toBeVisible();
  await page.getByRole('checkbox', { name: '限制每日自动分析次数' }).uncheck();
  await page.getByRole('button', { name: '保存目标与条件' }).click();
  await expect(page.getByRole('button', { name: '启用自动分析' })).toBeEnabled();
  expect(await stored()).toMatchObject({ enabled: false, dailyLimit: null });
});

test('a late background result cannot enter another board', async ({ page }) => {
  await setup(page);
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/agent/run', async route => { await pending; await route.fulfill(result()).catch(() => {}); });
  await page.goto('/');
  await expect(page.getByText('Agent 正在分析白板', { exact: true })).toBeVisible();
  await page.getByTitle('新建白板', { exact: true }).click();
  release();
  await expect(page.getByRole('button', { name: /研究一个选题/ })).toBeVisible();
  await expect(page.locator('.composer-suggestion, .composer-analysis')).toHaveCount(0);
  const states = await page.evaluate(() => JSON.parse(localStorage.getItem('agentboard.sessions')!).sessions);
  expect(states.every((s: any) => !s.collaboration?.discoveries.length)).toBe(true);
});

test('failed analysis does not retry when typing stops, but can be retried explicitly', async ({ page }) => {
  await setup(page);
  let calls = 0;
  await page.route('**/api/agent/run', route => {
    calls++;
    return calls === 1 ? route.fulfill({ status: 503, json: { error: '验收服务暂不可用' } }) : route.fulfill(result());
  });
  await page.goto('/');
  await page.getByRole('button', { name: /^历史/ }).click();
  await page.getByRole('tab', { name: 'Agent 建议' }).click();
  await expect(page.getByText(/本地 CLI 调用失败.*验收服务暂不可用/)).toBeVisible();
  const composer = page.getByRole('textbox', { name: '描述你的想法' });
  await composer.fill('尚未发送的想法');
  await composer.fill('');
  await page.waitForTimeout(2300);
  expect(calls).toBe(1);
  await page.getByRole('button', { name: '重试分析' }).click();
  await expect(page.getByRole('heading', { name: finding.title })).toBeVisible();
  expect(calls).toBe(2);
});

test('an unsent draft is preserved and does not block discoveries after typing stops', async ({ page }) => {
  await setup(page);
  let calls = 0;
  await page.route('**/api/agent/run', route => { calls++; return route.fulfill(result()); });
  await page.goto('/');
  const composer = page.getByRole('textbox', { name: '描述你的想法' });
  await composer.fill('保留这个尚未发送的问题');
  await expect(page.locator('.composer-suggestion')).toContainText(finding.title, { timeout: 7000 });
  await expect(composer).toHaveValue('保留这个尚未发送的问题');
  expect(calls).toBe(1);
});

test('opening a freeform board stays quiet until a committed edit triggers suggestions', async ({ page }) => {
  const board = createExplorationBoard('research', '老厂房改造之后，谁能留下来？', '居民说座位减少。');
  board.metadata = {};
  await setup(page, 'research', { board });
  let calls = 0;
  await page.route('**/api/agent/run', route => { calls++; return route.fulfill(result()); });
  await page.clock.install();
  await page.goto('/');
  await page.clock.runFor(2000);
  expect(calls).toBe(0);
  await expect(page.locator('.composer-suggestion, .composer-analysis')).toHaveCount(0);
  const material = page.locator('[data-node-id="material-a"]');
  await material.getByRole('heading').dblclick();
  await material.getByRole('textbox').fill('居民关于座位的访谈');
  await material.getByRole('textbox').press('Enter');
  await page.clock.runFor(2000);
  await expect(page.locator('.composer-suggestion')).toContainText(finding.title);
  expect(calls).toBe(1);
});

test('legacy Jev settings never rank or review background discoveries', async ({ page }) => {
  await setup(page, 'research', { jev: true });
  const second = { ...finding, title: '另一条待核实的发现' };
  await page.route('**/api/agent/run', route => route.fulfill(result([second, finding])));
  let checks = 0;
  await page.route('**/api/jev/evaluate', route => { checks++; return route.fulfill({ status: 503 }); });
  await page.goto('/');
  await openSuggestions(page);
  await expect(page.locator('.discovery').first()).toContainText(second.title);
  await expect(page.locator('.discovery')).toHaveCount(2);
  expect(checks).toBe(0);
});
