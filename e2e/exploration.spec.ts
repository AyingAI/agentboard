import { expect, test } from '@playwright/test';

test('a creator starts without an Agent, collects sources, and resumes with an editable outline', async ({ page, context }) => {
  await page.route('**/api/clis', route => route.fulfill({ json: [] }));
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByRole('button', { name: /研究一个选题/ }).click();
  await page.getByLabel('这次想讲什么？').fill('谁能使用改造后的老厂房？');
  await page.getByLabel(/第一条资料/).fill('https://example.com/archive');
  await page.getByRole('button', { name: '创建我的白板' }).click();
  await expect(page.getByRole('heading', { name: '谁能使用改造后的老厂房？' })).toBeVisible();
  await expect(page.getByRole('link', { name: '打开原文' })).toHaveAttribute('href', 'https://example.com/archive');

  await page.getByRole('button', { name: /添加资料/ }).click();
  await page.getByLabel('链接、摘录或笔记').fill('居民希望保留不消费也能停留的空间。');
  await page.getByLabel(/标题/).fill('居民访谈');
  await page.getByLabel(/原文链接/).fill('https://example.com/interview');
  await page.getByRole('button', { name: '保存到白板' }).click();
  await page.getByRole('button', { name: '标记下次继续' }).click();

  await page.reload();
  await page.getByRole('button', { name: '继续：居民访谈' }).click();
  await expect(page.locator('.board-node.selected')).toContainText('居民访谈');
  await page.getByRole('button', { name: '整理选题提纲' }).click();
  const draft = page.getByRole('textbox', { name: '选题提纲' });
  await expect(draft).toHaveValue(/https:\/\/example.com\/archive/);
  await page.getByRole('radio', { name: '选中的 1 条内容及关联资料' }).check();
  await expect(draft).toHaveValue(/https:\/\/example.com\/interview/);
  await expect(draft).not.toHaveValue(/https:\/\/example.com\/archive/);
  const edited = (await draft.inputValue()) + '\n下一步：补一个对比案例。';
  await draft.fill(edited);
  await page.getByRole('button', { name: '复制 Markdown' }).click();
  await expect(page.getByRole('status')).toHaveText('已复制到剪贴板');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(edited);
});

test('a planner compares two lines of inquiry and reviews the proposal before it joins the board', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/clis', route => route.fulfill({ json: [{ id: 'codex', name: 'Codex CLI', available: true }] }));
  const requests: string[] = [];
  await page.route('**/api/agent/run', route => {
    requests.push(route.request().postDataJSON().userMessage);
    const suggestion = { id: 'rain-option', type: 'note', x: 500, y: 650, width: 260, height: 110, title: '雨天备选 · 待确认', body: '从空间观察改为室内口述故事，需核实可用场地。', tags: ['assumption'] };
    return route.fulfill({ contentType: 'application/x-ndjson', body: JSON.stringify({
      type: 'result',
      text: JSON.stringify({ type: 'dsl_patch', summary: '从两条体验线索提出一个雨天备选', ops: [{ op: 'add_node', node: suggestion }] }),
    }) + '\n' });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '查看活动策划示例' }).click();
  await expect(page.getByText('示例资料', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '整理体验方案' }).click();
  await expect(page.getByRole('textbox', { name: '体验方案' })).toHaveValue(/待核实事项/);
  await page.getByRole('button', { name: '关闭', exact: true }).click();

  await page.getByRole('button', { name: '继续探索' }).click();
  await page.getByRole('checkbox', { name: '候选体验 · 看厂房结构' }).check();
  await page.getByRole('checkbox', { name: '候选体验 · 听工人的一天' }).check();
  await page.getByLabel('想继续问什么？').fill('比较这两个方向，帮我考虑下雨时的备选。');
  await page.getByRole('button', { name: '连接 Agent', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Agent 设置' })).toBeVisible();
  await page.getByRole('combobox', { name: '选择 CLI', exact: true }).click();
  await page.getByRole('option', { name: /Codex CLI/ }).click();
  await page.getByRole('button', { name: '关闭 Agent 设置' }).click();
  await expect(page.getByLabel('想继续问什么？')).toHaveValue('比较这两个方向，帮我考虑下雨时的备选。');
  await expect(page.getByRole('checkbox', { name: '候选体验 · 看厂房结构' })).toBeChecked();

  await expect(page.getByRole('checkbox', { name: '候选体验 · 听工人的一天' })).toBeChecked();
  await page.getByRole('button', { name: '发送给 Agent' }).click();
  await expect(page.getByText('探索建议', { exact: true })).toBeVisible();
  expect(requests[0]).toContain('Only work around the selected nodes: material-a, material-b');
  expect(requests[0]).toContain('比较这两个方向');
  await expect(page.locator('[data-node-id="rain-option"]')).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('探索建议', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '确认应用' }).click();
  await expect(page.locator('[data-node-id="rain-option"]')).toHaveCount(1);
});
