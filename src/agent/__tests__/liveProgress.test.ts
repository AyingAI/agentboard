import { describe, expect, it } from 'vitest';
import { advanceLiveProgress, draftTitles, runPresentation, restoreRunActivities } from '../liveProgress';
import type { ActivityEntry, LiveRunProgress } from '../../types/dsl';

const live: LiveRunProgress = { provider: 'Local: pi', request: '探索一个想法', outputChars: 0, toolCount: 0, previewTitles: [], events: [] };
describe('honest live feedback', () => {
  it('reads complete titles without interpreting escaped code or partial strings', () => {
    const html = '<script>const data = {"title":"not a node"}</script>';
    expect(draftTitles('{"html":'+JSON.stringify(html)+',"title":"真实标题","next":{"title":"未完成')).toEqual(['真实标题']);
    expect(draftTitles('{"title":"引号\\\"与换行\\n标题"}')).toEqual(['引号"与换行 标题']);
  });
  it('heartbeats keep the connection fresh without inventing output or timeline entries', () => {
    const result = advanceLiveProgress(live, { type: 'heartbeat', message: 'still alive' }, 30000);
    expect(result.lastSignalAt).toBe(30000); expect(result.outputChars).toBe(0);
    expect(result.events).toEqual([]); expect(result.lastContentAt).toBeUndefined();
  });
  it('tracks real content and tool activity independently', () => {
    let value = advanceLiveProgress(live, { type: 'tool', message: '正在阅读材料' }, 1000);
    value = advanceLiveProgress(value, { type: 'output', message: '输出', outputChars: 240, previewTitles: ['方案比较'] }, 2000);
    value = advanceLiveProgress(value, { type: 'output', message: '输出', outputChars: 24 }, 3000);
    expect(value.outputChars).toBe(240); expect(value.lastContentAt).toBe(2000);
    expect(value.toolCount).toBe(1); expect(value.events[value.events.length - 1]?.label).toBe('正在构建「方案比较」');
  });
  it('distinguishes a long wait, a live connection and newly received content', () => {
    const activity: ActivityEntry = { id: 'a', kind: 'run_progress', summary: 'run', timestamp: 1, startedAt: 1, live };
    expect(runPresentation(activity, 65000).connection).toBe('等待下一次反馈');
    expect(runPresentation(activity, 65000).hint).toContain('还没有收到可展示的内容');
    expect(runPresentation({ ...activity, live: { ...live, lastSignalAt: 64000 } }, 65000).connection).toBe('连接保持中');
    expect(runPresentation({ ...activity, live: { ...live, lastSignalAt: 64000, lastContentAt: 64000, outputChars: 500 } }, 65000).connection).toBe('正在接收内容');
  });
  it('restored pending records become recoverable instead of appearing to run forever', () => {
    const items: ActivityEntry[] = [{ id: 'r', kind: 'run_progress', summary: 'working', timestamp: 1, progressStatus: 'running' }, { id: 'u', kind: 'user_message', summary: 'request', timestamp: 1 }];
    const restored = restoreRunActivities(items);
    expect(restored[0].progressStatus).toBe('failed'); expect(restored[1]).toBe(items[1]);
  });
});
