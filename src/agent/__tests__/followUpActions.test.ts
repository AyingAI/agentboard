import { describe, expect, it } from 'vitest';
import { followUpActions, legacyActions } from '../followUpActions';
import { parseAgentResponse } from '../response';
describe('direct follow-up actions', () => {
  it('retains explicit executable alternatives and their target IDs', () => {
    const actions = [{ id: 'simple', label: '切换极简记分卡', prompt: '保留计算逻辑，只展示四个输入。', nodeIds: ['score'] }, { id: 'history', label: '增加实测历史', prompt: '增加历史记录，保留当前状态。' }];
    const parsed = parseAgentResponse(JSON.stringify({ type: 'dsl_patch', summary: '已完成', ops: [], actions }));
    expect(parsed).toHaveProperty('actions', actions); expect(followUpActions(parsed as any)).toEqual(actions);
  });
  it('splits an older A-or-B offer into independent executable requests', () => {
    const actions = legacyActions('要不要我把记分卡改成「只填 4 个数字、其他全隐藏」的极简版，或者加一个把每次实测结果存成一条历史记录、方便对比多轮的功能？');
    expect(actions).toHaveLength(2); expect(actions[0].label).toContain('极简版'); expect(actions[1].label).toContain('历史记录');
    expect(actions[1].prompt).not.toContain('极简版'); expect(actions[0].prompt).not.toContain('要不要我');
  });
  it('does not split an alternative inside a quoted label', () => { expect(legacyActions('要不要我生成「成功或者失败」的对比图？')).toHaveLength(1); });
  it('does not invent the answer to an older factual question', () => {
    const action = legacyActions('你的目标用户是谁？')[0];
    expect(action.label).toBe('给出可选方向'); expect(action.prompt).toContain('interaction_request');
  });
  it('ignores malformed actions without rejecting otherwise valid content', () => {
    expect(parseAgentResponse(JSON.stringify({ type: 'dsl_patch', summary: '回答', ops: [], actions: [{ id: 'a', label: '缺少请求' }] }))).toHaveProperty('actions', []);
  });
});
