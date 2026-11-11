import { expect, test, type Page } from '@playwright/test';
import { materialCard } from '../src/data/exploration';
import type { BoardDSL, BoardNode, DSLPatch } from '../src/types/dsl';

const card = (id: string, title: string, body: string, x: number, tags?: string[]): BoardNode => ({
  id, title, body, type: 'card', x, y: 180, width: 260, height: 140, tags,
});
const source = card('source', '居民访谈', '两位居民说周末免费座位减少。记录未提到具体时段。', 140, ['material']);
const board: BoardDSL = {
  version: '0.1', board: { id: 'study', title: '厂房研究', viewport: { x: 0, y: 0, zoom: 1 } },
  nodes: [source, card('intro', '文章开头', '这里是原来的开头。', 430), card('conclusion', '研究结论', '这里是原结论。', 720),
    card('method', '观察口径', '分开记录座位数量和访客意见。', 1010, ['material'])],
  edges: [], groups: [], metadata: {},
};
const original = '周末下午，两位居民说免费座位减少。';
const corrected = '两位居民说周末免费座位减少。';
const next = '这段记录未提到其他时段。';
const conclusion = '现有访谈未提供座位统计。';
const draft: DSLPatch = { type: 'dsl_patch', summary: '按访谈更新了开头和结论', ops: [
  { op: 'update_node', nodeId: 'intro', changes: { body: `${original}\n\n${next}` } },
  { op: 'update_node', nodeId: 'conclusion', changes: { body: conclusion } },
] };

async function setup(page: Page, mode: 'repair' | 'invalid' | 'disabled' | 'failure' | 'ignored' | 'stale' | 'cancel' | 'partial' | 'incomplete' | 'recheck-failure' | 'optout' | 'late-optin' | 'timeout' | 'source-write' | 'source-write-off' | 'source-edit', sourceNode = source) {
  await page.addInitScript(({ board, mode }) => {
    if (window.top !== window) return;
    localStorage.setItem('agentboard.config', JSON.stringify({ provider: 'local-cli', cliId: 'pi', jev: { enabled: false, apiKey: 'test-key', evidenceReview: !['disabled', 'late-optin', 'source-write-off'].includes(mode) || undefined } }));
    if (!localStorage.getItem('agentboard.sessions')) localStorage.setItem('agentboard.sessions', JSON.stringify({
      activeId: 'study', sessions: [{ id: 'study', title: board.board.title, board, createdAt: 1, updatedAt: 1, collaboration: { enabled: false, discoveries: [] } }],
    }));
  }, { board: { ...board, nodes: [sourceNode, ...board.nodes.slice(1)] }, mode });
  await page.route('**/api/clis**', route => route.fulfill({ json: [{ id: 'pi', name: 'Pi CLI', available: true }] }));
  let checks = 0;
  let repairs = 0;
  let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/jev/evaluate', async route => {
    checks++;
    const { state } = route.request().postDataJSON().request;
    expect(state.source).toBe(sourceNode.body);
    expect(Object.keys(state).sort()).toEqual(['claims', 'source']);
    if (mode === 'failure') return route.fulfill({ status: 503 });
    if (mode === 'cancel' || mode === 'timeout') await gate;
    if (mode === 'recheck-failure' && checks > 1) return route.fulfill({ status: 503 });
    const answers = Object.fromEntries(Object.entries(state.claims).map(([id, text]) => {
      const choice = text === original ? 'unsupported' : 'supported';
      return [id, { type: 'choice', choice, probabilities: { [choice]: 0.98 } }];
    }));
    if (mode === 'incomplete') Object.keys(answers).forEach(id => delete answers[id]);
    if (mode === 'partial' && checks === 1) Object.keys(answers).slice(1).forEach(id => delete answers[id]);
    await route.fulfill({ json: { model: 'test-jev', answers } }).catch(error => {
      if (mode !== 'cancel' && mode !== 'timeout' && mode !== 'optout') throw error;
    });
  });
  await page.route('**/api/agent/run/*', route => route.fulfill({ json: { status: 'cancelled' } }));
  await page.route('**/api/agent/run', async route => {
    const request = route.request().postDataJSON();
    if (mode === 'late-optin' && !request.purpose) await gate;
    let patch = mode.startsWith('source-') ? { ...draft, ops: [...draft.ops, { op: 'update_node' as const, nodeId: 'source', changes: { body: '修改后的原文。' } }] } : draft;
    if (request.purpose === 'evidence-repair') {
      repairs++;
      if (mode === 'optout') await gate;
      expect(request.userMessage).toContain(original);
      expect(request.userMessage).not.toContain(conclusion);
      patch = { type: 'dsl_patch', summary: '修正开头', ops: [
        { op: 'update_node', nodeId: 'claim_0', changes: mode === 'invalid' ? { body: corrected, title: '越界' } : { body: corrected } },
      ] };
    }
    await route.fulfill({ contentType: 'application/x-ndjson', body: JSON.stringify({ type: 'result', text: JSON.stringify(patch) }) + '\n' });
  });
  await page.goto('/');
  await page.locator('.prompt-bar textarea').fill(mode === 'ignored'
    ? '不要用「居民访谈」，更新文章开头和研究结论。'
    : mode === 'source-edit' ? '根据「居民访谈」更新文章开头和研究结论，同时修改「居民访谈」的正文。' : '根据「居民访谈」更新文章开头和研究结论，观察口径不变。');
  await page.locator('.prompt-bar textarea').press('Enter');
  return { counts: () => ({ checks, repairs }), release };
}

const previewButton = (page: Page) => page.getByRole('button', { name: '预览前后变化' });
const introCard = (page: Page) => page.locator('[data-node-id="intro"]');
const proposedIntro = (page: Page) => page.locator('.review-comparison').first().locator('.review-node').last();

test('a material card with only a link keeps the original preview and does not call JEV', async ({ page }) => {
  const linkCard = materialCard('source', 'https://example.com/interview', source.title, '', source.x, source.y);
  const calls = await setup(page, 'repair', linkCard);
  await previewButton(page).click();
  await expect(proposedIntro(page)).toContainText(original);
  await expect(page.getByRole('dialog')).toHaveCount(1);
  expect(calls.counts()).toEqual({ checks: 0, repairs: 0 });
});

test('an opted-in linked edit corrects only the flagged sentence and shares preview, apply and undo', async ({ page }) => {
  const calls = await setup(page, 'repair');
  await previewButton(page).click();
  await expect(introCard(page)).toContainText('这里是原来的开头。');
  await expect(proposedIntro(page)).toContainText(corrected);
  await expect(proposedIntro(page)).toContainText(next);
  await expect(proposedIntro(page)).not.toContainText(original);
  await expect(page.locator('.review-comparison').nth(1)).toContainText(conclusion);
  expect(calls.counts()).toEqual({ checks: 2, repairs: 1 });
  await page.getByRole('dialog').getByRole('button', { name: '确认应用' }).click();
  await expect(introCard(page)).toContainText(corrected);
  await page.locator('.patch-result-toast').getByRole('button', { name: '撤销', exact: true }).click();
  await expect(introCard(page)).toContainText('这里是原来的开头。');
});

for (const mode of ['invalid', 'disabled', 'failure', 'ignored'] as const) {
  test(`the existing preview stays available when evidence review is ${mode}`, async ({ page }) => {
    const calls = await setup(page, mode);
    await previewButton(page).click();
    await expect(proposedIntro(page)).toContainText(original);
    if (mode === 'invalid') {
      await expect(page.getByText(/应用前请核对这处说法/)).toBeVisible();
      await expect(page.getByText('越界')).toHaveCount(0);
    } else await expect(page.getByText(/应用前请核对这处说法/)).toHaveCount(0);
    expect(calls.counts()).toEqual({ checks: mode === 'disabled' || mode === 'ignored' ? 0 : 1, repairs: mode === 'invalid' ? 1 : 0 });
  });
}

test('a reviewed proposal restored after refresh rejects a change to its source', async ({ page }) => {
  await setup(page, 'stale');
  await expect(previewButton(page)).toBeVisible();
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('agentboard.sessions')!);
    data.sessions[0].board.nodes.find((node: BoardNode) => node.id === 'source').body = '用户替换了访谈资料。';
    localStorage.setItem('agentboard.sessions', JSON.stringify(data));
  });
  await page.reload();
  await previewButton(page).click();
  await page.getByRole('dialog').getByRole('button', { name: '确认应用' }).click();
  await expect(introCard(page)).toContainText('这里是原来的开头。');
  await expect(previewButton(page)).toHaveCount(0);
});

test('stopping during evidence review prevents a later repair or proposal', async ({ page }) => {
  const calls = await setup(page, 'cancel');
  await expect.poll(() => calls.counts().checks).toBe(1);
  await page.getByRole('button', { name: '停止生成', exact: true }).click();
  calls.release();
  await expect(page.getByRole('button', { name: '停止生成', exact: true })).toHaveCount(0);
  await expect(previewButton(page)).toHaveCount(0);
  await expect(introCard(page)).toContainText('这里是原来的开头。');
  expect(calls.counts().repairs).toBe(0);
});

for (const mode of ['partial', 'incomplete', 'recheck-failure'] as const) {
  test(`a ${mode} response retains one usable preview with honest diagnostics`, async ({ page }) => {
    const calls = await setup(page, mode);
    await previewButton(page).click();
    await expect(proposedIntro(page)).toContainText(mode === 'partial' ? corrected : original);
    expect(calls.counts()).toEqual({ checks: mode === 'incomplete' ? 1 : 2, repairs: mode === 'incomplete' ? 0 : 1 });
    const events = await page.evaluate(() => JSON.parse(localStorage.getItem('agentboard.task-events.v1')!));
    expect(events.some((e: any) => e.stage === 'evidence' && e.outcome === 'partial')).toBe(mode !== 'recheck-failure');
    if (mode === 'recheck-failure') await expect(page.getByRole('note')).toContainText(original);
    await expect(page.getByRole('dialog')).toHaveCount(1);
  });
}

test('an initial check timeout returns the draft without a second call or user question', async ({ page }) => {
  await page.clock.install();
  const calls = await setup(page, 'timeout');
  await expect.poll(() => calls.counts().checks).toBe(1);
  await page.clock.runFor(2600);
  await previewButton(page).click();
  await expect(proposedIntro(page)).toContainText(original);
  expect(calls.counts()).toEqual({ checks: 1, repairs: 0 });
  calls.release();
  await expect(proposedIntro(page)).toContainText(original);
});

test('switching the setting off during repair preserves the issue and source conflict protection', async ({ page }) => {
  const calls = await setup(page, 'optout');
  await expect.poll(() => calls.counts().repairs).toBe(1);
  await page.getByRole('button', { name: 'Agent 设置', exact: true }).click();
  await page.getByRole('switch', { name: '启用交付前核对依据' }).click();
  await page.keyboard.press('Escape');
  await previewButton(page).click();
  await expect(proposedIntro(page)).toContainText(original);
  await expect(page.getByRole('note')).toContainText(original);
  calls.release();
  await expect(proposedIntro(page)).toContainText(original);
  const persisted = await page.evaluate(() => {
    const session = JSON.parse(localStorage.getItem('agentboard.sessions')!).sessions[0];
    return Object.values(session.runs).map((run: any) => run.pendingProposal).find(Boolean) as any;
  });
  expect(persisted.evidenceSourceId).toBe('source');
  expect(persisted.evidenceIssues).toHaveLength(1);
});

test('enabling evidence review during generation does not send the current task’s source', async ({ page }) => {
  const calls = await setup(page, 'late-optin');
  await expect(page.getByRole('button', { name: '停止生成', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Agent 设置', exact: true }).click();
  const setting = page.getByRole('switch', { name: '启用交付前核对依据' });
  await setting.click();
  await expect(setting).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  calls.release();
  await previewButton(page).click();
  await expect(proposedIntro(page)).toContainText(original);
  expect(calls.counts()).toEqual({ checks: 0, repairs: 0 });
  const events = await page.evaluate(() => JSON.parse(localStorage.getItem('agentboard.task-events.v1')!));
  expect(events).toContainEqual(expect.objectContaining({ stage: 'review', outcome: 'skipped', eligible: true, reason: 'configuration_changed' }));
});


for (const mode of ['source-write', 'source-write-off'] as const) {
  test(`a research draft cannot rewrite its source when review is ${mode}`, async ({ page }) => {
    const calls = await setup(page, mode);
    await expect(page.getByRole('status', { name: '生成恢复' })).toBeVisible();
    await expect(previewButton(page)).toHaveCount(0);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('agentboard.sessions')!).sessions[0]);
    expect(saved.board.nodes.find((n: BoardNode) => n.id === 'source').body).toBe(source.body);
    expect(calls.counts()).toEqual({ checks: 0, repairs: 0 });
  });
}

test('explicitly editing a source remains available and skips source checking', async ({ page }) => {
  const calls = await setup(page, 'source-edit');
  await previewButton(page).click();
  await page.getByRole('dialog').getByRole('button', { name: '确认应用', exact: true }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('agentboard.sessions')!).sessions[0]);
  expect(saved.board.nodes.find((n: BoardNode) => n.id === 'source').body).toBe('修改后的原文。');
  expect(calls.counts()).toEqual({ checks: 0, repairs: 0 });
});
