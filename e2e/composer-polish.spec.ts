import { test, expect, type Page } from '@playwright/test';

const node = { id: 'sample', type: 'card', title: '产品实验', body: '把想法拆成可验证的行动。', x: 80, y: 80, width: 600, height: 180,
  visual: { html: '<style>body{font:14px system-ui;padding:24px;color:#526c93;background:#fbfcff}h2{font-weight:500}input{width:100%;accent-color:#7998c1}</style><h2>让想法更进一步</h2><label for="scale">尝试不同条件</label><input id="scale" type="range" min="1" max="10" value="4">', height: 180, state: {} } };
async function start(page: Page, withNode = false) {
  await page.addInitScript(({ node, withNode }) => {
    if (window.top !== window) return;
    localStorage.setItem('agentboard.config', JSON.stringify({ provider: 'local-cli', cliId: 'pi' }));
    const board = { version: '0.1', board: { id: 'b', title: '产品共创', viewport: { x: 0, y: 0, zoom: 1 } }, nodes: withNode ? [node] : [], edges: [], groups: [], metadata: {} };
    if (!localStorage.getItem('agentboard.sessions')) localStorage.setItem('agentboard.sessions', JSON.stringify({ activeId: 's1', sessions: [
      { id: 's1', title: '产品共创', board, createdAt: 1, updatedAt: 1 },
      { id: 's2', title: '下一次实验', board: { ...board, board: { ...board.board, id: 'b2', title: '下一次实验' }, nodes: [] }, createdAt: 2, updatedAt: 2 },
    ] }));
  }, { node, withNode });
  await page.route('**/api/clis**', route => route.fulfill({ json: [{ id: 'pi', name: 'Pi CLI', available: true, version: '1.4.0' }] }));
  await page.goto('/');
}
const menu = (page: Page) => page.getByRole('dialog', { name: '切换白板', exact: true });
const openMenu = async (page: Page) => { await page.locator('.board-selector-trigger').click(); await expect(menu(page)).toBeVisible(); };

test('board deletion confirms in place, resets on dismissal and preserves the last board', async ({ page }) => {
  let dialogs = 0;
  page.on('dialog', async dialog => { dialogs++; await dialog.dismiss(); });
  await start(page);
  await openMenu(page);
  await menu(page).getByRole('button', { name: '删除白板 下一次实验', exact: true }).click();
  await expect(menu(page).getByRole('button', { name: '确认删除白板 下一次实验', exact: true })).toHaveText('确认删除');
  await expect(page.locator('.board-menu-item')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await openMenu(page);
  await expect(menu(page).getByRole('button', { name: /^确认删除白板/ })).toHaveCount(0);
  const remove = menu(page).getByRole('button', { name: '删除白板 下一次实验', exact: true });
  await remove.press('Enter');
  await menu(page).getByRole('button', { name: '确认删除白板 下一次实验', exact: true }).press('Enter');
  await expect(menu(page)).toHaveCount(0);
  await expect(page.locator('.current-board-title')).toHaveText('产品共创');
  await page.reload();
  await openMenu(page);
  await expect(page.locator('.board-menu-item')).toHaveCount(1);
  await expect(menu(page).getByRole('button', { name: /删除白板/ })).toHaveCount(0);
  expect(dialogs).toBe(0);
});

test('outside pointer actions dismiss the board menu and still activate the clicked control', async ({ page }) => {
  await start(page);
  await openMenu(page);
  await page.getByRole('textbox', { name: '描述你的想法', exact: true }).click();
  await expect(menu(page)).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: '描述你的想法', exact: true })).toBeFocused();
  await openMenu(page);
  await page.getByRole('button', { name: /^历史/ }).click();
  await expect(menu(page)).toHaveCount(0); await expect(page.locator('.activity-panel')).toBeVisible();
});

test('moving the pointer keeps the menu open, while outside wheel interaction dismisses it', async ({ page }) => {
  await start(page); await openMenu(page);
  await page.mouse.move(900, 180); await expect(menu(page)).toBeVisible();
  await page.mouse.wheel(0, 100); await expect(menu(page)).toHaveCount(0);
});

test('Escape restores the menu trigger and preserves the selected canvas object', async ({ page }) => {
  await start(page, true);
  await page.locator('[data-node-id="sample"] > h2').click();
  await openMenu(page);
  await expect(page.locator('.board-menu-item.active')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu(page)).toHaveCount(0); await expect(page.locator('.board-selector-trigger')).toBeFocused();
  await expect(page.locator('[data-node-id="sample"]')).toHaveClass(/selected/);
});

test('keyboard focus leaving the menu dismisses it and board switching still works', async ({ page }) => {
  await start(page); await openMenu(page);
  await page.getByRole('textbox', { name: '描述你的想法', exact: true }).focus();
  await expect(menu(page)).toHaveCount(0);
  await page.locator('.board-selector-trigger').focus(); await page.keyboard.press('ArrowDown');
  await expect(menu(page)).toBeVisible(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  await expect(menu(page)).toHaveCount(0); await expect(page.locator('.current-board-title')).toHaveText('下一次实验');
});

test('interacting inside a visual dismisses the host menu without blocking the control', async ({ page }) => {
  await start(page, true);
  await expect(page.locator('.visual-status i')).toHaveClass('ready');
  await openMenu(page);
  const slider = page.locator('[data-node-id="sample"]').frameLocator('iframe').locator('#scale');
  await slider.click(); await slider.press('End');
  await expect(menu(page)).toHaveCount(0); await expect(slider).toHaveValue('10');
});

test('composer has a spacious input, a clear send action and a dismissible permissions popover', async ({ page }) => {
  await start(page, true);
  await page.screenshot({ animations: 'disabled', path: 'docs/verification/composer-v034-idle.png' });
  const input = page.locator('.prompt-bar textarea');
  await expect(page.getByRole('button', { name: '展开输入', exact: true })).toBeVisible();
  expect((await input.boundingBox())!.height).toBeLessThanOrEqual(52);
  await input.click();
  await expect(page.getByRole('button', { name: '发送', exact: true })).toBeDisabled();
  expect((await input.boundingBox())!.height).toBeGreaterThanOrEqual(64);
  await input.fill('把这个想法变成一个可以比较和试验的方案');
  await expect(page.getByRole('button', { name: '发送', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '修改权限', exact: true }).click();
  const permission = page.getByRole('dialog', { name: 'Agent 修改权限', exact: true });
  await expect(permission).toBeVisible(); await expect(permission.getByLabel('修改现有内容', { exact: false })).toBeChecked();
  await permission.getByRole('checkbox', { name: /删除内容/ }).check();
  await page.screenshot({ animations: 'disabled', path: 'docs/verification/composer-v034-permissions.png' });
  await page.keyboard.press('Escape');
  await expect(permission).toHaveCount(0); await expect(page.getByRole('button', { name: '修改权限', exact: true })).toBeFocused();
  await page.getByRole('button', { name: '修改权限', exact: true }).click();
  await input.click(); await expect(permission).toHaveCount(0); await expect(input).toBeFocused();
  await expect(input).toHaveValue('把这个想法变成一个可以比较和试验的方案');
  await page.screenshot({ animations: 'disabled', path: 'docs/verification/composer-v034-writing.png' });
  await page.locator('.composer-v4').screenshot({ animations: 'disabled', path: 'docs/verification/composer-v034-detail.png' });
});

test('selected context and small screens float over a full-height canvas', async ({ page }) => {
  await start(page, true); await page.locator('[data-node-id="sample"] > h2').click();
  await page.locator('.prompt-bar textarea').click();
  await expect(page.locator('.prompt-scope-button')).toHaveText('产品实验');
  await page.screenshot({ animations: 'disabled', path: 'docs/verification/composer-v034-selection.png' });
  await page.setViewportSize({ width: 390, height: 720 });
  await page.locator('.prompt-bar textarea').fill('这是一段比较长的想法。\n希望保留足够的空间，让我可以舒服地组织内容。');
  const bounds = await page.evaluate(() => {
    const form = document.querySelector('.message-composer')!.getBoundingClientRect(), canvas = document.querySelector('.board-canvas')!.getBoundingClientRect(), dock = document.querySelector('.conversation-dock')!.getBoundingClientRect();
    return { left: form.left, right: form.right, canvasBottom: canvas.bottom, dockTop: dock.top, dockBottom: dock.bottom };
  });
  expect(bounds.left).toBeGreaterThanOrEqual(0); expect(bounds.right).toBeLessThanOrEqual(390);
  expect(bounds.canvasBottom).toBeGreaterThanOrEqual(bounds.dockBottom); expect(bounds.dockBottom).toBeLessThanOrEqual(720);
  await page.getByRole('button', { name: '修改权限', exact: true }).click();
  const popup = (await page.getByRole('dialog', { name: 'Agent 修改权限' }).boundingBox())!;
  expect(popup.x).toBeGreaterThanOrEqual(0); expect(popup.x + popup.width).toBeLessThanOrEqual(390); expect(popup.y).toBeGreaterThanOrEqual(0);
  await page.keyboard.press('Escape');
  await page.screenshot({ animations: 'disabled', path: 'docs/verification/composer-v034-mobile.png' });
});

test('composition and permission keys never send a draft, while Enter and the send button work once', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/agent/run', async route => {
    calls++;
    await route.fulfill({ contentType: 'application/x-ndjson', body: JSON.stringify({ type: 'result', text: JSON.stringify({ type: 'dsl_patch', summary: '已收到你的想法', ops: [] }) }) + '\n' });
  });
  await start(page);
  const input = page.locator('.prompt-bar textarea');
  await input.fill('先把思路写下来');
  await input.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true });
  expect(calls).toBe(0); await expect(input).toHaveValue('先把思路写下来');
  await input.press('Shift+Enter'); await expect(input).toHaveValue('先把思路写下来\n');
  await page.getByRole('button', { name: '修改权限', exact: true }).click();
  await page.keyboard.press('Enter'); expect(calls).toBe(0);
  await page.keyboard.press('Escape'); await input.focus(); await input.press('Enter');
  await expect.poll(() => calls).toBe(1); await expect(page.locator('.patch-result-toast')).toBeVisible();
  await expect(input).toHaveValue('');
  await input.fill('再继续深入一点'); await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect.poll(() => calls).toBe(2); await expect(input).toHaveValue('');
});

test('empty composer collapses on the canvas and reopens repeatedly without resizing it', async ({ page }) => {
  await start(page, true);
  const input = page.locator('.prompt-bar textarea');
  const canvasHeight = (await page.locator('.board-canvas').boundingBox())!.height;
  for (let i = 0; i < 2; i++) {
    await input.click();
    await expect(page.locator('.composer-wrapper')).toHaveClass(/is-expanded/);
    expect((await page.locator('.board-canvas').boundingBox())!.height).toBe(canvasHeight);
    await page.locator('.board-canvas').click({ position: { x: 30, y: 30 } });
    await expect(page.locator('.composer-wrapper')).toHaveClass(/is-collapsed/);
    expect((await input.boundingBox())!.height).toBeLessThanOrEqual(52);
  }
  await page.getByRole('button', { name: '展开输入', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(input).toBeFocused();
  await expect(page.locator('.composer-wrapper')).toHaveClass(/is-expanded/);
});

test('drafts survive board switching and refresh without leaking selected targets', async ({ page }) => {
  await start(page, true);
  const input = page.locator('.prompt-bar textarea');
  await input.fill('第一张白板的独立草稿');
  await page.locator('[data-node-id="sample"] > h2').click();
  await openMenu(page);
  await menu(page).getByRole('button', { name: /^下一次实验/ }).click();
  await expect(input).toHaveValue('');
  await input.fill('第二张白板的独立草稿');
  await expect(page.locator('.prompt-scope-button')).toHaveText('整张画布');
  await page.reload();
  await expect(input).toHaveValue('第二张白板的独立草稿');
  await openMenu(page);
  await menu(page).getByRole('button', { name: /^产品共创/ }).click();
  await expect(input).toHaveValue('第一张白板的独立草稿');
  await expect(page.locator('.board-node.selected')).toHaveCount(0);
  await expect(page.locator('.prompt-scope-button')).toHaveText('整张画布');
});

test('an unaccepted proposal survives reload and is removed after acceptance', async ({ page }) => {
  await page.route('**/api/agent/run', route => route.fulfill({ contentType: 'application/x-ndjson', body: JSON.stringify({ type: 'result', text: JSON.stringify({ type: 'dsl_patch', summary: '修改标题', ops: [{ op: 'update_node', nodeId: 'sample', changes: { title: '新的产品实验' } }] }) }) + '\n' }));
  await start(page, true);
  await page.locator('.prompt-bar textarea').fill('修改这个标题');
  await page.locator('.prompt-bar textarea').press('Enter');
  await expect(page.locator('.patch-proposal-toast')).toBeVisible();
  await page.locator('.prompt-bar textarea').fill('保留这个下一步草稿');
  await page.reload();
  await expect(page.locator('.patch-proposal-toast')).toBeVisible();
  await expect(page.locator('[data-node-id="sample"] > h2')).toHaveText('产品实验');
  await expect(page.locator('.prompt-bar textarea')).toHaveValue('保留这个下一步草稿');
  await page.locator('.patch-proposal-apply').click();
  await expect(page.locator('[data-node-id="sample"] > h2')).toHaveText('新的产品实验');
  await page.reload();
  await expect(page.locator('.patch-proposal-toast')).toHaveCount(0);
  await expect(page.locator('[data-node-id="sample"] > h2')).toHaveText('新的产品实验');
});
