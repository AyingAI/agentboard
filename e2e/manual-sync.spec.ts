import { expect, test, type Page } from '@playwright/test';
import type { BoardDSL, BoardNode, CollaborationState, DiscoveryDraft, ImpactItem } from '../src/types/dsl';
import { impactProjectContext, mergeDiscoveries, nodePrints, semanticPrint } from '../src/agent/discoveries';

const originalRule = '社群工作坊需要登记照，完成登记后入场。';
const newRule = '社群工作坊拍照完全自愿。不拍照也能报名和入场。';
const oldOffline = '社群工作坊断网时，把登记照贴在纸表上，资料齐全才发入场码。';
const newOffline = '社群工作坊断网时核对姓名后发纸质入场码。拍照完全自愿，不影响发码。';
const preparedDiscovery: DiscoveryDraft = { kind: 'impact', title: '备用流程还要求留照', reason: '招募规则和发码前提不一致。',
  prepared: newOffline, nodeIds: ['rule', 'offline'], action: { label: '同步备用流程', prompt: '把备用纸质流程按最新规则修订，保留用户刚改的工作坊规则。' } };
const reviseOffline: ImpactItem = { nodeId: 'offline', status: 'revise', reason: '仍把留照作为发码前提。', sourceIds: ['rule'] };
const node = (id: string, title: string, body: string, x = 40): BoardNode => ({ id, title, body, type: 'card', x, y: 170, width: 300, height: 150, tags: ['output'] });
const board: BoardDSL = {
  version: '0.1', board: { id: 'manual-workshop', title: '工作坊与其他活动', viewport: { x: 0, y: 0, zoom: 1 } },
  nodes: [node('rule', '工作坊规则', originalRule), node('form', '报名表', '先勾选同意拍照，再报名。', 390),
    node('desk', '签到流程', '先采集登记照，再发入场码。', 740),
    ...Array.from({ length: 12 }, (_, i) => node(`other-${i}`, `另一场活动 ${i}`, '独立活动的物料和志愿者安排。', 1100 + i * 330)),
    node('offline', '纸质编号发放', oldOffline, 5200)],
  edges: [{ id: 'rule-form', from: 'rule', to: 'form' }], groups: [], metadata: {},
};

async function setup(page: Page, { unauthorizedNode, untagged, holdRevision, savedOverlap, unsupportedCandidate }: {
  unauthorizedNode?: 'rule' | 'other-0'; untagged?: boolean; holdRevision?: boolean; savedOverlap?: boolean; unsupportedCandidate?: boolean;
} = {}) {
  const inputBoard = structuredClone(board);
  if (untagged) delete inputBoard.nodes.find(node => node.id === 'offline')!.tags;
  if (savedOverlap) inputBoard.nodes[0].body = newRule;
  const collaboration: CollaborationState = { enabled: true, discoveries: [] };
  collaboration.checkedNodes = nodePrints(inputBoard);
  collaboration.checkedContext = impactProjectContext(inputBoard, collaboration);
  collaboration.checkedPrint = semanticPrint(inputBoard, collaboration);
  if (savedOverlap) {
    collaboration.discoveries = mergeDiscoveries(collaboration, [preparedDiscovery], inputBoard);
    collaboration.impactReport = { print: collaboration.checkedPrint, referenceNodeIds: ['rule'], items: [
      reviseOffline, { nodeId: 'rule', status: 'revise', reason: '旧报告错误地把规则也列为修改目标。', sourceIds: [] },
    ] };
  }
  await page.addInitScript(({ board, collaboration }) => {
    if (window.top !== window || localStorage.getItem('manual-test-seeded')) return;
    localStorage.setItem('manual-test-seeded', 'yes');
    localStorage.setItem('agentboard.config', JSON.stringify({ provider: 'local-cli', cliId: 'pi' }));
    localStorage.setItem('agentboard.sessions', JSON.stringify({ activeId: 'manual', sessions: [{ id: 'manual', title: board.board.title, board, collaboration, createdAt: 1, updatedAt: 1 }] }));
  }, { board: inputBoard, collaboration });
  await page.route('**/api/clis**', route => route.fulfill({ json: [{ id: 'pi', name: 'Pi CLI', available: true }] }));
  await page.route('**/api/agent/run/*', route => route.fulfill({ status: 204 }));
  let analyses = 0;
  let revisions = 0;
  let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/agent/run', async route => {
    const request = route.request().postDataJSON();
    if (request.purpose === 'discovery') {
      analyses++;
      const context = JSON.parse(request.userMessage.slice(request.userMessage.indexOf('\n') + 1));
      expect(context.impact.context.targets.map((node: BoardNode) => node.id)).toContain('offline');
      expect(context.nodes.find((node: BoardNode & {truncated:boolean}) => node.id === 'offline').truncated).toBe(false);
      expect(context.nodes.find((node: BoardNode) => node.id === 'offline').body).toBe(oldOffline);
      const discovery = unsupportedCandidate ? { ...preparedDiscovery, nodeIds: [...preparedDiscovery.nodeIds, 'other-0'] } : preparedDiscovery;
      const impacts = [reviseOffline];
      if (unsupportedCandidate) {
        expect(context.impact.context.targets.map((node: BoardNode) => node.id)).toContain('other-0');
        impacts.push({ nodeId: 'other-0', status: 'revise', reason: '另一项目名称相似。', sourceIds: ['other-1'] });
      }
      return route.fulfill({ contentType: 'application/x-ndjson', body: JSON.stringify({ type: 'result', text: JSON.stringify({
        type: 'discovery', understanding: '新规则要求照片自愿。', discoveries: [discovery], impacts,
      }) }) + '\n' });
    }
    revisions++;
    if (holdRevision) await gate;
    expect(request.userMessage).toContain('Reference nodes (read only): rule');
    expect(request.userMessage).toContain('Only work around the selected nodes: offline.\n');
    return route.fulfill({ contentType: 'application/x-ndjson', body: JSON.stringify({ type: 'result', text: JSON.stringify({
      type: 'dsl_patch', summary: '已准备备用流程的修订', ops: [
        { op: 'update_node', nodeId: 'offline', changes: { body: newOffline } },
        ...(unauthorizedNode ? [{ op: 'update_node', nodeId: unauthorizedNode, changes: { body: '覆盖规则' } }] : []),
      ],
    }) }) + '\n' });
  });
  await page.goto('/');
  if (!savedOverlap) {
    const rule = page.locator('[data-node-id="rule"]');
    await rule.getByText(originalRule, { exact: true }).dblclick();
    await rule.locator('textarea').fill(newRule);
    await page.locator('.current-board-title').click();
  }
  await expect(page.locator('.composer-suggestion')).toContainText('备用流程还要求留照');
  await page.getByRole('button', { name: '查看建议', exact: true }).click();
  await page.getByRole('button', { name: '同步备用流程', exact: true }).click();
  return { counts: () => ({ analyses, revisions }), release };
}

test('editing one rule leads to a scoped existing-card proposal and a single undo', async ({ page }) => {
  const calls = await setup(page);
  await page.getByRole('button', { name: '预览前后变化' }).click();
  await expect(page.locator('.review-comparison').first()).toContainText(newOffline);
  await expect(page.locator('[data-node-id="rule"]')).toContainText(newRule);
  await page.getByRole('dialog').getByRole('button', { name: '确认应用' }).click();
  await expect.poll(() => page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('agentboard.sessions')!);
    return data.sessions[0].board.nodes.find((node: BoardNode) => node.id === 'offline').body;
  })).toBe(newOffline);
  await page.locator('.patch-result-toast').getByRole('button', { name: '撤销', exact: true }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('agentboard.sessions')!).sessions[0].board.nodes.find((node: BoardNode) => node.id === 'offline').body)).toBe(oldOffline);
  await expect(page.locator('[data-node-id="rule"]')).toContainText(newRule);
  expect(calls.counts()).toEqual({ analyses: 1, revisions: 1 });
});

test('impact revisions cannot rewrite the rule used as their reference', async ({ page }) => {
  await setup(page, { unauthorizedNode: 'rule' });
  await expect(page.getByRole('button', { name: '停止生成' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '预览前后变化' })).toHaveCount(0);
  await expect(page.locator('[data-node-id="rule"]')).toContainText(newRule);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('agentboard.sessions')!).sessions[0].board.nodes.find((node: BoardNode) => node.id === 'offline').body)).toBe(oldOffline);
});

test('a saved report cannot grant write access to a rule recorded as a changed source', async ({ page }) => {
  const calls = await setup(page, { savedOverlap: true });
  await page.getByRole('button', { name: '预览前后变化' }).click();
  await expect(page.locator('.review-comparison')).toHaveCount(1);
  await expect(page.locator('.review-comparison')).toContainText(newOffline);
  await page.getByRole('dialog').getByRole('button', { name: '确认应用' }).click();
  await expect(page.locator('[data-node-id="rule"]')).toContainText(newRule);
  expect(calls.counts()).toEqual({ analyses: 0, revisions: 1 });
});

test('a refreshed proposal checks the source rule again before applying', async ({ page }) => {
  await setup(page);
  await expect(page.getByRole('button', { name: '预览前后变化' })).toBeVisible();
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('agentboard.sessions')!);
    data.sessions[0].board.nodes.find((node: BoardNode) => node.id === 'rule').body = '用户又调整了工作坊规则。';
    localStorage.setItem('agentboard.sessions', JSON.stringify(data));
  });
  await page.reload();
  await page.getByRole('button', { name: '预览前后变化' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '确认应用' }).click();
  await expect(page.getByRole('button', { name: '预览前后变化' })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('agentboard.sessions')!).sessions[0].board.nodes.find((node: BoardNode) => node.id === 'offline').body)).toBe(oldOffline);
});

test('an untagged unlinked execution card is revised while independent projects stay intact', async ({ page }) => {
  await setup(page, { untagged: true });
  await page.getByRole('button', { name: '预览前后变化' }).click();
  await expect(page.locator('.review-comparison')).toHaveCount(1);
  await page.getByRole('dialog').getByRole('button', { name: '确认应用', exact: true }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('agentboard.sessions')!).sessions[0]);
  expect(saved.board.nodes.find((node: BoardNode) => node.id === 'offline').body).toBe(newOffline);
  expect(saved.board.nodes.find((node: BoardNode) => node.id === 'other-0').body).toBe('独立活动的物料和志愿者安排。');
  expect(saved.collaboration.impactReport.coverage.unreviewedCount).toBeGreaterThan(0);
});

test('an impact revision cannot write into an independent project outside the reviewed targets', async ({ page }) => {
  await setup(page, { unauthorizedNode: 'other-0' });
  await expect(page.getByRole('button', { name: '停止生成' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '预览前后变化' })).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('agentboard.sessions')!).sessions[0]);
  expect(saved.board.nodes.find((node: BoardNode) => node.id === 'other-0').body).toBe('独立活动的物料和志愿者安排。');
});

test('an unsupported impact claim does not grant write access to an independent project', async ({ page }) => {
  await setup(page, { unsupportedCandidate: true, unauthorizedNode: 'other-0' });
  await expect(page.getByRole('status', { name: '生成恢复' })).toBeVisible();
  await expect(page.getByRole('button', { name: '预览前后变化' })).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('agentboard.sessions')!).sessions[0]);
  expect(saved.collaboration.impactReport.items).toContainEqual(expect.objectContaining({ nodeId: 'other-0', status: 'verify', sourceIds: [] }));
  expect(saved.board.nodes.find((node: BoardNode) => node.id === 'other-0').body).toBe('独立活动的物料和志愿者安排。');
});


test('a restored proposal rejects changed project constraints and retries the original request', async ({ page }) => {
  await setup(page);
  await expect(page.getByRole('button', { name: '预览前后变化' })).toBeVisible();
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('agentboard.sessions')!);
    data.sessions[0].collaboration.constraints = '更新后的条件：保留拍照自愿，使用纸质号码。';
    localStorage.setItem('agentboard.sessions', JSON.stringify(data));
  });
  await page.reload();
  await page.getByRole('button', { name: '预览前后变化' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '确认应用', exact: true }).click();
  await expect(page.getByRole('button', { name: '预览前后变化' })).toHaveCount(0);
  const current = await page.evaluate(() => JSON.parse(localStorage.getItem('agentboard.sessions')!).sessions[0].board);
  expect(current.nodes.find((node: BoardNode) => node.id === 'offline').body).toBe(oldOffline);
  const recovery = page.getByRole('status', { name: '生成恢复' });
  await expect(recovery).toBeVisible();
  await recovery.getByRole('button', { name: '重新尝试' }).click();
  await expect(page.getByRole('button', { name: '预览前后变化' })).toBeVisible();
  const runs = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('agentboard.sessions')!).sessions[0].runs));
  expect(runs).toHaveLength(1);
});


test('a project constraint changed during generation invalidates the late draft', async ({ page }) => {
  const calls = await setup(page, { holdRevision: true });
  await expect.poll(() => calls.counts().revisions).toBe(1);
  await page.getByRole('button', { name: /^历史/ }).click();
  await page.getByRole('tab', { name: 'Agent 建议' }).click();
  await page.getByText('白板分析设置', { exact: true }).click();
  await page.getByRole('button', { name: '目标与条件', exact: true }).click();
  await page.getByLabel(/受众、限制与必须保留/).fill('最新要求：纸质编号发放方式还需重新安排。');
  await page.getByRole('button', { name: '保存目标与条件', exact: true }).click();
  calls.release();
  await expect(page.getByRole('status', { name: '生成恢复' })).toBeVisible();
  await expect(page.getByRole('button', { name: '预览前后变化' })).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('agentboard.sessions')!).sessions[0]);
  expect(saved.board.nodes.find((node: BoardNode) => node.id === 'offline').body).toBe(oldOffline);
  expect(saved.collaboration.constraints).toBe('最新要求：纸质编号发放方式还需重新安排。');
});
