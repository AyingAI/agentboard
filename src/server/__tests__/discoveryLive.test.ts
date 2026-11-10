import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { createExplorationBoard } from '../../data/exploration';
import { buildDiscoverySystemPrompt } from '../../agent/prompts';
import { buildDiscoveryContext, parseDiscoveryResponse } from '../../agent/discoveries';
import { consumeAgentStream } from '../../agent/stream';

// Opt in against an already running dev server; uses the selected CLI's real quota.
const cli = process.env.AGENTBOARD_LIVE_DISCOVERY;
test.skipIf(!cli)('a real CLI prepares grounded discoveries for both exploration scenes', async () => {
  const base = process.env.AGENTBOARD_LIVE_URL || 'http://127.0.0.1:5173';
  const cases = [
    { kind: 'research' as const, goal: '为第一次接触城市更新的读者准备选题：老厂房改造后谁能留下来？',
      material: '验收用假设材料，并非真实采访：店主称周末客流增加；居民称不消费时可坐的公共座位减少。', constraints: '只用给定材料准备一个待验证角度，不把演示材料当真实事实。' },
    { kind: 'experience' as const, goal: '给建筑史初学者策划一次工业遗产体验',
      material: '验收用活动草案：开场 10 分钟，砖墙观察 20 分钟，屋架观察 25 分钟，拍照 20 分钟，收尾 15 分钟。转场时间尚未核实。', constraints: '原来 90 分钟，现在最多 60 分钟，必须保留屋架观察。为初学者保留亲自观察的体验。' },
  ];
  const results = [];
  for (const sample of cases) {
    const board = createExplorationBoard(sample.kind, sample.goal, sample.material);
    const snapshot = structuredClone(board);
    const requestId = crypto.randomUUID();
    const started = Date.now();
    try {
      const response = await fetch(`${base}/api/agent/run`, {
        method: 'POST', signal: AbortSignal.timeout(120_000), headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, cliId: cli, purpose: 'discovery', systemPrompt: buildDiscoverySystemPrompt(),
          userMessage: JSON.stringify(buildDiscoveryContext(board, { discoveries: [], constraints: sample.constraints })) }),
      });
      expect(response.ok).toBe(true);
      const result = parseDiscoveryResponse(await consumeAgentStream(response), board);
      expect(result.discoveries.length).toBeGreaterThan(0);
      expect(board).toEqual(snapshot);
      results.push({ scene: sample.kind, elapsedMs: Date.now() - started, result });
      console.log(`${cli} / ${sample.kind}: ${result.discoveries.length} discoveries in ${Date.now() - started}ms`);
    } finally {
      await fetch(`${base}/api/agent/run/${requestId}`, { method: 'DELETE' }).catch(() => undefined);
    }
  }
  if (process.env.AGENTBOARD_LIVE_REPORT) {
    const path = resolve(process.env.AGENTBOARD_LIVE_REPORT);
    await mkdir(resolve(path, '..'), { recursive: true });
    await writeFile(path, JSON.stringify({ cli, date: new Date().toISOString(), results }, null, 2));
  }
}, 250_000);
