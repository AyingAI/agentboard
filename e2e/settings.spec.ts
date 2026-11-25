import { test, expect, type Page } from '@playwright/test';

function clis(version = '1.4.0') { return [
  { id: 'claude', name: 'Claude Code', available: true, version: '2.1.286 (Claude Code)', path: '/tools/claude' },
  { id: 'opencode', name: 'OpenCode', available: true, version: 'opencode v2.0.18', path: '/tools/opencode' },
  { id: 'pi', name: 'Pi CLI', available: true, version, path: version === '0.87.1' ? '/old/pi' : '/npm-global/bin/pi', installations: [
    { path: '/old/pi', realPath: '/old/pi', version: '0.87.1' },
    { path: '/npm-global/bin/pi', realPath: '/npm-global/package/pi', version: '1.4.0' },
  ] },
  { id: 'codex', name: 'Codex CLI', available: true, version: 'codex-cli 0.166.0', path: '/tools/codex' },
  { id: 'gemini', name: 'Gemini CLI', available: true, version: '0.62.0', path: '/tools/gemini' },
]; }

async function settings(page: Page, old = false) {
  await page.addInitScript(() => { if (window.top === window) localStorage.setItem('agentboard.config', JSON.stringify({ provider: 'local-cli', cliId: 'pi' })); });
  await page.route('**/api/clis**', route => route.fulfill({ json: clis(old && !route.request().url().includes('refresh=1') ? '0.87.1' : '1.4.0') }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Agent 设置', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '选择 CLI', exact: true })).toBeEnabled();
}

test('CLI menu matches settings style and persists the selected tool', async ({ page }) => {
  await settings(page);
  const picker = page.getByRole('combobox', { name: '选择 CLI', exact: true });
  await expect(picker).toContainText('Pi CLI'); await expect(picker).toContainText('1.4.0');
  await picker.click();
  await expect(page.getByRole('option', { name: /Pi CLI/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('option')).toHaveCount(5);
  await page.getByRole('option', { name: /Codex CLI/ }).click();
  await expect(picker).toContainText('Codex CLI');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('agentboard.config')!).cliId)).toBe('codex');
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('first connection selects installed Claude Code and keeps a saved alternative on reopen', async ({ page }) => {
  await page.route('**/api/clis**', route => route.fulfill({ json: clis() }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Agent 设置', exact: true }).click();
  const picker = page.getByRole('combobox', { name: '选择 CLI', exact: true });
  await expect(picker).toContainText('Claude Code');
  await picker.click();
  await expect(page.getByRole('option').first()).toContainText('Claude Code');
  await page.getByRole('option', { name: /Codex CLI/ }).click();
  await page.getByRole('button', { name: '关闭 Agent 设置' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Agent 设置', exact: true }).click();
  await expect(picker).toContainText('Codex CLI');
});

test('refresh replaces a stale version and shows the actual selected executable', async ({ page }) => {
  await settings(page, true);
  const picker = page.getByRole('combobox', { name: '选择 CLI', exact: true });
  await expect(picker).toContainText('0.87.1');
  await page.getByRole('button', { name: '重新检测', exact: true }).click();
  await expect(picker).toContainText('1.4.0');
  await page.locator('.cli-installation-details summary').click();
  await expect(page.locator('.cli-installation-details > code')).toHaveText('/npm-global/bin/pi');
});

test('keyboard navigation selects an option and Escape closes only the open menu', async ({ page }) => {
  await settings(page);
  const picker = page.getByRole('combobox', { name: '选择 CLI', exact: true });
  await picker.focus(); await picker.press('ArrowDown'); await picker.press('ArrowDown'); await picker.press('Enter');
  await expect(picker).toContainText('OpenCode');
  await picker.press('Enter'); await picker.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toBeVisible();
  await picker.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('provider and model menus share the same interaction and support search', async ({ page }) => {
  await settings(page);
  await page.getByRole('combobox', { name: '连接方式', exact: true }).click();
  await page.getByRole('option', { name: /OpenAI \/ 兼容 API/ }).click();
  await page.getByRole('combobox', { name: 'OpenAI 模型', exact: true }).click();
  await page.getByRole('combobox', { name: '搜索OpenAI 模型', exact: true }).fill('mini');
  await expect(page.getByRole('option')).toHaveCount(1);
  await page.getByRole('option', { name: 'GPT-4o Mini' }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('agentboard.config')!).model)).toBe('gpt-4o-mini');
});

test('changing the API endpoint or provider clears the previous connection key', async ({ page }) => {
  await settings(page);
  const provider = page.getByRole('combobox', { name: '连接方式', exact: true });
  await provider.click();
  await page.getByRole('option', { name: /OpenAI \/ 兼容 API/ }).click();
  const key = page.getByLabel('API Key', { exact: true });
  const address = page.getByPlaceholder('https://api.openai.com/v1');
  await address.fill('https://first-provider.example/v1');
  await key.fill('synthetic-first-key');
  await address.fill('https://first-provider.example/v1/');
  await expect(key).toHaveValue('synthetic-first-key');
  await address.fill('https://second-provider.example/v1');
  await expect(key).toHaveValue('');
  await key.fill('synthetic-second-key');
  await provider.click();
  await page.getByRole('option', { name: /Claude API/ }).click();
  await expect(key).toHaveValue('');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('agentboard.config')!).apiKey)).toBeUndefined();
});

test('menu fits a smaller viewport without clipping its options', async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 600 });
  await settings(page);
  await page.getByRole('combobox', { name: '选择 CLI', exact: true }).click();
  const bounds = await page.locator('.settings-select-popover').boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(600);
  await page.getByRole('option', { name: /Gemini CLI/ }).click();
  await expect(page.getByRole('combobox', { name: '选择 CLI', exact: true })).toContainText('Gemini CLI');
});

test('legacy jev config in localStorage is sanitized cleanly without breaking settings', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('agentboard.config', JSON.stringify({
    provider: 'local-cli',
    cliId: 'pi',
    jev: { enabled: true, apiKey: 'legacy-key', model: 'jev-latest' },
  })));
  await page.route('**/api/clis**', route => route.fulfill({ json: clis() }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Agent 设置', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '选择 CLI', exact: true })).toContainText('Pi CLI');
  await expect(page.getByText('交付前核对依据')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('agentboard.config')!).jev)).toBeUndefined();
});
