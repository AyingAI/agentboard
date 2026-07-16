import type { PendingAgentPatch } from '../hooks/useAgent';

const REASON_LABELS = {
  delete_node: '删除节点',
  delete_group: '删除分组',
  rewrite_content: '改写现有内容',
  full_board_layout: '重新整理整张白板',
} as const;

const OP_LABELS = {
  add_node: '新增节点',
  update_node: '修改节点',
  delete_node: '删除节点',
  add_edge: '新增连线',
  delete_edge: '删除连线',
  add_group: '新增分组',
  update_group: '修改分组',
  delete_group: '删除分组',
  layout: '布局调整',
} as const;

interface PatchProposalToastProps {
  proposal: PendingAgentPatch;
  onApply: () => void;
  onReject: () => void;
  onOpenActivity: () => void;
}

export default function PatchProposalToast({
  proposal,
  onApply,
  onReject,
  onOpenActivity,
}: PatchProposalToastProps) {
  const operations = Object.entries(proposal.risk.counts)
    .filter(([, count]) => count > 0)
    .map(([op, count]) => `${OP_LABELS[op as keyof typeof OP_LABELS]} ${count}`);

  return (
    <section className="patch-proposal-toast" aria-live="assertive" aria-label="Agent 修改等待确认">
      <div className="patch-proposal-header">
        <div>
          <div className="patch-proposal-kicker">Agent 修改提案</div>
          <h2>{proposal.patch.summary}</h2>
        </div>
        <button type="button" className="patch-proposal-detail" onClick={onOpenActivity}>
          查看详情
        </button>
      </div>

      <p>这次修改包含高风险操作，白板尚未改变。</p>

      <div className="patch-proposal-reasons">
        {proposal.risk.reasons.map((reason) => (
          <span key={reason}>{REASON_LABELS[reason]}</span>
        ))}
      </div>

      <div className="patch-proposal-counts">{operations.join(' · ')}</div>

      <div className="patch-proposal-actions">
        <button type="button" className="patch-proposal-reject" onClick={onReject}>
          放弃修改
        </button>
        <button type="button" className="patch-proposal-apply" onClick={onApply}>
          确认应用
        </button>
      </div>
    </section>
  );
}
