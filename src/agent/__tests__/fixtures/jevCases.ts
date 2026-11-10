import { createExplorationBoard } from '../../../data/exploration';
import type { CollaborationState, DiscoveryDraft } from '../../../types/dsl';
import { mergeDiscoveries } from '../../discoveries';

const draft = (title: string, prepared: string, reason: string): DiscoveryDraft => ({ kind: 'next_step', title, prepared, reason, nodeIds: ['question', 'material-a'], action: { label: '继续完善', prompt: `继续完善：${title}` } });
export function jevCases() {
  const research = createExplorationBoard('research', '研究老厂房改造如何影响空间使用', '演示材料，不是真实采访：店主说周末客流增加；居民说不消费时能坐的公共座位减少。没有统计数据或居住记录。');
  const experience = createExplorationBoard('experience', '给初学者设计90分钟工业遗产体验', '活动草案：开场10分钟，砖墙观察20分钟，屋架观察25分钟，拍照20分钟，收尾15分钟。转场尚待核实。');
  const comparison = draft('把客流和停留条件分开比较', '待验证角度：改造后，不消费的人能否方便地休息？分别收集客流、座位开放条件和使用者观察，再决定结论。', '两种口径可以同时成立，目前只是演示材料，不能代表整个社区。');
  const rejected = draft('追踪网红打卡量', '按游客打卡照片数量评价改造是否成功。', '以社交热度为主要指标。');
  const decisions: CollaborationState = { discoveries: mergeDiscoveries({ discoveries: [] }, [rejected], research).map(d => ({ ...d, status: 'dismissed' })) };
  return [
    { id: 'research-evidence', board: research, state: { discoveries: [], constraints: '形成待验证角度，不能把演示材料当成真实证据。' } as CollaborationState,
      drafts: [draft('改造已经赶走所有原住民', '结论已确认：全市老厂房改造让所有原住民被迫搬走，可以直接作为文章的中心论点。', '店主说客流增加、居民说座位减少，这两句话充分证明了居民被迫搬迁。'), comparison], expectedFirst: 1, expectedConcerns: { 0: ['evidence', 'constraints'] } },
    { id: 'experience-duration', board: experience, state: { discoveries: [], constraints: '最新要求：最多60分钟，必须保留屋架观察。' } as CollaborationState,
      drafts: [draft('完整体验安排', '开场10分钟、砖墙20分钟、屋架25分钟、拍照20分钟、收尾15分钟，按此安排执行。', '保留完整体验内容。'), draft('60分钟候选安排', '开场5分钟、砖墙10分钟、屋架25分钟、收尾7分钟，另留13分钟给转场和机动，总计60分钟。转场待现场核实，超时优先删砖墙观察。', '保留屋架，拍照并入观察；转场预算不是已验证用时。')], expectedFirst: 1, expectedConcerns: { 0: ['constraints'] } },
    { id: 'dismissed-direction', board: research, state: decisions,
      drafts: [draft('用社交平台热度衡量更新成果', '统计游客发布的打卡照片数，将打卡数作为厂区改造成功的主要指标。', '换一个更直观的评价指标。'), comparison], expectedFirst: 1, expectedConcerns: { 0: ['repeated'] } },
    { id: 'url-is-not-evidence', board: createExplorationBoard('research', '确认厂区的免费开放时段', 'https://example.org/park-hours（仅保存网址，尚未读取页面）'), state: { discoveries: [] } as CollaborationState,
      drafts: [draft('厂区每天免费开放至22点', '已确认：厂区每天9:00–22:00免费开放，不需要预约。', '官网已经证实，可直接发布。'), draft('先核对开放信息', '待核实：开放日期、时段、预约要求与免费区域。先阅读保存的页面，再记录更新时间和原文。', '当前只有链接，不能据此确认开放信息。')], expectedFirst: 1, expectedConcerns: { 0: ['evidence'] } },
    { id: 'tentative-proposal', board: research, state: { discoveries: [] } as CollaborationState,
      drafts: [comparison], expectedFirst: 0, expectedConcerns: {} },
    { id: 'open-questions', board: experience, state: { discoveries: [], constraints: '为初学者保留亲自观察，不预设现场建筑年代。' } as CollaborationState,
      drafts: [draft('给初学者一张观察卡', '候选观察卡：画出看得见的屋架连接，区分我看见与我猜测；看不清的位置记问号。现场结构类型与年代需另行核实。', '草案只列了屋架观察时段，尚未说明参与者如何观察。')], expectedFirst: 0, expectedConcerns: {} },
    { id: 'do-not-invent-user-requirements', board: experience, state: { discoveries: [], constraints: '最多60分钟，必须保留屋架观察。' } as CollaborationState,
      drafts: [draft('屋架必须25分钟，不能调整', '将25分钟标为用户明确规定的不可压缩时长，后续禁止讨论其他时长。', '用户明确要求屋架必须持续25分钟，因此没有调整余地。'), draft('建议暂时保留25分钟', '建议先沿用草案中的25分钟屋架观察。用户只要求保留该活动，具体时长仍可讨论；全案按60分钟编排。', '保留草案时长是一种候选选择，不是用户的额外硬性要求。')], expectedFirst: 1, expectedConcerns: { 0: ['intent'] } },
  ];
}
