import { expect, it } from 'vitest';
import { selectImpactTargets } from '../impactCandidates';
import type { ImpactContext } from '../../types/dsl';

const target = (id: string, body: string): ImpactContext['targets'][number] => ({ id, title: id, body, sourceIds: [], truncated: false });
const change: ImpactContext['changes'][number] = { id: 'rule', title: '工作坊招募', body: '社群工作坊拍照完全自愿。不拍照也能报名和入场。', kind: 'edited', truncated: false };

it('retains established targets and recalls an unlinked execution card beyond the limit', () => {
  const targets = [target('form', '先勾选同意拍照，再提交报名。'), target('desk', '采集登记照后发入场码。'),
    ...Array.from({ length: 20 }, (_, i) => target(`other-${i}`, '另一场活动的物料清单和轮值安排。')),
    target('offline', '社群工作坊断网时，把登记照贴到纸表后发纸质入场码。')];
  const result = selectImpactTargets(targets, [change]);
  expect(result).toHaveLength(6);
  expect(result.map(item => item.id)).toEqual(expect.arrayContaining(['form', 'desk', 'offline']));
  expect(new Set(result.map(item => item.id)).size).toBe(6);
  expect(targets[targets.length - 1].id).toBe('offline');
});

it('keeps the original limit when no changed text or no readable match exists', () => {
  const targets = Array.from({ length: 10 }, (_, i) => target(`card-${i}`, '独立项目的材料。'));
  expect(selectImpactTargets(targets, [])).toEqual(targets.slice(0, 6));
  expect(selectImpactTargets(targets, [{ ...change, title: '', body: '' }])).toEqual(targets.slice(0, 6));
});

it('matches English without expanding the number of reviewed cards', () => {
  const targets = [...Array.from({ length: 10 }, (_, i) => target(`card-${i}`, 'Separate project.')),
    target('recipient', 'Milestone alerts still go to the group mailbox.')];
  const result = selectImpactTargets(targets, [{ ...change, title: 'Milestone alerts', body: 'Notify the owner only.' }]);
  expect(result.map(item => item.id)).toContain('recipient');
  expect(result).toHaveLength(6);
});

it('preserves direct dependencies before supplementing unlinked text matches', () => {
  const linked = Array.from({ length: 6 }, (_, i) => ({ ...target(`linked-${i}`, '使用上游规则。'), sourceIds: ['rule'] }));
  const result = selectImpactTargets([...linked, target('unlinked', change.body)], [change]);
  expect(result.map(item => item.id)).toEqual(linked.map(item => item.id));
});
