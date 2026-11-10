import { expect, test } from '@playwright/test';

test('local APIs reject foreign origins, rebound hosts and cross-site requests', async ({ request }) => {
  const origin = { Origin: 'https://untrusted.example' };
  for (const path of ['/api/clis', '/api/agent/run/test-run', '/api/jev/evaluate']) {
    expect((await request.get(path, { headers: origin })).status()).toBe(403);
  }
  expect((await request.post('/api/agent/run', { headers: origin, data: '{}' })).status()).toBe(403);
  expect((await request.delete('/api/agent/run/test-run', { headers: origin })).status()).toBe(403);
  expect((await request.get('/api/clis', { headers: { Host: 'untrusted.example:5173' } })).status()).toBe(403);
  expect((await request.get('/api/clis', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status()).toBe(403);

  const local = await request.get('/api/agent/run/test-run', { headers: { Origin: 'http://localhost:5173' } });
  expect(local.status()).toBe(404);
  expect(await local.json()).toEqual({ error: 'Run not found' });
});

test('local APIs validate content type and size before running agents', async ({ request }) => {
  expect((await request.post('/api/agent/run', { headers: { 'Content-Type': 'text/plain' }, data: '{}' })).status()).toBe(415);
  expect((await request.post('/api/agent/run', { headers: { 'Content-Type': 'application/json' }, data: '[' })).status()).toBe(400);
  expect((await request.post('/api/agent/run', { data: { cliId: 'pi', systemPrompt: {}, userMessage: 'test' } })).status()).toBe(400);
  expect((await request.post('/api/jev/evaluate', { data: { value: 'a'.repeat(250_000) } })).status()).toBe(413);
  expect((await request.get('/api/agent/run/%E0')).status()).toBe(400);
});
